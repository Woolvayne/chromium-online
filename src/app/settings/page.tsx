"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Compass,
  Cookie,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Languages,
  Link2,
  Loader2,
  Palette,
  Plug,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";

// lucide hat kein "BrowserIcon" – Fallback definieren
const BrowserGlyph = Globe;

interface ProviderMetaPublic {
  id: string;
  label: string;
  description: string;
  defaultBaseUrl: string;
  requiresBaseUrl: boolean;
  defaultModel: string;
  suggestedModels: string[];
  keyPlaceholder: string;
  docsUrl: string;
}

interface SavedConfig {
  id: string;
  provider: string;
  providerLabel: string;
  label: string;
  baseUrl: string | null;
  maskedKey: string;
  model: string;
  isActive: boolean;
  lastTestOk: boolean | null;
  lastLatencyMs: number | null;
  createdAt: string;
}

interface TestResult {
  ok: boolean;
  latencyMs?: number;
  models?: string[];
  error?: string;
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="anim-fade-up">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 ring-1 ring-accent/25">
          {icon}
        </div>
        <div>
          <h2 className="text-[14.5px] font-semibold text-white">{title}</h2>
          <p className="text-[11.5px] text-mist">{description}</p>
        </div>
      </div>
      <div className="glass panel-shadow rounded-2xl p-4 md:p-5">{children}</div>
    </section>
  );
}

