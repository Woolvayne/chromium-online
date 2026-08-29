import { NextRequest } from "next/server";
import { db } from "@/db";
import { chatMessages } from "@/db/schema";
import { getSessionManager, homeUrlFromRequest } from "@/lib/browser/manager";
import { getActiveProviderConfig } from "@/lib/ai/config-store";
import { createProvider, PROVIDERS } from "@/lib/ai/registry";
import { runAgent, type AgentEvent } from "@/lib/agent/loop";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ChatBody {
  sid?: string;
  message?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  autoApprove?: boolean;
  autoApproveInteractions?: boolean;
}

/**
 * POST /api/chat — Agenten-Endpunkt mit SSE-Streaming.
 * Events: activity | token | approval_request | approval_resolved |
 *         screenshot | done | error
 */
export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return Response.json({ error: "Ungültiger Request-Body" }, { status: 400 });
  }
  if (!body.sid || !body.message?.trim()) {
    return Response.json({ error: "sid und message erforderlich" }, { status: 400 });
  }
  const sid = body.sid;
  const userMessage = body.message.trim().slice(0, 8000);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        const config = await getActiveProviderConfig();
        if (!config || !config.model) {
          emit({
            type: "error",
            message:
              "Kein KI-Anbieter konfiguriert. Öffne Einstellungen → KI-Anbieter, lege einen Provider mit API-Key an und aktiviere ihn.",
          });
          return;
        }
        const provider = createProvider(config);
        const session = await getSessionManager().getOrCreate(sid, homeUrlFromRequest(req));

        // Verlauf in DB persistieren (User-Nachricht)
        try {
          await db.insert(chatMessages).values({
            sessionId: sid,
            role: "user",
            content: userMessage,
          });
        } catch {
          /* Persistenz ist optional */
        }

        const { finalText, usage } = await runAgent(
          {
            provider,
            model: config.model,
            providerLabel: PROVIDERS[config.provider]?.label ?? config.provider,
            session,
            userMessage,
            history: (body.history ?? []).slice(-20),
            autoApprove: Boolean(body.autoApprove),
            autoApproveInteractions: Boolean(body.autoApproveInteractions),
          },
          emit
        );

        try {
          await db.insert(chatMessages).values({
            sessionId: sid,
            role: "assistant",
            content: finalText || "—",
            meta: usage ? { usage } : null,
          });
        } catch {
          /* optional */
        }
      } catch (err) {
        emit({ type: "error", message: (err as Error).message.slice(0, 500) });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* egal */
          }
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
