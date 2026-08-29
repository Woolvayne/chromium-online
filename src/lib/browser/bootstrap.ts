import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Selbstheilender Chromium-Bootstrap.
 *
 * Problem: In frisch provisionierten Umgebungen (neuer Container, Sandbox-
 * Rebuilds) fehlen die Playwright-Browser-Binaries und teilweise auch die
 * Systembibliotheken. Statt mit „Browser-Engine nicht verfügbar" zu sterben,
 * richtet diese Funktion Chromium beim ersten Bedarf automatisch ein:
 *
 *   1. Schneller Probe-Launch          → fertig, wenn er klappt
 *   2. `playwright install chromium`   → Browser-Binaries nachladen
 *   3. `playwright install-deps`       → Systemlibs (apt, braucht root)
 *
 * Wichtig: Next.js lädt instrumentierung und Route-Handler teilweise als
 * getrennte Modul-Instanzen/Prozesse. Damit nicht zwei Instanzen parallel
 * installieren (apt-Lock-Konflikt!), synchronisiert ein Dateisystem-Lock
 * in tmpdir() — prozess- und instanzübergreifend.
 */

export type BootstrapStage =
  | "unchecked"
  | "installing-browsers"
  | "installing-deps"
  | "ready"
  | "failed";

export const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-blink-features=AutomationControlled",
];

const LOCK_DIR = join(tmpdir(), "webpilot-chromium-bootstrap.lock");
const LOCK_STAMP = join(LOCK_DIR, "stamp");
const LOCK_STALE_MS = 15 * 60_000; // nach 15 Min gilt ein Lock als verwaist
const LOCK_WAIT_MS = 12 * 60_000; // so lange wartet eine Instanz maximal

let stage: BootstrapStage = "unchecked";
let detail = "";
let inFlight: Promise<void> | null = null;

const execFileAsync = promisify(execFile);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function getBootstrapStatus(): { stage: BootstrapStage; detail: string } {
  return { stage, detail };
}

/**
 * Markiert den Bootstrap-Zustand als ungeprüft. WICHTIG für Umgebungen, in
 * denen der Browser-Cache nachträglich gelöscht wird: Sonst bleibt der
 * (dann falsche) 'ready'-Zustand gespeichert und jeder Launch schlägt fehl.
 * Wird vom Session-Manager aufgerufen, wenn chromium.launch() fehlschlägt.
 */
export function markBootstrapDirty(): void {
  if (stage === "ready") {
    console.warn("[WebPilot] Chromium-Launch trotz 'ready' fehlgeschlagen — prüfe Installation neu.");
    stage = "unchecked";
  }
}

function short(err: unknown): string {
  return ((err as Error)?.message ?? String(err)).slice(0, 400);
}

// --------------------------------------------------------------------------
// Dateisystem-Lock (prozessübergreifend)
// --------------------------------------------------------------------------

function tryAcquireLock(): boolean {
  try {
    mkdirSync(LOCK_DIR);
    writeFileSync(LOCK_STAMP, String(Date.now()));
    return true;
  } catch {
    // Verwaisten Lock aufräumen (Prozess ist mitten im Install abgestürzt)
    try {
      const stamp = Number(readFileSync(LOCK_STAMP, "utf8"));
      if (Number.isFinite(stamp) && Date.now() - stamp > LOCK_STALE_MS) {
        rmSync(LOCK_DIR, { recursive: true, force: true });
      }
    } catch {
      /* ignorieren */
    }
    return false;
  }
}

function releaseLock(): void {
  rmSync(LOCK_DIR, { recursive: true, force: true });
}

async function acquireLockWithWait(): Promise<boolean> {
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    if (tryAcquireLock()) return true;
    await sleep(2000);
  }
  return false;
}

// --------------------------------------------------------------------------
// Chromium-Prüfung & Installation
// --------------------------------------------------------------------------

