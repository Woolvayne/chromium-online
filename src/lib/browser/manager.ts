import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import dns from "node:dns/promises";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { ensureChromiumReady, markBootstrapDirty, LAUNCH_ARGS } from "./bootstrap";

/**
 * Browser-Worker-Schicht: verwaltet isolierte Chromium-Sessions.
 *
 * Architektur: Diese Klasse ist bewusst vom Next.js-Code entkoppelt und kann
 * später in einen separaten Node-Prozess/Container (Browser-Worker mit API)
 * ausgelagert werden. Jede Session bekommt einen eigenen BrowserContext
 * (eigene Cookies, eigener Storage, eigene Tabs).
 */

export const VIEWPORT = { width: 1280, height: 800 };

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  loading: boolean;
}

export interface ConsoleLogEntry {
  ts: number;
  type: string;
  text: string;
}

export interface SessionState {
  sessionId: string;
  activeTabId: string;
  tabs: TabInfo[];
  ready: boolean;
}

interface TabHandle {
  id: string;
  page: Page;
  loading: boolean;
}

export class BrowserSession {
  readonly id: string;
  readonly createdAt = Date.now();
  homeUrl: string;
  context!: BrowserContext;
  tabs = new Map<string, TabHandle>();
  private tabOrder: string[] = [];
  activeTabId = "";
  lastActive = Date.now();
  consoleLogs: ConsoleLogEntry[] = [];
  /** Ringpuffer der letzten Agenten-/Browser-Ereignisse (Developer Mode). */
  eventLog: ConsoleLogEntry[] = [];

  constructor(id: string, homeUrl: string) {
    this.id = id;
    this.homeUrl = homeUrl;
  }

  touch() {
    this.lastActive = Date.now();
  }

  orderedTabs(): TabHandle[] {
    return this.tabOrder
      .map((id) => this.tabs.get(id))
      .filter((t): t is TabHandle => Boolean(t));
  }

  addTab(page: Page): TabHandle {
    const id = randomUUID().slice(0, 8);
    const tab: TabHandle = { id, page, loading: false };
    this.tabs.set(id, tab);
    this.tabOrder.push(id);
    this.activeTabId = id;

    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) tab.loading = true;
    });
    page.on("load", () => {
      tab.loading = false;
    });
    page.on("close", () => {
      this.tabs.delete(id);
      this.tabOrder = this.tabOrder.filter((t) => t !== id);
      if (this.activeTabId === id) this.activeTabId = this.tabOrder.at(-1) ?? "";
    });
    page.on("console", (msg) => {
      this.pushLog(this.consoleLogs, msg.type(), msg.text());
    });
    page.on("pageerror", (err) => {
      this.pushLog(this.consoleLogs, "pageerror", err.message);
    });
    return tab;
  }

  private pushLog(target: ConsoleLogEntry[], type: string, text: string) {
    target.push({ ts: Date.now(), type, text: text.slice(0, 500) });
    if (target.length > 100) target.shift();
  }

  active(): TabHandle | undefined {
    return this.tabs.get(this.activeTabId);
  }

  activePage(): Page | undefined {
    return this.active()?.page;
  }

  async closeTab(id: string) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    try {
      await tab.page.close();
    } catch {
      /* bereits geschlossen */
    }
    if (this.tabs.size === 0) {
      const page = await this.context.newPage();
      this.addTab(page);
      await page.goto(this.homeUrl).catch(() => undefined);
    }
  }

  async state(): Promise<SessionState> {
    const tabs: TabInfo[] = [];
    for (const tab of this.orderedTabs()) {
      let title = "";
      try {
        title = (await tab.page.title()) || "Neuer Tab";
      } catch {
        title = "Neuer Tab";
      }
      tabs.push({ id: tab.id, url: tab.page.url(), title, loading: tab.loading });
    }
    return {
      sessionId: this.id,
      activeTabId: this.activeTabId,
      tabs,
      ready: true,
    };
  }
}

