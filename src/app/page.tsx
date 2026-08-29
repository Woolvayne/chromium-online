"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import TopBar from "@/components/TopBar";
import BrowserPane from "@/components/BrowserPane";
import ChatPanel from "@/components/ChatPanel";
import StatusBar from "@/components/StatusBar";
import type {
  ActivityItem,
  ApprovalItem,
  BrowserState,
  ChatMsg,
  ConsoleLog,
  UsageInfo,
} from "@/lib/client-types";

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

const LS = {
  sid: "webpilot_sid",
  autoApprove: "webpilot_auto_approve",
  autoInteract: "webpilot_auto_interact",
  dev: "webpilot_dev_mode",
} as const;

function rid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

function upsertActivity(list: ActivityItem[], item: ActivityItem): ActivityItem[] {
  const idx = list.findIndex((a) => a.id === item.id);
  if (idx === -1) return [...list, item];
  const next = [...list];
  next[idx] = item;
  return next;
}

// ---------------------------------------------------------------------------
// Hauptseite
// ---------------------------------------------------------------------------

export default function HomePage() {
  const [sid, setSid] = useState("");
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [browserState, setBrowserState] = useState<BrowserState>({ activeTabId: "", tabs: [] });
  const [connected, setConnected] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [enginePreparing, setEnginePreparing] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [sending, setSending] = useState(false);

  const [aiConfigured, setAiConfigured] = useState(false);
  const [providerStatus, setProviderStatus] = useState<{ label: string; model: string } | null>(null);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [lastUsage, setLastUsage] = useState<UsageInfo | null>(null);

  const [autoApprove, setAutoApprove] = useState(true);
  const [autoInteract, setAutoInteract] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [devLogs, setDevLogs] = useState<ConsoleLog[]>([]);
  const [mobileView, setMobileView] = useState<"browser" | "chat">("browser");
  const [chatWidth, setChatWidth] = useState(420);
  const messagesRef = useRef<ChatMsg[]>([]);
  messagesRef.current = messages;

  // --- Initialisierung aus localStorage ------------------------------------
  useEffect(() => {
    let stored = localStorage.getItem(LS.sid);
    if (!stored) {
      stored = crypto.randomUUID();
      localStorage.setItem(LS.sid, stored);
    }
    setSid(stored);
    if (localStorage.getItem(LS.autoApprove) !== null)
      setAutoApprove(localStorage.getItem(LS.autoApprove) === "1");
    if (localStorage.getItem(LS.autoInteract) !== null)
      setAutoInteract(localStorage.getItem(LS.autoInteract) === "1");
    if (localStorage.getItem(LS.dev) !== null)
      setDevMode(localStorage.getItem(LS.dev) === "1");
  }, []);

  useEffect(() => { localStorage.setItem(LS.autoApprove, autoApprove ? "1" : "0"); }, [autoApprove]);
  useEffect(() => { localStorage.setItem(LS.autoInteract, autoInteract ? "1" : "0"); }, [autoInteract]);
  useEffect(() => { localStorage.setItem(LS.dev, devMode ? "1" : "0"); }, [devMode]);

  // --- Provider-Status laden -------------------------------------------------
  const refreshConfigs = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-configs");
      const json = await res.json();
      const active = (json.configs ?? []).find((c: { isActive: boolean }) => c.isActive);
      if (active) {
        setAiConfigured(true);
        setProviderStatus({ label: active.providerLabel, model: active.model });
        setLastLatencyMs(active.lastLatencyMs ?? null);
      } else if (json.envFallbackActive) {
        setAiConfigured(true);
        setProviderStatus({ label: "Server-Standard (env)", model: "Standard-Modell" });
      } else {
        setAiConfigured(false);
        setProviderStatus(null);
      }
    } catch {
      /* Statusanzeige bleibt */
    }
  }, []);

  useEffect(() => {
    void refreshConfigs();
    const onFocus = () => void refreshConfigs();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshConfigs]);

  // --- Screencast-Stream (SSE) ----------------------------------------------
  useEffect(() => {
    if (!sid) return;
    setConnected(false);
    setFrameSrc(null);
    setEngineError(null);
    setEnginePreparing(null);
    const source = new EventSource(`/api/browser/stream?sid=${encodeURIComponent(sid)}`);
    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as {
          type: string;
          data?: string;
          message?: string;
          stage?: string;
          activeTabId?: string;
          tabs?: BrowserState["tabs"];
        };
        if (data.type === "frame" && data.data) {
          setFrameSrc(`data:image/jpeg;base64,${data.data}`);
          setConnected(true);
          setEnginePreparing(null);
        } else if (data.type === "state" && data.tabs) {
          setBrowserState({ activeTabId: data.activeTabId ?? "", tabs: data.tabs });
          setConnected(true);
        } else if (data.type === "status") {
          // Chromium-Einrichtung läuft (frische Umgebung)
          setEnginePreparing(data.stage === "ready" ? null : (data.stage ?? "unchecked"));
          if (data.stage !== "ready") setConnected(false);
        } else if (data.type === "error") {
          setEnginePreparing(null);
          setEngineError(data.message ?? "Browser-Engine nicht verfügbar");
        }
      } catch {
        /* kaputtes Event ignorieren */
      }
    };
    return () => source.close();
  }, [sid]);

  // --- Chat-Verlauf laden -----------------------------------------------------
  useEffect(() => {
    if (!sid) return;
    void (async () => {
      try {
        const res = await fetch(`/api/chat/history?sid=${encodeURIComponent(sid)}`);
        const json = (await res.json()) as {
          messages?: Array<{ id: string; role: string; content: string }>;
        };
        setMessages(
          (json.messages ?? [])
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content }))
        );
      } catch {
        /* Verlauf optional */
      }
    })();
  }, [sid]);

  // --- URL-Leiste mit aktivem Tab synchronisieren ------------------------------
  const activeTab = browserState.tabs.find((t) => t.id === browserState.activeTabId);
  const activeUrl = activeTab?.url ?? "";
  const activeTabId = browserState.activeTabId;
  useEffect(() => {
    setUrlDraft(activeUrl === "about:blank" ? "" : activeUrl);
  }, [activeUrl, activeTabId]);

  // --- Entwickler-Logs pollen --------------------------------------------------
  useEffect(() => {
    if (!devMode || !sid) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/browser/state?sid=${encodeURIComponent(sid)}&dev=1`);
        const json = await res.json();
        if (!cancelled && json.consoleLogs) setDevLogs(json.consoleLogs);
      } catch {
        /* egal */
      }
    };
    void load();
    const timer = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [devMode, sid]);

  // --- Browser-Aktionen --------------------------------------------------------
  const postAction = useCallback(
    async (action: string, extra?: Record<string, string>) => {
      try {
        const res = await fetch("/api/browser/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sid, action, ...extra }),
        });
        const json = await res.json();
        if (json.state) setBrowserState(json.state);
      } catch {
        /* Stream korrigiert den Zustand */
      }
    },
    [sid]
  );

  const navigate = useCallback(
    async (url: string) => {
      const target = url.trim();
      if (!target || !sid) return;
      setNavigating(true);
      try {
        const res = await fetch("/api/browser/navigate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sid, url: target }),
        });
        const json = await res.json();
        if (json.state) setBrowserState(json.state);
        if (json.error) {
          setMessages((prev) => [
            ...prev,
            { id: rid(), role: "assistant", content: `Navigation fehlgeschlagen: ${json.error}`, error: true },
          ]);
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { id: rid(), role: "assistant", content: `Navigation fehlgeschlagen: ${(err as Error).message}`, error: true },
        ]);
      } finally {
        setNavigating(false);
      }
    },
    [sid]
  );

  const sendInput = useCallback(
    (
      kind: "click" | "dblclick" | "text" | "key" | "scroll",
      payload: { x?: number; y?: number; text?: string; key?: string; deltaY?: number }
    ) => {
      if (!sid) return;
      void fetch("/api/browser/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sid, kind, ...payload }),
      }).catch(() => undefined);
    },
    [sid]
  );

  // --- Chat senden (SSE) --------------------------------------------------------
  const sendMessage = useCallback(
    async (text: string) => {
      if (sending || !sid) return;
      const history = messagesRef.current
        .filter((m) => !m.error)
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));
      const assistantId = rid();
      setMessages((prev) => [
        ...prev,
        { id: rid(), role: "user", content: text },
        { id: assistantId, role: "assistant", content: "", streaming: true },
      ]);
      setActivity([]);
      setSending(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sid,
            message: text,
            history,
            autoApprove,
            autoApproveInteractions: autoInteract,
          }),
        });
        if (!res.ok || !res.body) throw new Error(`Agent nicht erreichbar (HTTP ${res.status})`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const appendToken = (delta: string) =>
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m))
          );

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const line = chunk.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(line.slice(5)) as Record<string, unknown>;
            } catch {
              continue;
            }
            switch (event.type) {
              case "token":
                appendToken(String(event.delta ?? ""));
                break;
              case "activity":
                setActivity((prev) =>
                  upsertActivity(prev, {
                    id: String(event.id),
                    text: String(event.text),
                    state: event.state as ActivityItem["state"],
                  })
                );
                break;
              case "approval_request":
                setApprovals((prev) => [
                  ...prev,
                  {
                    approvalId: String(event.approvalId),
                    tool: String(event.tool),
                    description: String(event.description),
                  },
                ]);
                break;
              case "approval_resolved":
                setApprovals((prev) =>
                  prev.filter((a) => a.approvalId !== event.approvalId)
                );
                break;
              case "screenshot":
                setFrameSrc(String(event.dataUrl));
                break;
              case "done":
                if (event.usage) setLastUsage(event.usage as UsageInfo);
                break;
              case "error":
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content: m.content
                            ? `${m.content}\n\n⚠ ${String(event.message)}`
                            : String(event.message),
                          error: true,
                        }
                      : m
                  )
                );
                break;
            }
          }
        }
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Verbindungsfehler: ${(err as Error).message}`, error: true }
              : m
          )
        );
      } finally {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  streaming: false,
                  content: m.content || (m.error ? m.content : "Erledigt — Details siehe Aktivitäts-Feed."),
                }
              : m
          )
        );
        setSending(false);
      }
    },
    [sid, sending, autoApprove, autoInteract]
  );

  const respondApproval = useCallback(async (approvalId: string, approved: boolean) => {
    setApprovals((prev) => prev.filter((a) => a.approvalId !== approvalId));
    try {
      await fetch("/api/chat/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, approved }),
      });
    } catch {
      /* Abgelaufene Anfrage → Server behandelt Timeout */
    }
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setActivity([]);
    if (sid) {
      void fetch(`/api/chat/history?sid=${encodeURIComponent(sid)}`, { method: "DELETE" }).catch(
        () => undefined
      );
    }
  }, [sid]);

  const newSession = useCallback(() => {
    if (sid) {
      void fetch("/api/browser/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sid, action: "destroy" }),
      }).catch(() => undefined);
    }
    const fresh = crypto.randomUUID();
    localStorage.setItem(LS.sid, fresh);
    setMessages([]);
    setActivity([]);
    setApprovals([]);
    setBrowserState({ activeTabId: "", tabs: [] });
    setFrameSrc(null);
    setSid(fresh);
  }, [sid]);

  // --- Resizable Chat ----------------------------------------------------------
  const startDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const onMove = (ev: PointerEvent) => {
      const width = window.innerWidth - ev.clientX;
      setChatWidth(Math.min(Math.max(width, 320), Math.max(window.innerWidth - 420, 380)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  // ---------------------------------------------------------------------------
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar
        url={urlDraft}
        onUrlChange={setUrlDraft}
        onSubmitUrl={() => void navigate(urlDraft)}
        onBack={() => void postAction("back")}
        onForward={() => void postAction("forward")}
        onReload={() => void postAction("reload")}
        onHome={() => void postAction("home")}
        navigating={navigating}
        onNewSession={newSession}
        autoApprove={autoApprove}
        onToggleAutoApprove={() => setAutoApprove((v) => !v)}
        devMode={devMode}
        onToggleDevMode={() => setDevMode((v) => !v)}
        mobileView={mobileView}
        onMobileViewChange={setMobileView}
      />

      <main className="flex min-h-0 flex-1">
        {/* Browser-Bereich */}
        <div className={`min-w-0 flex-1 flex-col ${mobileView === "browser" ? "flex" : "hidden"} lg:flex`}>
          <BrowserPane
            frameSrc={frameSrc}
            state={browserState}
            connected={connected}
            engineError={engineError}
            enginePreparing={enginePreparing}
            navigating={navigating}
            onSwitchTab={(tabId) => void postAction("switch-tab", { tabId })}
            onCloseTab={(tabId) => void postAction("close-tab", { tabId })}
            onNewTab={() => void postAction("new-tab")}
            onInput={sendInput}
          />
        </div>

        {/* Drag-Teiler (Desktop) */}
        <div
          onPointerDown={startDrag}
          className="hidden w-[5px] shrink-0 cursor-col-resize bg-edge/50 transition-colors hover:bg-accent/60 lg:block"
          title="Breite anpassen"
        />

        {/* Chat-Bereich */}
        <div
          className={`min-h-0 shrink-0 flex-col ${mobileView === "chat" ? "flex" : "hidden"} w-full lg:flex lg:w-[var(--chat-w)]`}
          style={{ "--chat-w": `${chatWidth}px` } as React.CSSProperties}
        >
          <ChatPanel
            messages={messages}
            activity={activity}
            approvals={approvals}
            sending={sending}
            providerStatus={providerStatus}
            aiConfigured={aiConfigured}
            autoApprove={autoApprove}
            autoInteract={autoInteract}
            onToggleAutoApprove={() => setAutoApprove((v) => !v)}
            onToggleAutoInteract={() => setAutoInteract((v) => !v)}
            onSend={(text) => void sendMessage(text)}
            onApproval={(id, ok) => void respondApproval(id, ok)}
            onClearChat={clearChat}
            devMode={devMode}
            devLogs={devLogs}
            lastUsage={lastUsage}
            lastLatencyMs={lastLatencyMs}
          />
        </div>
      </main>

      <StatusBar
        browserConnected={connected}
        aiConfigured={aiConfigured}
        sessionId={sid}
        providerStatus={providerStatus}
      />
    </div>
  );
}
