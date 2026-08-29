"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUp,
  Check,
  ChevronDown,
  Globe,
  Hand,
  Link2,
  ListTree,
  Loader2,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import type {
  ActivityItem,
  ApprovalItem,
  ChatMsg,
  ConsoleLog,
  UsageInfo,
} from "@/lib/client-types";

// ---------------------------------------------------------------------------
// Mini-Markdown-Renderer (fett, code, Blöcke, Listen, Überschriften, Links)
// ---------------------------------------------------------------------------

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex =
    /(\*\*[^*]+\*\*)|(`[^`]+`)|(\[[^\]]+\]\(https?:\/\/[^)\s]+\))|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`${keyPrefix}b${i}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={`${keyPrefix}c${i}`}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      const url = token.slice(token.indexOf("(") + 1, -1);
      nodes.push(
        <a key={`${keyPrefix}a${i}`} href={url} target="_blank" rel="noreferrer">
          {label}
        </a>
      );
    } else {
      nodes.push(
        <a key={`${keyPrefix}u${i}`} href={token} target="_blank" rel="noreferrer">
          {token.length > 48 ? `${token.slice(0, 48)}…` : token}
        </a>
      );
    }
    last = match.index + token.length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre key={key++}>
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)/);
    if (heading) {
      const level = heading[1].length;
      const Tag = (`h${level}`) as "h1" | "h2" | "h3";
      blocks.push(<Tag key={key++}>{renderInline(heading[2], `h${key}`)}</Tag>);
      i += 1;
      continue;
    }
    if (/^\s*[-•*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-•*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-•*]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul key={key++}>
          {items.map((item, j) => (
            <li key={j}>{renderInline(item, `ul${key}_${j}`)}</li>
          ))}
        </ul>
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ol key={key++}>
          {items.map((item, j) => (
            <li key={j}>{renderInline(item, `ol${key}_${j}`)}</li>
          ))}
        </ol>
      );
      continue;
    }
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    blocks.push(<p key={key++}>{renderInline(line, `p${key}`)}</p>);
    i += 1;
  }
  return <div className="chat-md text-[13.5px] leading-relaxed">{blocks}</div>;
}

// ---------------------------------------------------------------------------
// Sub-Komponenten
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
  label,
  danger,
  title,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onChange}
      title={title}
      className="flex items-center gap-1.5 text-[11px] text-mist transition hover:text-zinc-200"
    >
      <span
        className={`relative h-4 w-7 rounded-full transition ${
          checked ? (danger ? "bg-gold/70" : "bg-accent") : "bg-white/[0.12]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
            checked ? "left-3.5" : "left-0.5"
          }`}
        />
      </span>
      {label}
    </button>
  );
}

const QUICK_ACTIONS = [
  { icon: ScanSearch, label: "Seite zusammenfassen", prompt: "Lies die aktuell geöffnete Seite und fasse sie gut strukturiert auf Deutsch zusammen." },
  { icon: Link2, label: "Links der Seite", prompt: "Liste die wichtigsten Links der aktuellen Seite auf." },
  { icon: ListTree, label: "Interaktive Elemente", prompt: "Zeige mir, welche Buttons, Links und Eingabefelder die aktuelle Seite hat." },
  { icon: Wand2, label: "Recherche starten", prompt: "Recherchiere im Web nach dem aktuellen Thema dieser Seite und ergänze 3 interessante Fakten mit Quellen." },
];

// ---------------------------------------------------------------------------
// Haupt-Komponente
// ---------------------------------------------------------------------------

interface ChatPanelProps {
  messages: ChatMsg[];
  activity: ActivityItem[];
  approvals: ApprovalItem[];
  sending: boolean;
  providerStatus: { label: string; model: string } | null;
  aiConfigured: boolean;
  autoApprove: boolean;
  autoInteract: boolean;
  onToggleAutoApprove: () => void;
  onToggleAutoInteract: () => void;
  onSend: (text: string) => void;
  onApproval: (approvalId: string, approved: boolean) => void;
  onClearChat: () => void;
  devMode: boolean;
  devLogs: ConsoleLog[];
  lastUsage: UsageInfo | null;
  lastLatencyMs: number | null;
}