class SessionManager {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private sessions = new Map<string, BrowserSession>();

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (this.launching) return this.launching;
    this.launching = (async () => {
      const launch = () =>
        chromium.launch({
          headless: process.env.BROWSER_HEADLESS !== "false",
          args: LAUNCH_ARGS,
        });
      try {
        // Stellt sicher, dass Chromium-Binaries + Systemlibs vorhanden sind
        // (richtet sie bei Bedarf selbstständig ein — s. bootstrap.ts)
        await ensureChromiumReady();
        try {
          this.browser = await launch();
        } catch (firstErr) {
          // Der Cache kann nachträglich von der Umgebung geleert worden sein:
          // 'ready' ist dann eine Lüge → Status zurücksetzen und komplett neu
          // verifizieren/installieren, danach ein zweiter Versuch.
          markBootstrapDirty();
          await ensureChromiumReady();
          this.browser = await launch();
        }
        return this.browser;
      } finally {
        this.launching = null;
      }
    })();
    return this.launching;
  }

  async getOrCreate(sessionId: string, homeUrl?: string): Promise<BrowserSession> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.touch();
      if (homeUrl) existing.homeUrl = homeUrl;
      return existing;
    }
    const browser = await this.ensureBrowser();
    const session = new BrowserSession(
      sessionId,
      homeUrl ?? "about:blank"
    );
    session.context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 WebPilotAI/1.0",
      ignoreHTTPSErrors: false,
    });
    const page = await session.context.newPage();
    session.addTab(page);
    this.sessions.set(sessionId, session);
    if (session.homeUrl !== "about:blank") {
      await page.goto(session.homeUrl, { timeout: 15_000 }).catch(() => undefined);
    }
    return session;
  }

  get(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  async destroy(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    await session.context.close().catch(() => undefined);
  }

  /** Browser-Prozess komplett neu starten (alle Sessions werden verworfen). */
  async restartBrowser() {
    const old = this.browser;
    this.browser = null;
    this.sessions.clear();
    await old?.close().catch(() => undefined);
  }

  /** Räumt inaktive Sessions auf (Standard: 30 Minuten). */
  async cleanupIdle() {
    const timeoutMin = Number(process.env.BROWSER_IDLE_TIMEOUT_MIN ?? 30);
    const cutoff = Date.now() - timeoutMin * 60_000;
    for (const [id, session] of this.sessions) {
      if (session.lastActive < cutoff) await this.destroy(id);
    }
  }
}

// Globaler Singleton (überlebt Hot-Reload in dev, shared über Route-Handler)
const globalKey = "__webpilot_session_manager__";
const cleanupKey = "__webpilot_cleanup_timer__";
const g = globalThis as unknown as Record<string, unknown>;

export function getSessionManager(): SessionManager {
  if (!g[globalKey]) {
    g[globalKey] = new SessionManager();
    if (!g[cleanupKey]) {
      const timer = setInterval(() => {
        void (g[globalKey] as SessionManager).cleanupIdle();
      }, 60_000);
      if (typeof timer.unref === "function") timer.unref();
      g[cleanupKey] = timer;
    }
  }
  return g[globalKey] as SessionManager;
}

// ---------------------------------------------------------------------------
// URL-Normalisierung + SSRF-Schutz: nur öffentliche http(s)-Ziele erlaubt.
// ---------------------------------------------------------------------------

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Leere URL");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Suchbegriff statt URL → an DuckDuckGo weiterreichen
  if (/\s/.test(trimmed) || !trimmed.includes(".")) {
    return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
  }
  return `https://${trimmed}`;
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return (
      lower === "::1" ||
      lower.startsWith("fe80:") ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower === "::"
    );
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return true;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** Prüft, ob eine URL auf das interne Netz zeigt (SSRF-Schutz). */
export async function assertPublicUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Ungültige URL");
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("Nur http(s)-URLs sind erlaubt");
  }
  const host = parsed.hostname;
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Interne Adressen sind blockiert");
    return;
  }
  try {
    const { address } = await dns.lookup(host);
    if (isPrivateIp(address)) throw new Error("Interne Adressen sind blockiert");
  } catch (err) {
    if ((err as Error).message.includes("blockiert")) throw err;
    // DNS-Fehler → Playwright gibt später eine lesbare Fehlermeldung aus
  }
}

/** Navigiert einen Tab sicher zu einer URL. */
export async function navigateTo(
  session: BrowserSession,
  url: string,
  tabId?: string
): Promise<{ url: string; title: string }> {
  const finalUrl = normalizeUrl(url);
  await assertPublicUrl(finalUrl);
  session.touch();

  let tab = tabId ? session.tabs.get(tabId) : session.active();
  if (!tab) {
    const page = await session.context.newPage();
    tab = session.addTab(page);
  }
  const response = await tab.page.goto(finalUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  if (response && response.status() >= 400) {
    throw new Error(`HTTP ${response.status()} beim Laden von ${finalUrl}`);
  }
  await tab.page.waitForTimeout(400).catch(() => undefined);
  return {
    url: tab.page.url(),
    title: await tab.page.title().catch(() => ""),
  };
}

/** Erzeugt aus dem Request-Origin die Startseiten-URL der App. */
export function homeUrlFromRequest(req: Request): string {
  try {
    return `${new URL(req.url).origin}/start`;
  } catch {
    return "about:blank";
  }
}
