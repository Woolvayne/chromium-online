"use client";

import { Cpu, Fingerprint, Globe, Sparkles } from "lucide-react";

interface StatusBarProps {
  browserConnected: boolean;
  aiConfigured: boolean;
  sessionId: string;
  providerStatus: { label: string; model: string } | null;
}

function Pill({
  ok,
  icon,
  label,
  detail,
}: {
  ok: boolean | null;
  icon: React.ReactNode;
  label: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          ok === null ? "bg-gold" : ok ? "bg-mint dot-pulse" : "bg-coral"
        }`}
      />
      <span className="flex items-center gap-1 text-[11px] text-mist">
        {icon}
        {label}
      </span>
      {detail && <span className="hidden text-[11px] text-zinc-500 md:inline">{detail}</span>}
    </div>
  );
}

export default function StatusBar({
  browserConnected,
  aiConfigured,
  sessionId,
  providerStatus,
}: StatusBarProps) {
  return (
    <footer className="glass-deep flex h-8 shrink-0 items-center justify-between border-t border-edge px-3">
      <div className="flex items-center gap-4">
        <Pill
          ok={browserConnected}
          icon={<Globe className="h-3 w-3" />}
          label="Browser"
          detail={browserConnected ? "Chromium verbunden" : "verbinde …"}
        />
        <Pill
          ok={aiConfigured}
          icon={<Sparkles className="h-3 w-3" />}
          label="KI"
          detail={
            aiConfigured && providerStatus
              ? `${providerStatus.label} · ${providerStatus.model}`
              : "nicht konfiguriert"
          }
        />
        <Pill
          ok={browserConnected}
          icon={<Fingerprint className="h-3 w-3" />}
          label="Sitzung"
          detail={sessionId ? `#${sessionId.slice(0, 8)}` : undefined}
        />
      </div>
      <div className="hidden items-center gap-1.5 text-[11px] text-zinc-600 sm:flex">
        <Cpu className="h-3 w-3" />
        WebPilot AI · Isolierte Playwright-Session · v1.0
      </div>
    </footer>
  );
}
