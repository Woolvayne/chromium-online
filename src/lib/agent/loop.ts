import type { AIProvider, ChatMessage, UsageInfo } from "@/lib/ai/types";
import {
  BROWSER_TOOLS,
  describeAction,
  executeBrowserTool,
  riskOf,
} from "@/lib/browser/tools";
import type { BrowserSession } from "@/lib/browser/manager";
import { requestApproval } from "./approvals";

/**
 * Agenten-Loop: Der klassische ReAct-Zyklus
 *   LLM-Antwort → Tool-Calls? → (Bestätigung) → Tool ausführen → Ergebnis
 *   zurück ans LLM → … → finales Streaming der Antwort an den Nutzer.
 *
 * Alle Ereignisse werden über `emit` als SSE-Events an das Frontend gestreamt,
 * damit der Activity-Feed live mitläuft.
 */

export type AgentEvent =
  | { type: "activity"; id: string; text: string; state: "running" | "done" | "error" }
  | { type: "token"; delta: string }
  | { type: "approval_request"; approvalId: string; tool: string; description: string; argsPreview: string }
  | { type: "approval_resolved"; approvalId: string; approved: boolean }
  | { type: "screenshot"; dataUrl: string }
  | { type: "done"; usage?: UsageInfo; iterations: number }
  | { type: "error"; message: string };

export interface AgentOptions {
  provider: AIProvider;
  model: string;
  providerLabel: string;
  session: BrowserSession;
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  /** true = Navigation/Lesen automatisch erlauben */
  autoApprove: boolean;
  /** true = auch Klicks/Eingaben ohne Nachfrage (Vorsicht!) */
  autoApproveInteractions: boolean;
  maxIterations?: number;
}

const MAX_TOOL_DATA_CHARS = 7000;

function systemPrompt(pageUrl: string, pageTitle: string): string {
  return `Du bist WebPilot AI, ein KI-Agent mit eigenem Webbrowser. Du hilfst der Nutzerin bzw. dem Nutzer beim Recherchieren, Zusammenfassen und Erledigen von Browser-Aufgaben — alles in einer gemeinsamen Browser-Sitzung.

AKTUELLER BROWSER-KONTEXT:
- URL: ${pageUrl}
- Titel: ${pageTitle}

REGELN:
1. Antworte immer auf Deutsch, präzise und gut strukturiert (Markdown mit Überschriften/Listen, wenn sinnvoll).
2. Nutze deine Browser-Tools, wenn eine Aufgabe Webseiten betrifft. Arbeite schrittweise: erst Seite öffnen, dann Inhalt lesen (get_page_text), dann handeln.
3. Frage NIEMALS nach Erlaubnis im Klartext — bestätigungspflichtige Aktionen werden dem Nutzer automatisch zur Genehmigung vorgelegt.
4. Klicke nur, wenn nötig. Kaufe nichts, sende keine Formulare mit persönlichen Daten ab und lösche nichts, außer der Nutzer hat das explizit schriftlich angeordnet.
5. Nach jeder Navigation: Prüfe mit get_page_text oder get_interactive_elements den aktuellen Stand, bevor du weitermachst.
6. Wenn ein Tool fehlschlägt, versuche eine Alternative (z. B. anderen Selektor oder direkte URL).
7. Du siehst nur die aktive Browser-Session — du hast keinen Zugriff auf andere Daten.
8. Wenn die Aufgabe erledigt ist, fasse das Ergebnis klar zusammen und nenne die Quellen (URLs).`;
}