export default function ChatPanel(props: ChatPanelProps) {
  const {
    messages,
    activity,
    approvals,
    sending,
    providerStatus,
    aiConfigured,
    autoApprove,
    autoInteract,
  } = props;
  const [input, setInput] = useState("");
  const [activityOpen, setActivityOpen] = useState(true);
  const [devOpen, setDevOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-Scroll bei neuen Inhalten
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activity, approvals]);

  // Activity-Feed während des Sendens automatisch öffnen
  useEffect(() => {
    if (sending) setActivityOpen(true);
  }, [sending]);

  const submit = () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    props.onSend(text);
    textareaRef.current?.focus();
  };

  const busyActivity = activity.filter((a) => a.state === "running").length;

  return (
    <section className="glass flex h-full min-h-0 flex-col border-l border-edge bg-carbon/40">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-edge px-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#6e6bf8]/25 to-[#a78bfa]/25 ring-1 ring-accent/30">
            <Sparkles className="h-3.5 w-3.5 text-accent-2" />
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-white">WebPilot Agent</div>
            <div className="text-[10.5px] text-mist">
              {aiConfigured && providerStatus
                ? `${providerStatus.label} · ${providerStatus.model}`
                : "Kein Anbieter konfiguriert"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {sending && (
            <span className="mr-1 flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10.5px] font-medium text-[#b3b1ff] ring-1 ring-accent/30">
              <Loader2 className="h-3 w-3 animate-spin" />
              arbeitet
            </span>
          )}
          <button
            onClick={props.onClearChat}
            title="Chat leeren"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-mist transition hover:bg-white/[0.06] hover:text-white"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Berechtigungen */}
      <div className="flex shrink-0 items-center gap-4 border-b border-edge/70 bg-graphite/30 px-3.5 py-1.5">
        <span className="flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wider text-zinc-500">
          <ShieldCheck className="h-3 w-3" />
          Freigaben
        </span>
        <Toggle
          checked={autoApprove}
          onChange={props.onToggleAutoApprove}
          label="Navigation"
          title="Lesen & Navigation ohne Rückfrage erlauben"
        />
        <Toggle
          checked={autoInteract}
          onChange={props.onToggleAutoInteract}
          label="Interaktionen"
          danger
          title="Auch Klicks & Texteingaben automatisch erlauben (Vorsicht)"
        />
      </div>

      {/* Nachrichten */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4">
        {messages.length === 0 && !sending && (
          <div className="anim-fade-up flex h-full flex-col items-center justify-center gap-5 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6e6bf8] to-[#a78bfa] shadow-[0_10px_36px_-8px_rgba(110,107,248,0.6)]">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-white">Wie kann ich helfen?</p>
              <p className="mx-auto mt-1.5 max-w-64 text-[12.5px] leading-relaxed text-mist">
                Ich sehe den geöffneten Browser-Tab und kann für dich surfen,
                recherchieren, zusammenfassen und Aufgaben erledigen.
              </p>
            </div>
            {!aiConfigured && (
              <Link
                href="/settings"
                className="anim-pop flex items-center gap-2 rounded-xl bg-accent/15 px-3.5 py-2 text-xs font-medium text-[#b3b1ff] ring-1 ring-accent/40 transition hover:bg-accent/25"
              >
                <Zap className="h-3.5 w-3.5" />
                Zuerst KI-Anbieter einrichten →
              </Link>
            )}
            <div className="grid w-full max-w-72 grid-cols-1 gap-2">
              {QUICK_ACTIONS.map((q) => (
                <button
                  key={q.label}
                  onClick={() => props.onSend(q.prompt)}
                  disabled={sending}
                  className="glass flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[12.5px] text-zinc-300 transition hover:border-accent/40 hover:text-white disabled:opacity-50"
                >
                  <q.icon className="h-3.5 w-3.5 shrink-0 text-accent-2" />
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {messages.map((msg) => (
            <div key={msg.id} className={`anim-fade-up flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "user" ? (
                <div className="max-w-[88%] rounded-2xl rounded-br-md bg-gradient-to-br from-[#6e6bf8] to-[#7f76f8] px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white shadow-[0_8px_24px_-10px_rgba(110,107,248,0.6)]">
                  {msg.content}
                </div>
              ) : (
                <div
                  className={`max-w-[94%] rounded-2xl rounded-bl-md px-3.5 py-2.5 ${
                    msg.error
                      ? "border border-coral/30 bg-coral/[0.07] text-coral/95"
                      : "glass text-zinc-200"
                  }`}
                >
                  {msg.streaming && msg.content === "" ? (
                    <div className="flex items-center gap-1.5 py-1">
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent-2" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent-2" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-accent-2" />
                    </div>
                  ) : msg.error ? (
                    <p className="whitespace-pre-wrap text-[13px]">{msg.content}</p>
                  ) : (
                    <Markdown text={msg.content} />
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Bestätigungs-Karten */}
          {approvals.map((approval) => (
            <div
              key={approval.approvalId}
              className="anim-pop rounded-2xl border border-gold/30 bg-gold/[0.06] p-3.5"
            >
              <div className="flex items-start gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gold/15 ring-1 ring-gold/30">
                  <Hand className="h-3.5 w-3.5 text-gold" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-gold">Bestätigung erforderlich</p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-zinc-300">
                    {approval.description}
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={() => props.onApproval(approval.approvalId, true)}
                      className="flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#6e6bf8] to-[#8b7cf6] px-3.5 text-xs font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Erlauben
                    </button>
                    <button
                      onClick={() => props.onApproval(approval.approvalId, false)}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-coral/30 bg-coral/10 px-3.5 text-xs font-semibold text-coral transition hover:bg-coral/20 active:scale-[0.98]"
                    >
                      <X className="h-3.5 w-3.5" />
                      Ablehnen
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Aktivitäts-Feed */}
      {activity.length > 0 && (
        <div className="shrink-0 border-t border-edge/70 bg-graphite/30">
          <button
            onClick={() => setActivityOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3.5 py-2 text-left"
          >
            <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <Activity className="h-3.5 w-3.5 text-accent-2" />
              Agenten-Aktivität
              {busyActivity > 0 ? (
                <span className="rounded-full bg-accent/15 px-1.5 py-px text-[10px] text-[#b3b1ff]">
                  {busyActivity} aktiv
                </span>
              ) : (
                <span className="rounded-full bg-white/[0.07] px-1.5 py-px text-[10px] text-mist">
                  {activity.length}
                </span>
              )}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-mist transition-transform ${activityOpen ? "rotate-180" : ""}`}
            />
          </button>
          {activityOpen && (
            <div className="max-h-36 overflow-y-auto px-3.5 pb-2.5">
              <div className="flex flex-col gap-1">
                {activity.slice(-30).map((item) => (
                  <div key={item.id} className="anim-fade-up flex items-center gap-2 text-[12px]">
                    {item.state === "running" ? (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
                    ) : item.state === "done" ? (
                      <Check className="h-3 w-3 shrink-0 text-mint" />
                    ) : (
                      <ShieldAlert className="h-3 w-3 shrink-0 text-coral" />
                    )}
                    <span className={item.state === "error" ? "text-coral/90" : "text-zinc-400"}>
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Entwickler-Panel */}
      {props.devMode && (
        <div className="shrink-0 border-t border-edge/70 bg-[#08090e]">
          <button
            onClick={() => setDevOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3.5 py-2"
          >
            <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-mint/80">
              <Terminal className="h-3.5 w-3.5" />
              Entwickler
            </span>
            <ChevronDown className={`h-3.5 w-3.5 text-mist transition-transform ${devOpen ? "rotate-180" : ""}`} />
          </button>
          {devOpen && (
            <div className="max-h-44 space-y-1.5 overflow-y-auto px-3.5 pb-3 font-mono text-[10.5px]">
              <div className="text-zinc-500">
                provider=<span className="text-accent-2">{providerStatus?.label ?? "—"}</span>{" "}
                model=<span className="text-accent-2">{providerStatus?.model ?? "—"}</span>
                {props.lastUsage?.totalTokens ? (
                  <>
                    {" "}tokens=<span className="text-mint">{props.lastUsage.totalTokens}</span>
                  </>
                ) : null}
                {props.lastLatencyMs !== null ? (
                  <>
                    {" "}test=<span className="text-mint">{props.lastLatencyMs}ms</span>
                  </>
                ) : null}
              </div>
              {props.devLogs.length === 0 && (
                <div className="text-zinc-600">Keine Browser-Konsolenlogs …</div>
              )}
              {props.devLogs.slice(-14).map((log, i) => (
                <div key={i} className="truncate text-zinc-500">
                  <span className="text-zinc-600">{new Date(log.ts).toLocaleTimeString("de-DE")}</span>{" "}
                  <span
                    className={
                      log.type === "error" || log.type === "pageerror"
                        ? "text-coral"
                        : log.type === "warning"
                          ? "text-gold"
                          : "text-zinc-400"
                    }
                  >
                    [{log.type}]
                  </span>{" "}
                  {log.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Eingabe */}
      <div className="shrink-0 border-t border-edge p-3">
        {messages.length > 0 && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
            {QUICK_ACTIONS.slice(0, 2).map((q) => (
              <button
                key={q.label}
                onClick={() => props.onSend(q.prompt)}
                disabled={sending}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-edge bg-white/[0.03] px-2.5 py-1 text-[11px] text-mist transition hover:border-accent/40 hover:text-white disabled:opacity-50"
              >
                <q.icon className="h-3 w-3 text-accent-2" />
                {q.label}
              </button>
            ))}
          </div>
        )}
        <div className="glass flex items-end gap-2 rounded-2xl p-1.5 transition focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/20">
          <Globe className="mb-2 ml-1.5 h-4 w-4 shrink-0 text-mist/50" />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={Math.min(Math.max(input.split("\n").length, 1), 5)}
            placeholder={
              aiConfigured
                ? "Anweisung für den Agenten … (z. B. „Öffne Wikipedia und fasse Quantencomputer zusammen“)"
                : "Bitte zuerst unter Einstellungen einen KI-Anbieter konfigurieren …"
            }
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-[13.5px] leading-snug outline-none placeholder:text-mist/50"
          />
          <button
            onClick={submit}
            disabled={!input.trim() || sending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#6e6bf8] to-[#8b7cf6] text-white shadow-[0_6px_20px_-6px_rgba(110,107,248,0.7)] transition hover:brightness-110 active:scale-95 disabled:opacity-35 disabled:shadow-none"
            title="Senden (Enter)"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-zinc-600">
          Sensible Aktionen (Klicks, Eingaben) erfordern deine Bestätigung — außer „Interaktionen“ ist aktiv.
        </p>
      </div>
    </section>
  );
}
