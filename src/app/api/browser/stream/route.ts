import { NextRequest } from "next/server";
import { getSessionManager, homeUrlFromRequest } from "@/lib/browser/manager";
import { getBootstrapStatus } from "@/lib/browser/bootstrap";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FRAME_INTERVAL_MS = 900;

/**
 * GET /api/browser/stream?sid=…
 * Sicheres Screencast-Streaming per SSE: sendet JPEG-Frames (base64)
 * und Tab-/URL-Status an das Frontend. Nur Frames, die sich geändert
 * haben, werden übertragen.
 *
 * Während Chromium (nach einem Umgebungs-Reset) erstmalig eingerichtet
 * wird, liefert der Stream `status`-Events, damit die UI Fortschritt
 * anzeigen kann statt eines Fehlers.
 */
export async function GET(req: NextRequest) {
  const sid = new URL(req.url).searchParams.get("sid");
  if (!sid) return Response.json({ error: "sid fehlt" }, { status: 400 });

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };
      req.signal.addEventListener("abort", () => {
        closed = true;
        try {
          controller.close();
        } catch {
          /* bereits geschlossen */
        }
      });

      try {
        const manager = getSessionManager();
        const home = homeUrlFromRequest(req);

        // Session erstellen — kann beim ersten Start die Chromium-
        // Einrichtung auslösen (Binaries/Systemlibs werden installiert).
        // Währenddessen Status-Events an den Client senden.
        const statusTimer = setInterval(() => {
          const { stage } = getBootstrapStatus();
          if (stage !== "ready" && stage !== "unchecked") {
            send({ type: "status", stage });
          }
        }, 2500);
        send({ type: "status", stage: "unchecked" });

        // Session erstellen — kann beim ersten Start die Chromium-Einrichtung
        // auslösen. Bei parallelen Installs oder transienten Fehlern ein paar
        // Mal mit Pause neu versuchen, bevor ein Fehler gemeldet wird.
        let session = null;
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          if (attempt > 0) {
            send({ type: "status", stage: "retrying" });
            await new Promise((r) => setTimeout(r, 5000));
            if (closed || req.signal.aborted) return;
          }
          try {
            session = await manager.getOrCreate(sid, home);
            lastError = null;
            break;
          } catch (err) {
            lastError = err as Error;
          }
        }
        clearInterval(statusTimer);
        if (!session) throw lastError ?? new Error("Browser-Engine nicht verfügbar");
        send({ type: "status", stage: "ready" });

        let lastFrame: Buffer | null = null;
        let lastState = "";

        while (!closed && !req.signal.aborted) {
          const page = session.activePage();
          if (page && !page.isClosed()) {
            try {
              const buf = await page.screenshot({ type: "jpeg", quality: 55 });
              if (!lastFrame || !buf.equals(lastFrame)) {
                lastFrame = buf;
                send({ type: "frame", data: buf.toString("base64") });
              }
              const state = await session.state();
              const compact = {
                type: "state",
                activeTabId: state.activeTabId,
                tabs: state.tabs.map((t) => ({
                  id: t.id,
                  url: t.url,
                  title: t.title,
                  loading: t.loading,
                })),
              };
              const serialized = JSON.stringify(compact);
              if (serialized !== lastState) {
                lastState = serialized;
                send(compact);
              }
            } catch {
              // Frame kann während Navigation fehlschlagen → nächste Runde
            }
          }
          await new Promise((r) => setTimeout(r, FRAME_INTERVAL_MS));
        }
      } catch (err) {
        // Umfassende, hilfreiche Fehlermeldung inkl. Setup-Hinweis
        send({ type: "error", message: (err as Error).message });
      }
      if (!closed) {
        try {
          controller.close();
        } catch {
          /* egal */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