export async function runAgent(
  opts: AgentOptions,
  emit: (event: AgentEvent) => void
): Promise<{ finalText: string; usage?: UsageInfo }> {
  const maxIterations = opts.maxIterations ?? 10;
  let activityCounter = 0;
  const activity = (text: string, state: "running" | "done" | "error" = "running") => {
    const id = `a${Date.now()}_${activityCounter++}`;
    emit({ type: "activity", id, text, state });
    return id;
  };

  const page = opts.session.activePage();
  const [pageUrl, pageTitle] = page
    ? [page.url(), await page.title().catch(() => "")]
    : ["about:blank", ""];

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(pageUrl, pageTitle) },
    ...opts.history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: opts.userMessage },
  ];

  let totalUsage: UsageInfo | undefined;
  let finalText = "";
  const tools = BROWSER_TOOLS.map((t) => t.definition);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const result = await opts.provider.chat(
      { model: opts.model, messages, tools },
      (delta) => {
        finalText += delta;
        emit({ type: "token", delta });
      }
    );
    if (result.usage) {
      totalUsage = {
        promptTokens: (totalUsage?.promptTokens ?? 0) + (result.usage.promptTokens ?? 0),
        completionTokens: (totalUsage?.completionTokens ?? 0) + (result.usage.completionTokens ?? 0),
        totalTokens: (totalUsage?.totalTokens ?? 0) + (result.usage.totalTokens ?? 0),
      };
    }

    // Kein Tool-Call → endgültige Antwort gestreamt, Loop beenden
    if (result.toolCalls.length === 0) {
      emit({ type: "done", usage: totalUsage, iterations: iteration + 1 });
      return { finalText: result.content || finalText, usage: totalUsage };
    }

    // Assistant-Nachricht mit Tool-Calls in den Verlauf
    messages.push({
      role: "assistant",
      content: result.content || null,
      tool_calls: result.toolCalls,
    });

    // Nach Tool-Aktionen kann die Seite gewechselt haben → Systemkontext aktualisieren
    const activePage = opts.session.activePage();
    if (activePage) {
      messages[0] = {
        role: "system",
        content: systemPrompt(activePage.url(), await activePage.title().catch(() => "")),
      };
    }

    for (const call of result.toolCalls) {
      const toolName = call.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        args = {};
      }
      const risk = riskOf(toolName);
      const description = describeAction(toolName, args);

      // --- Berechtigungsprüfung ---
      const needsApproval =
        risk === "interact"
          ? !opts.autoApproveInteractions
          : risk === "navigate"
            ? !opts.autoApprove
            : false;

      if (needsApproval) {
        activity(`Warte auf Bestätigung: ${description}`);
        const { id, decision } = requestApproval();
        emit({
          type: "approval_request",
          approvalId: id,
          tool: toolName,
          description,
          argsPreview: JSON.stringify(args).slice(0, 400),
        });
        const approved = await decision;
        emit({ type: "approval_resolved", approvalId: id, approved });
        if (!approved) {
          activity(`Abgelehnt: ${description}`, "error");
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: toolName,
            content:
              "Die Nutzerin / der Nutzer hat diese Aktion ABGELEHNT. Fahre ohne sie fort oder frage nach einer Alternative.",
          });
          continue;
        }
      }

      // --- Tool ausführen ---
      const actId = activity(description);
      const toolResult = await executeBrowserTool(opts.session, toolName, args);
      emit({
        type: "activity",
        id: actId,
        text: toolResult.summary,
        state: toolResult.ok ? "done" : "error",
      });

      // Screenshot nach Aktionen live an den Client pushen
      const shotPage = opts.session.activePage();
      if (shotPage && ["navigate", "click_element", "type_text", "go_back", "take_screenshot", "scroll", "reload_page"].includes(toolName)) {
        try {
          const buf = await shotPage.screenshot({ type: "jpeg", quality: 60 });
          emit({ type: "screenshot", dataUrl: `data:image/jpeg;base64,${buf.toString("base64")}` });
        } catch {
          /* Screenshot optional */
        }
      }

      let dataText =
        toolResult.data === undefined
          ? ""
          : typeof toolResult.data === "string"
            ? toolResult.data
            : JSON.stringify(toolResult.data, null, 1);
      if (dataText.length > MAX_TOOL_DATA_CHARS) {
        dataText = `${dataText.slice(0, MAX_TOOL_DATA_CHARS)}\n… [gekürzt]`;
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: toolName,
        content: `${toolResult.ok ? "ERFOLG" : "FEHLER"}: ${toolResult.summary}${dataText ? `\n\n${dataText}` : ""}`,
      });
    }
  }

  const fallback =
    "Ich habe die maximale Anzahl an Schritten erreicht. Bitte formuliere die Aufgabe konkreter oder in kleineren Teilschritten.";
  emit({ type: "error", message: fallback });
  return { finalText: finalText || fallback, usage: totalUsage };
}