function ActionRow({
  icon,
  title,
  description,
  buttonLabel,
  onClick,
  danger,
  busy,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-edge/60 py-3 last:border-0">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 ${danger ? "text-coral" : "text-accent-2"}`}>{icon}</span>
        <div>
          <p className="text-[13.5px] font-medium text-zinc-100">{title}</p>
          <p className="text-[11.5px] text-mist">{description}</p>
        </div>
      </div>
      <button
        onClick={onClick}
        disabled={busy}
        className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition active:scale-[0.98] disabled:opacity-50 ${
          danger
            ? "border border-coral/30 bg-coral/10 text-coral hover:bg-coral/20"
            : "border border-edge bg-white/[0.04] text-zinc-200 hover:border-accent/40 hover:text-white"
        }`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {buttonLabel}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const [providers, setProviders] = useState<ProviderMetaPublic[]>([]);
  const [configs, setConfigs] = useState<SavedConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Formular-Zustand
  const [formProvider, setFormProvider] = useState("mistral");
  const [formLabel, setFormLabel] = useState("");
  const [formKey, setFormKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formModel, setFormModel] = useState("");
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-configs");
      const json = await res.json();
      setProviders(json.providers ?? []);
      setConfigs(json.configs ?? []);
    } catch {
      setNotice("Konfigurationen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const sid = localStorage.getItem("webpilot_sid");
    if (!sid) localStorage.setItem("webpilot_sid", crypto.randomUUID());
  }, [load]);

  const sid = () => localStorage.getItem("webpilot_sid") ?? "";
  const meta = providers.find((p) => p.id === formProvider);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  // --- Formular-Aktionen -----------------------------------------------------

  const runTest = async () => {
    if (!formKey.trim()) {
      setTestResult({ ok: false, error: "Bitte zuerst einen API-Key eingeben." });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ai-configs/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: formProvider,
          apiKey: formKey.trim(),
          baseUrl: formBaseUrl.trim() || undefined,
          model: formModel.trim() || undefined,
        }),
      });
      const json = (await res.json()) as TestResult;
      setTestResult(json);
      if (json.ok && json.models?.length) {
        setFetchedModels(json.models);
        if (!formModel && json.models.length > 0) setFormModel((m) => m || "");
      }
    } catch (err) {
      setTestResult({ ok: false, error: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const saveConfig = async () => {
    if (!formKey.trim() && !editingId) {
      setTestResult({ ok: false, error: "Ein API-Key ist erforderlich." });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/ai-configs/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: formLabel || undefined,
            baseUrl: formBaseUrl.trim() || null,
            model: formModel.trim() || undefined,
            apiKey: formKey.trim() || undefined,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Speichern fehlgeschlagen");
        flash("Konfiguration aktualisiert.");
      } else {
        const res = await fetch("/api/ai-configs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: formProvider,
            label: formLabel.trim() || undefined,
            apiKey: formKey.trim(),
            baseUrl: formBaseUrl.trim() || undefined,
            model: formModel.trim() || undefined,
            activate: true,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Speichern fehlgeschlagen");
        flash("Anbieter gespeichert und aktiviert.");
      }
      resetForm();
      void load();
    } catch (err) {
      setTestResult({ ok: false, error: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormLabel("");
    setFormKey("");
    setFormBaseUrl("");
    setFormModel("");
    setFetchedModels([]);
    setTestResult(null);
  };

  const editConfig = (cfg: SavedConfig) => {
    setEditingId(cfg.id);
    setFormProvider(cfg.provider);
    setFormLabel(cfg.label);
    setFormKey("");
    setFormBaseUrl(cfg.baseUrl ?? "");
    setFormModel(cfg.model);
    setTestResult(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const activateConfig = async (id: string) => {
    setBusy(id);
    await fetch(`/api/ai-configs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activate: true }),
    }).catch(() => undefined);
    setBusy(null);
    void load();
  };

  const deleteConfig = async (id: string) => {
    if (!confirm("Diese Konfiguration wirklich löschen?")) return;
    setBusy(id);
    await fetch(`/api/ai-configs/${id}`, { method: "DELETE" }).catch(() => undefined);
    setBusy(null);
    void load();
  };

  const testSaved = async (id: string) => {
    setBusy(`test-${id}`);
    const res = await fetch("/api/ai-configs/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configId: id }),
    }).catch(() => null);
    setBusy(null);
    if (res) {
      const json = (await res.json()) as TestResult;
      flash(json.ok ? `Verbindung OK (${json.latencyMs} ms)` : `Test fehlgeschlagen: ${json.error ?? "unbekannt"}`);
    }
    void load();
  };

  // --- Browser / Datenschutz --------------------------------------------------

  const browserAction = async (action: string, label: string) => {
    setBusy(action);
    try {
      await fetch("/api/browser/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sid: sid(), action }),
      });
      flash(label);
    } catch {
      flash("Aktion fehlgeschlagen.");
    }
    setBusy(null);
  };

  const clearHistory = async () => {
    setBusy("history");
    await fetch(`/api/chat/history?sid=${encodeURIComponent(sid())}`, { method: "DELETE" }).catch(() => undefined);
    setBusy(null);
    flash("Chat-Verlauf dieser Sitzung gelöscht.");
  };

  const deleteAllConfigs = async () => {
    if (!confirm("Wirklich ALLE gespeicherten KI-Konfigurationen löschen?")) return;
    setBusy("all-configs");
    for (const cfg of configs) {
      await fetch(`/api/ai-configs/${cfg.id}`, { method: "DELETE" }).catch(() => undefined);
    }
    setBusy(null);
    void load();
    flash("Alle Konfigurationen gelöscht.");
  };

  // ---------------------------------------------------------------------------

  const inputCls =
    "h-10 w-full rounded-xl border border-edge bg-white/[0.03] px-3 text-[13px] text-zinc-100 outline-none transition placeholder:text-mist/50 focus:border-accent/50 focus:ring-2 focus:ring-accent/20";

  return (
    <div className="min-h-dvh">
      {/* Kopf */}
      <header className="glass-deep sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-edge px-4">
        <Link
          href="/"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-mist transition hover:bg-white/[0.06] hover:text-white"
          title="Zurück zur App"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#6e6bf8] to-[#a78bfa]">
          <Compass className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-[14.5px] font-bold text-white">Einstellungen</h1>
          <p className="text-[10.5px] text-mist">WebPilot AI · Konfiguration & Datenschutz</p>
        </div>
        {notice && (
          <span className="anim-pop ml-auto flex items-center gap-1.5 rounded-full bg-mint/10 px-3 py-1 text-[11.5px] font-medium text-mint ring-1 ring-mint/30">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {notice}
          </span>
        )}
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 pb-20">
        {/* ------------------------------------------------ KI-Anbieterliste */}
        <Section
          icon={<Sparkles className="h-4 w-4 text-accent-2" />}
          title="KI-Anbieter"
          description="API-Keys werden AES-256-verschlüsselt gespeichert und nie im Klartext angezeigt."
        >
          {loading ? (
            <div className="skeleton-shimmer h-16 rounded-xl" />
          ) : configs.length === 0 ? (
            <p className="py-2 text-[13px] text-mist">
              Noch kein Anbieter konfiguriert — lege unten deinen ersten Provider an.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {configs.map((cfg) => (
                <div
                  key={cfg.id}
                  className={`rounded-xl border p-3.5 transition ${
                    cfg.isActive
                      ? "border-accent/40 bg-accent/[0.06]"
                      : "border-edge bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-white">{cfg.label}</span>
                        <span className="rounded-full bg-white/[0.07] px-2 py-px text-[10.5px] text-mist">
                          {cfg.providerLabel}
                        </span>
                        {cfg.isActive && (
                          <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2 py-px text-[10.5px] font-medium text-[#b3b1ff] ring-1 ring-accent/35">
                            <Zap className="h-3 w-3" />
                            Aktiv
                          </span>
                        )}
                        {cfg.lastTestOk === true && (
                          <span title={`Letzter Test erfolgreich (${cfg.lastLatencyMs} ms)`}>
                            <CheckCircle2 className="h-3.5 w-3.5 text-mint" />
                          </span>
                        )}
                        {cfg.lastTestOk === false && (
                          <span title="Letzter Test fehlgeschlagen">
                            <XCircle className="h-3.5 w-3.5 text-coral" />
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-mist">
                        {cfg.maskedKey} · Modell: <span className="text-zinc-300">{cfg.model}</span>
                      </p>
                      {cfg.baseUrl && (
                        <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">
                          {cfg.baseUrl}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!cfg.isActive && (
                        <button
                          onClick={() => void activateConfig(cfg.id)}
                          disabled={busy === cfg.id}
                          className="flex h-7 items-center gap-1 rounded-lg bg-accent/15 px-2.5 text-[11px] font-medium text-[#b3b1ff] transition hover:bg-accent/25"
                        >
                          {busy === cfg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Aktivieren
                        </button>
                      )}
                      <button
                        onClick={() => void testSaved(cfg.id)}
                        disabled={busy === `test-${cfg.id}`}
                        title="Verbindung testen"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-mist transition hover:bg-white/[0.07] hover:text-white"
                      >
                        {busy === `test-${cfg.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => editConfig(cfg)}
                        title="Bearbeiten"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-mist transition hover:bg-white/[0.07] hover:text-white"
                      >
                        <Palette className="hidden" />
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void deleteConfig(cfg.id)}
                        title="Löschen"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-mist transition hover:bg-coral/10 hover:text-coral"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ------------------------------------------------ Neuer Anbieter */}
        <Section
          icon={<KeyRound className="h-4 w-4 text-accent-2" />}
          title={editingId ? "Anbieter bearbeiten" : "Anbieter hinzufügen"}
          description={
            editingId
              ? "Leeres API-Key-Feld = bisheriger Key bleibt erhalten."
              : "Wähle einen Provider, trage deinen Key ein und teste die Verbindung."
          }
        >
          {/* Provider-Auswahl */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setFormProvider(p.id);
                  setTestResult(null);
                  if (!editingId) setFormModel("");
                }}
                disabled={Boolean(editingId)}
                className={`rounded-xl border p-3 text-left transition disabled:opacity-60 ${
                  formProvider === p.id
                    ? "border-accent/50 bg-accent/[0.08] ring-1 ring-accent/30"
                    : "border-edge bg-white/[0.02] hover:border-white/20"
                }`}
              >
                <p className="text-[12.5px] font-semibold text-white">{p.label}</p>
                <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-mist">
                  {p.description}
                </p>
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3">
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-zinc-400">
                Name (optional)
              </label>
              <input
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder={meta?.label ?? "Mein Anbieter"}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-zinc-400">
                <span>API-Key {editingId && <span className="text-mist">(leer = unverändert)</span>}</span>
                {meta?.docsUrl && (
                  <a
                    href={meta.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-accent-2 hover:underline"
                  >
                    <Link2 className="h-3 w-3" />
                    Key erstellen
                  </a>
                )}
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder={meta?.keyPlaceholder ?? "API-Key"}
                  autoComplete="off"
                  className={`${inputCls} pr-10 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-mist hover:text-white"
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-zinc-400">
                Base URL {meta?.requiresBaseUrl ? "(erforderlich)" : "(optional)"}
              </label>
              <input
                value={formBaseUrl}
                onChange={(e) => setFormBaseUrl(e.target.value)}
                placeholder={meta?.defaultBaseUrl || "https://dein-endpunkt.example/v1"}
                className={`${inputCls} font-mono`}
                spellCheck={false}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-zinc-400">Modell</label>
              <input
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
                placeholder={meta?.defaultModel || "modellname"}
                list="model-suggestions"
                spellCheck={false}
                className={`${inputCls} font-mono`}
              />
              <datalist id="model-suggestions">
                {(fetchedModels.length > 0 ? fetchedModels : (meta?.suggestedModels ?? [])).map(
                  (m) => (
                    <option key={m} value={m} />
                  )
                )}
              </datalist>
              {fetchedModels.length > 0 && (
                <p className="mt-1 text-[10.5px] text-mint">
                  {fetchedModels.length} Modelle vom Anbieter geladen — Tippen zum Filtern.
                </p>
              )}
            </div>
          </div>

          {/* Testergebnis */}
          {testResult && (
            <div
              className={`anim-pop mt-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] ${
                testResult.ok
                  ? "border-mint/30 bg-mint/[0.07] text-mint"
                  : "border-coral/30 bg-coral/[0.07] text-coral"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>
                {testResult.ok
                  ? `Verbindung erfolgreich (${testResult.latencyMs} ms)${testResult.models?.length ? ` — ${testResult.models.length} Modelle verfügbar` : ""}`
                  : `Verbindung fehlgeschlagen: ${testResult.error ?? "unbekannter Fehler"}`}
              </span>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => void runTest()}
              disabled={testing}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-edge bg-white/[0.04] px-4 text-[12.5px] font-semibold text-zinc-200 transition hover:border-accent/40 disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5 text-accent-2" />}
              Verbindung testen
            </button>
            <button
              onClick={() => void saveConfig()}
              disabled={saving}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#6e6bf8] to-[#8b7cf6] px-4 text-[12.5px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {editingId ? "Änderungen speichern" : "Speichern & aktivieren"}
            </button>
            {editingId && (
              <button
                onClick={resetForm}
                className="flex h-9 items-center rounded-xl px-3 text-[12.5px] font-medium text-mist hover:text-white"
              >
                Abbrechen
              </button>
            )}
          </div>
        </Section>

        {/* ------------------------------------------------ Allgemein */}
        <Section
          icon={<Languages className="h-4 w-4 text-accent-2" />}
          title="Allgemein"
          description="Oberfläche & Verhalten der App."
        >
          <div className="flex flex-col gap-3 text-[13px]">
            <div className="flex items-center justify-between border-b border-edge/60 pb-3">
              <div className="flex items-center gap-3">
                <Palette className="h-4 w-4 text-accent-2" />
                <div>
                  <p className="font-medium text-zinc-100">Theme</p>
                  <p className="text-[11.5px] text-mist">Dark Mode ist aktuell immer aktiv.</p>
                </div>
              </div>
              <span className="rounded-full bg-accent/10 px-3 py-1 text-[11.5px] font-medium text-[#b3b1ff] ring-1 ring-accent/30">
                Dark
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="h-4 w-4 text-accent-2" />
                <div>
                  <p className="font-medium text-zinc-100">Sprache</p>
                  <p className="text-[11.5px] text-mist">Antwort-Sprache des Agenten.</p>
                </div>
              </div>
              <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[11.5px] font-medium text-zinc-300">
                Deutsch
              </span>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------ Browser */}
        <Section
          icon={<BrowserGlyph className="h-4 w-4 text-accent-2" />}
          title="Browser-Engine"
          description="Chromium-Session verwalten (Playwright, isolierter Kontext)."
        >
          <ActionRow
            icon={<RotateCcw className="h-4 w-4" />}
            title="Session zurücksetzen"
            description="Schließt alle Tabs und startet die Browser-Sitzung neu."
            buttonLabel="Zurücksetzen"
            busy={busy === "reset"}
            onClick={() => void browserAction("reset", "Browser-Session zurückgesetzt.")}
          />
          <ActionRow
            icon={<Cookie className="h-4 w-4" />}
            title="Cookies löschen"
            description="Entfernt alle Cookies & Logins aus der aktuellen Sitzung."
            buttonLabel="Cookies löschen"
            busy={busy === "clear-cookies"}
            onClick={() => void browserAction("clear-cookies", "Cookies gelöscht.")}
          />
          <ActionRow
            icon={<RefreshCw className="h-4 w-4" />}
            title="Browser neu starten"
            description="Startet den kompletten Chromium-Prozess neu (alle Sessions!)."
            buttonLabel="Neu starten"
            danger
            busy={busy === "restart"}
            onClick={() => void browserAction("restart", "Chromium wurde neu gestartet.")}
          />
        </Section>

        {/* ------------------------------------------------ Datenschutz */}
        <Section
          icon={<ShieldCheck className="h-4 w-4 text-accent-2" />}
          title="Datenschutz"
          description="Gespeicherte Daten dieser Anwendung verwalten."
        >
          <ActionRow
            icon={<Trash2 className="h-4 w-4" />}
            title="Chat-Verlauf löschen"
            description="Entfernt alle Nachrichten der aktuellen Browser-Session."
            buttonLabel="Verlauf löschen"
            busy={busy === "history"}
            onClick={() => void clearHistory()}
          />
          <ActionRow
            icon={<KeyRound className="h-4 w-4" />}
            title="Alle KI-Konfigurationen löschen"
            description="Entfernt alle gespeicherten Provider inkl. verschlüsselter Keys."
            buttonLabel="Alles löschen"
            danger
            busy={busy === "all-configs"}
            onClick={() => void deleteAllConfigs()}
          />
          <div className="mt-4 rounded-xl border border-edge bg-white/[0.02] p-3.5 text-[11.5px] leading-relaxed text-mist">
            <p className="mb-1 flex items-center gap-1.5 font-semibold text-zinc-300">
              <Cpu className="h-3.5 w-3.5 text-mint" />
              Sicherheitsarchitektur
            </p>
            API-Keys werden ausschließlich serverseitig mit AES-256-GCM verschlüsselt
            (Schlüssel aus <code className="rounded bg-white/[0.07] px-1">ENCRYPTION_KEY</code>) und
            niemals an den Browser zurückgegeben. Browser-Sessions laufen isoliert in einem
            serverseitigen Chromium-Kontext; interne Netzwerkadressen sind blockiert (SSRF-Schutz).
          </div>
        </Section>
      </main>
    </div>
  );
}