/** Startet Chromium kurz und schließt ihn wieder → prüft Binaries + Systemlibs. */
async function probeLaunch(): Promise<void> {
  const browser = await chromium.launch({
    headless: process.env.BROWSER_HEADLESS !== "false",
    args: LAUNCH_ARGS,
    timeout: 20_000,
  });
  await browser.close();
}

/** Pfad zur lokal installierten Playwright-CLI (ohne npx-Auflösung). */
function localCli(): string | null {
  const candidate = join(process.cwd(), "node_modules", "playwright", "cli.js");
  return existsSync(candidate) ? candidate : null;
}

async function runInstaller(args: string[]): Promise<void> {
  const started = Date.now();
  const cli = localCli();
  const [cmd, cmdArgs]: [string, string[]] = cli
    ? [process.execPath, [cli, ...args]]
    : ["npx", ["playwright", ...args]];
  const { stdout, stderr } = await execFileAsync(cmd, cmdArgs, {
    timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
    env: process.env,
  });
  detail = `${stdout}\n${stderr}`.slice(-1500);
  console.log(
    `[WebPilot] playwright ${args.join(" ")} abgeschlossen (${Math.round((Date.now() - started) / 1000)}s)`
  );
}

/**
 * Stellt sicher, dass Chromium startklar ist. Mehrfachaufrufe derselben
 * Instanz teilen sich ein Promise; konkurrierende Instanzen/Prozesse werden
 * über das FS-Lock serialisiert und re-proben danach.
 */
export function ensureChromiumReady(): Promise<void> {
  if (stage === "ready") return Promise.resolve();
  if (inFlight) return inFlight;

  inFlight = (async () => {
    // Schnellpfad ohne Lock — meistens ist bereits alles installiert
    try {
      await probeLaunch();
      stage = "ready";
      return;
    } catch (err) {
      detail = short(err);
    }

    let lastError = "";
    for (let round = 0; round < 3; round++) {
      // Auf ggf. laufende Installation einer anderen Instanz warten
      const gotLock = await acquireLockWithWait();
      if (!gotLock) {
        lastError = "Zeitüberschreitung beim Warten auf die Chromium-Einrichtung";
        break;
      }

      // Lock-Stempel während langer Downloads aktuell halten
      const heartbeat = setInterval(() => {
        try {
          writeFileSync(LOCK_STAMP, String(Date.now()));
        } catch {
          /* Lock evtl. schon weg */
        }
      }, 15_000);

      try {
        // Evtl. war die andere Instanz schneller fertig
        try {
          await probeLaunch();
          stage = "ready";
          return;
        } catch {
          /* noch nicht bereit */
        }

        console.warn(
          "[WebPilot] Chromium fehlt — starte automatische Einrichtung (einmalig, kann einige Minuten dauern) …"
        );
        stage = "installing-browsers";
        await runInstaller(["install", "chromium"]).catch((e) => {
          lastError = short(e);
        });
        try {
          await probeLaunch();
          stage = "ready";
          return;
        } catch (err) {
          lastError = short(err);
        }

        stage = "installing-deps";
        await runInstaller(["install-deps", "chromium"]).catch((e) => {
          lastError = short(e);
        });
        try {
          await probeLaunch();
          stage = "ready";
          return;
        } catch (err) {
          lastError = short(err);
        }
      } finally {
        clearInterval(heartbeat);
        releaseLock();
      }
    }

    stage = "failed";
    detail = lastError;
    throw new Error(
      "Chromium konnte nicht eingerichtet werden. Bitte auf dem Server ausführen: " +
        "npx playwright install --with-deps chromium. " +
        (lastError ? `Details: ${lastError.split("\n").slice(-3).join(" | ")}` : "")
    );
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Startet die Einrichtung im Hintergrund (z. B. beim Server-Boot). */
export function kickOffBootstrap(): void {
  if (stage === "ready" || inFlight) return;
  void ensureChromiumReady().catch((err) =>
    console.error("[WebPilot] Browser-Bootstrap fehlgeschlagen:", (err as Error).message)
  );
}
