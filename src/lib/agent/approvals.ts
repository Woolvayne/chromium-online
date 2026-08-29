import { randomUUID } from "node:crypto";

/**
 * Pending-Approval-Store: Wenn der Agent eine bestätigungspflichtige
 * Aktion ausführen möchte, hält er die laufende SSE-Antwort offen und wartet
 * hier auf die Entscheidung der Nutzerin / des Nutzers (POST /api/chat/approve).
 */

type ResolveFn = (approved: boolean) => void;

interface PendingApproval {
  resolve: ResolveFn;
  timer: NodeJS.Timeout;
}

const g = globalThis as unknown as { __webpilot_pending_approvals?: Map<string, PendingApproval> };

function store(): Map<string, PendingApproval> {
  if (!g.__webpilot_pending_approvals) {
    g.__webpilot_pending_approvals = new Map();
  }
  return g.__webpilot_pending_approvals;
}

/** Erzeugt eine Approval-Anfrage und wartet (max. timeoutMs) auf Entscheidung. */
export function requestApproval(timeoutMs = 120_000): { id: string; decision: Promise<boolean> } {
  const id = randomUUID();
  let resolveRef: ResolveFn = () => undefined;
  const decision = new Promise<boolean>((resolve) => {
    resolveRef = resolve;
  });
  const timer = setTimeout(() => {
    if (store().delete(id)) resolveRef(false); // Timeout → automatisch ablehnen
  }, timeoutMs);
  if (typeof timer.unref === "function") timer.unref();
  store().set(id, { resolve: resolveRef, timer });
  return {
    id,
    decision: decision.finally(() => {
      clearTimeout(timer);
      store().delete(id);
    }),
  };
}

/** Löst eine offene Anfrage auf. Liefert false, wenn unbekannt/abgelaufen. */
export function resolveApproval(id: string, approved: boolean): boolean {
  const pending = store().get(id);
  if (!pending) return false;
  clearTimeout(pending.timer);
  store().delete(id);
  pending.resolve(approved);
  return true;
}
