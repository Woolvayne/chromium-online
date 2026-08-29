"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Compass,
  DownloadCloud,
  Globe,
  Loader2,
  MonitorPlay,
  MousePointerClick,
  Plus,
  Wrench,
  X,
} from "lucide-react";
import type { BrowserState } from "@/lib/client-types";
import { VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from "@/lib/shared-constants";

/** Deutsche Labels für die Bootstrap-Phasen der Browser-Engine. */
const PREPARE_LABELS: Record<string, string> = {
  unchecked: "Chromium-Installation wird geprüft …",
  "installing-browsers": "Chromium wird heruntergeladen (~150 MB) …",
  "installing-deps": "Systembibliotheken werden installiert …",
  retrying: "Verbindung wird erneut aufgebaut …",
};

interface BrowserPaneProps {
  frameSrc: string | null;
  state: BrowserState;
  connected: boolean;
  engineError: string | null;
  enginePreparing: string | null;
  navigating: boolean;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  onInput: (
    kind: "click" | "dblclick" | "text" | "key" | "scroll",
    payload: { x?: number; y?: number; text?: string; key?: string; deltaY?: number }
  ) => void;
}

const SPECIAL_KEYS = new Set([
  "Enter", "Backspace", "Tab", "Delete", "Escape",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Home", "End", "PageUp", "PageDown",
]);

export default function BrowserPane({
  frameSrc,
  state,
  connected,
  engineError,
  enginePreparing,
  navigating,
  onSwitchTab,
  onCloseTab,
  onNewTab,
  onInput,
}: BrowserPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameWrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [interacting, setInteracting] = useState(false);
  const lastWheel = useRef(0);

  // Viewport-Box exakt ans Seitenverhältnis (1280×800) anpassen → korrektes Klick-Mapping
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      const pad = 24;
      const availW = Math.max(rect.width - pad, 200);
      const availH = Math.max(rect.height - pad, 120);
      const ratio = VIEWPORT_WIDTH / VIEWPORT_HEIGHT;
      let w = availW;
      let h = w / ratio;
      if (h > availH) {
        h = availH;
        w = h * ratio;
      }
      setBox({ w: Math.floor(w), h: Math.floor(h) });
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toViewportCoords = useCallback(
    (e: React.MouseEvent) => {
      const rect = frameWrapRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return { x: 0, y: 0 };
      return {
        x: Math.round(((e.clientX - rect.left) / rect.width) * VIEWPORT_WIDTH),
        y: Math.round(((e.clientY - rect.top) / rect.height) * VIEWPORT_HEIGHT),
      };
    },
    []
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      const now = Date.now();
      if (now - lastWheel.current < 90) return;
      lastWheel.current = now;
      onInput("scroll", { deltaY: Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY) * 2, 900) });
    },
    [onInput]
  );

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Tab-Leiste */}
      <div className="flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b border-edge bg-carbon/60 px-2 pt-1.5">
        {state.tabs.map((tab) => {
          const active = tab.id === state.activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => onSwitchTab(tab.id)}
              className={`group flex h-8 min-w-0 max-w-48 cursor-pointer items-center gap-2 rounded-t-lg border-x border-t px-3 text-xs transition ${
                active
                  ? "border-edge bg-graphite text-zinc-100"
                  : "border-transparent text-mist hover:bg-white/[0.04] hover:text-zinc-300"
              }`}
            >
              {tab.loading ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
              ) : (
                <Globe className={`h-3 w-3 shrink-0 ${active ? "text-accent-2" : "text-mist/60"}`} />
              )}
              <span className="min-w-0 truncate">{tab.title || "Neuer Tab"}</span>
              {state.tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className="ml-0.5 hidden h-4 w-4 shrink-0 items-center justify-center rounded text-mist/70 hover:bg-white/10 hover:text-white group-hover:flex"
                  title="Tab schließen"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={onNewTab}
          title="Neuer Tab"
          className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-mist transition hover:bg-white/[0.06] hover:text-white"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Ladebalken */}
      <div className={`h-0.5 w-full shrink-0 bg-transparent ${navigating || activeTab?.loading ? "loading-bar" : ""}`} />

      {/* Viewport */}
      <div
        ref={containerRef}
        className="viewport-grid relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
      >
        {box.w > 0 && (
          <div
            ref={frameWrapRef}
            tabIndex={0}
            onClick={(e) => {
              frameWrapRef.current?.focus();
              if (interacting) return;
              const { x, y } = toViewportCoords(e);
              onInput("click", { x, y });
            }}
            onDoubleClick={(e) => {
              const { x, y } = toViewportCoords(e);
              onInput("dblclick", { x, y });
            }}
            onKeyDown={(e) => {
              if (e.metaKey || e.ctrlKey || e.altKey) return;
              if (e.key.length === 1) {
                e.preventDefault();
                onInput("text", { text: e.key });
              } else if (SPECIAL_KEYS.has(e.key)) {
                e.preventDefault();
                onInput("key", { key: e.key });
              }
            }}
            onWheel={handleWheel}
            style={{ width: box.w, height: box.h }}
            className="relative shrink-0 cursor-text overflow-hidden rounded-xl border border-edge bg-black shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] outline-none ring-accent/30 focus:ring-2"
          >
            {frameSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={frameSrc.slice(-24)}
                src={frameSrc}
                alt="Browser-Ansicht"
                draggable={false}
                className="anim-frame absolute inset-0 h-full w-full select-none"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-graphite/40 to-transparent px-6">
                {engineError ? (
                  <>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-coral/10 ring-1 ring-coral/30">
                      <X className="h-5 w-5 text-coral" />
                    </div>
                    <p className="max-w-sm text-center text-sm text-coral/90">{engineError}</p>
                    <p className="max-w-sm text-center font-mono text-[10.5px] text-zinc-600">
                      Manuell beheben: npx playwright install --with-deps chromium
                    </p>
                  </>
                ) : enginePreparing ? (
                  <>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/10 ring-1 ring-gold/30">
                      {enginePreparing === "installing-deps" ? (
                        <Wrench className="h-6 w-6 text-gold" />
                      ) : (
                        <DownloadCloud className="h-6 w-6 animate-bounce text-gold" />
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-zinc-200">
                        Browser-Engine wird eingerichtet
                      </p>
                      <p className="mt-1 text-[12.5px] text-mist">
                        {PREPARE_LABELS[enginePreparing] ?? "Chromium wird vorbereitet …"}
                      </p>
                    </div>
                    <div className="loading-bar h-1 w-56 overflow-hidden rounded-full bg-white/[0.07]" />
                    <p className="max-w-xs text-center text-[11px] leading-relaxed text-zinc-600">
                      Beim ersten Start in einer neuen Umgebung lädt WebPilot die
                      Chromium-Engine automatisch herunter — dauert ca. 1–3 Minuten
                      und passiert nur einmal.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/30">
                      <Compass className="h-6 w-6 animate-[spin_3.5s_linear_infinite] text-accent" />
                    </div>
                    <p className="text-sm font-medium text-mist">
                      Chromium-Engine wird gestartet …
                    </p>
                    <p className="text-xs text-zinc-600">Isolierte Playwright-Session · {VIEWPORT_WIDTH}×{VIEWPORT_HEIGHT}</p>
                  </>
                )}
              </div>
            )}

            {/* Interaktions-Hinweis */}
            {frameSrc && !interacting && (
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setInteracting(true);
                }}
                className={`absolute bottom-3 right-3 flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition ${
                  interacting
                    ? "bg-accent text-white"
                    : "glass-deep text-mist opacity-70 hover:opacity-100"
                }`}
                style={{ display: interacting ? "none" : undefined }}
                title="Klicken, Eingaben und Scrollen direkt im Browser aktivieren"
              >
                <MousePointerClick className="h-3.5 w-3.5" />
                Steuern
              </button>
            )}
            {interacting && frameSrc && (
              <div className="absolute bottom-3 right-3 flex items-center gap-1">
                <span className="glass-deep flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-mint ring-1 ring-mint/30">
                  <MonitorPlay className="h-3.5 w-3.5" />
                  Live-Steuerung aktiv
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setInteracting(false);
                    frameWrapRef.current?.blur();
                  }}
                  className="glass-deep flex h-8 w-8 items-center justify-center rounded-lg text-mist hover:text-white"
                  title="Steuerung beenden (verhindert versehentliche Klicks)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fußzeile der Pane */}
      <div className="flex h-7 shrink-0 items-center justify-between border-t border-edge bg-carbon/60 px-3 text-[10.5px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-mint" : "bg-gold"}`} />
          {connected ? "Screencast aktiv" : "Verbinde …"}
        </span>
        <span className="hidden sm:block">
          {VIEWPORT_WIDTH}×{VIEWPORT_HEIGHT} · JPEG-Stream · isolierter Kontext
        </span>
      </div>
    </section>
  );
}
