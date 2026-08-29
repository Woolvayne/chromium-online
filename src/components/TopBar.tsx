"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Code2,
  Compass,
  Globe,
  Home,
  Lock,
  MessagesSquare,
  RotateCw,
  Settings,
  ShieldCheck,
} from "lucide-react";

interface TopBarProps {
  url: string;
  onUrlChange: (v: string) => void;
  onSubmitUrl: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onHome: () => void;
  navigating: boolean;
  onNewSession: () => void;
  autoApprove: boolean;
  onToggleAutoApprove: () => void;
  devMode: boolean;
  onToggleDevMode: () => void;
  mobileView: "browser" | "chat";
  onMobileViewChange: (v: "browser" | "chat") => void;
}

function NavButton({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-mist transition hover:bg-white/[0.06] hover:text-white disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

export default function TopBar(props: TopBarProps) {
  const {
    url,
    onUrlChange,
    onSubmitUrl,
    navigating,
    autoApprove,
    devMode,
    mobileView,
  } = props;

  return (
    <header className="glass-deep panel-shadow relative z-20 flex h-14 shrink-0 items-center gap-2 border-b border-edge px-3">
      {/* Logo */}
      <div className="flex items-center gap-2.5 pr-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#6e6bf8] to-[#a78bfa] shadow-[0_4px_18px_-4px_rgba(110,107,248,0.7)]">
          <Compass className="h-4.5 w-4.5 text-white" strokeWidth={2.2} />
        </div>
        <div className="hidden leading-tight md:block">
          <div className="text-[13.5px] font-bold tracking-tight text-white">
            WebPilot <span className="bg-gradient-to-r from-[#8f8bff] to-[#c4b5fd] bg-clip-text text-transparent">AI</span>
          </div>
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-mist/70">
            Chromium · Agent
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="hidden items-center gap-0.5 sm:flex">
        <NavButton onClick={props.onBack} title="Zurück">
          <ArrowLeft className="h-4 w-4" />
        </NavButton>
        <NavButton onClick={props.onForward} title="Vorwärts">
          <ArrowRight className="h-4 w-4" />
        </NavButton>
        <NavButton onClick={props.onReload} title="Neu laden">
          <RotateCw className={`h-4 w-4 ${navigating ? "animate-spin" : ""}`} />
        </NavButton>
        <NavButton onClick={props.onHome} title="Startseite">
          <Home className="h-4 w-4" />
        </NavButton>
      </div>

      {/* URL-Leiste */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmitUrl();
        }}
        className="flex min-w-0 flex-1 justify-center"
      >
        <div className="glass flex h-9 w-full max-w-2xl items-center gap-2 rounded-xl px-3 transition focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/20">
          <Lock className="h-3.5 w-3.5 shrink-0 text-mint" />
          <input
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="URL eingeben oder suchen …"
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-mist/60"
          />
          {navigating && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-accent dot-pulse" />
          )}
        </div>
      </form>

      {/* Rechte Steuerleiste */}
      <div className="flex items-center gap-1">
        <button
          onClick={props.onToggleAutoApprove}
          title={
            autoApprove
              ? "Auto-Approve aktiv: Navigation ohne Rückfrage"
              : "Auto-Approve aus: Navigation muss bestätigt werden"
          }
          className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition ${
            autoApprove
              ? "bg-accent/15 text-[#b3b1ff] ring-1 ring-accent/40"
              : "text-mist hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          <span className="hidden xl:inline">Auto</span>
        </button>
        <button
          onClick={props.onToggleDevMode}
          title="Entwickler-Modus"
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
            devMode
              ? "bg-mint/10 text-mint ring-1 ring-mint/30"
              : "text-mist hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          <Code2 className="h-4 w-4" />
        </button>
        <button
          onClick={props.onNewSession}
          title="Neue Browser-Sitzung starten"
          className="hidden h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-mist transition hover:bg-white/[0.06] hover:text-white md:flex"
        >
          <RotateCw className="h-3.5 w-3.5" />
          Neue Sitzung
        </button>
        <Link
          href="/settings"
          title="Einstellungen"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-mist transition hover:bg-white/[0.06] hover:text-white"
        >
          <Settings className="h-4 w-4" />
        </Link>

        {/* Mobile Umschalter */}
        <div className="ml-1 flex rounded-lg bg-white/[0.05] p-0.5 lg:hidden">
          <button
            onClick={() => props.onMobileViewChange("browser")}
            className={`flex h-7 w-8 items-center justify-center rounded-md transition ${
              mobileView === "browser" ? "bg-accent text-white" : "text-mist"
            }`}
            title="Browser anzeigen"
          >
            <Globe className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => props.onMobileViewChange("chat")}
            className={`flex h-7 w-8 items-center justify-center rounded-md transition ${
              mobileView === "chat" ? "bg-accent text-white" : "text-mist"
            }`}
            title="KI-Chat anzeigen"
          >
            <MessagesSquare className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
