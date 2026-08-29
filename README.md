# WebPilot AI

**Integrierter Chromium-Browser + KI-Agent in einer Webanwendung.**
Surfe im Web, während ein KI-Agent (Mistral, OpenAI, Qwen oder jede OpenAI-kompatible API) die geöffnete Seite versteht, recherchiert, zusammenfasst und — mit deiner Freigabe — Browser-Aktionen ausführt.

![Stack](https://img.shields.io/badge/Next.js-16-black) ![TS](https://img.shields.io/badge/TypeScript-5-blue) ![Playwright](https://img.shields.io/badge/Playwright-Chromium-green)

---

## Features

| Bereich | Details |
| --- | --- |
| **Integrierter Browser** | Serverseitige Chromium-Sessions (Playwright), Live-Screencast via SSE, Tabs, Zurück/Vorwärts/Reload/Home, URL-Leiste, direkte Maus-/Tastatur-Fernsteuerung |
| **KI-Agent** | Streaming-Chat, Tool-Calling (12 Browser-Tools), versteht den aktuellen Seitenkontext (Text, Links, interaktive Elemente) |
| **Berechtigungen** | Risikostufen pro Tool (lesen / navigieren / interagieren), Bestätigungs-Karten für sensible Aktionen, Auto-Approve-Modi |
| **Provider** | Mistral AI, OpenAI, Qwen (DashScope), generischer OpenAI-kompatibler Endpunkt (Ollama, OpenRouter, LM Studio, vLLM …) — modular erweiterbar |
| **Sicherheit** | API-Keys AES-256-GCM-verschlüsselt in der Datenbank, Keys nie im Client, SSRF-Schutz (interne IPs blockiert), isolierte Browser-Kontexte pro Session |
| **Session-Isolation** | Jeder Nutzer erhält eine eigene Session-ID mit eigenem Chromium-BrowserContext (eigene Cookies, eigener Verlauf) |
| **Activity-Feed** | Live-Anzeige aller Agenten-Schritte („Öffne Wikipedia … ✓ Seite geladen“) |
| **Entwickler-Modus** | Browser-Konsolenlogs, Provider, Modell, Token-Nutzung, Latenzen |
| **Settings** | Anbieter-Verwaltung (Key, Base-URL, Modell, Verbindungstest), Browser-Kontrolle, Datenschutz |

## Architektur

```
┌──────────────────────────── Frontend (Next.js, React, Tailwind) ───────────────────────────┐
│  Browser-Pane (Screencast via SSE, Tabs, URL-Bar)        KI-Chat (SSE, Activity, Approvals) │
└──────────────┬──────────────────────────────────────────────┬──────────────────────────────┘
               │ /api/browser/*                              │ /api/chat (SSE)
┌──────────────▼─────────────────────────────────────────────▼──────────────────────────────┐
│                        Backend (Next.js API Routes, Node-Runtime)                          │
│  Session Manager ── AI Provider Manager ── Agent Loop ── Approval Store ── Crypto (AES-GCM)│
└──────────────┬──────────────────────────────┬─────────────────────────────┬───────────────┘
               │                              │                             │
   ┌───────────▼───────────┐      ┌───────────▼──────────┐       ┌──────────▼─────────┐
   │  Browser Worker        │      │  KI-Anbieter         │       │  PostgreSQL        │
   │  Playwright + Chromium │      │  (OpenAI-kompatible  │       │  ai_configs        │
   │  1 Context / Session   │      │   Chat-Completions)  │       │  chat_messages     │
   └────────────────────────┘      └──────────────────────┘       └────────────────────┘
```

Die Browser-Automatisierung (`src/lib/browser/`) ist bewusst entkoppelt und kann später in einen
separaten Browser-Worker-Prozess/Container ausgelagert werden — die API-Routen greifen nur über
den `SessionManager` darauf zu.

## Schnellstart (Docker — empfohlen)

```bash
# 1. Repository herunterladen / klonen
git clone <repo-url> webpilot-ai && cd webpilot-ai

# 2. .env konfigurieren
cp .env.example .env
openssl rand -hex 32   # Ausgabe als ENCRYPTION_KEY in .env eintragen

# 3. Container starten (baut App + lädt Chromium)
docker compose up --build

# 4. Öffnen
open http://localhost:3000
```

Danach in der App: **Einstellungen → KI-Anbieter → Anbieter hinzufügen**,
API-Key eintragen, Verbindung testen, speichern — fertig.

## Schnellstart (lokal, ohne Docker)

Voraussetzungen: **Node.js ≥ 20**, **PostgreSQL ≥ 15**.

```bash
# 1. Abhängigkeiten
npm install

# 2. Chromium installieren
npx playwright install --with-deps chromium

# 3. .env anlegen (DATABASE_URL + ENCRYPTION_KEY setzen)
cp .env.example .env

# 4. Datenbank-Tabellen anlegen (alternativ erfolgt das automatisch beim Start)
npx drizzle-kit push

# 5. Entwicklung bzw. Produktion
npm run dev          # http://localhost:3000
# oder: npm run build && npm run start
```

## Umgebungsvariablen

| Variable | Pflicht | Beschreibung |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL-Verbindung (lokal, Docker oder Supabase) |
| `ENCRYPTION_KEY` | ✅ | Beliebig langer zufälliger String — verschlüsselt gespeicherte API-Keys (AES-256-GCM). Erzeugen: `openssl rand -hex 32` |
| `DEFAULT_AI_PROVIDER` | ➖ | Fallback-Provider, falls nichts konfiguriert: `mistral` \| `openai` \| `qwen` \| `compatible` |
| `DEFAULT_AI_API_KEY` | ➖ | Key für den Fallback-Provider |
| `DEFAULT_AI_BASE_URL` | ➖ | Eigene Base-URL (nur bei `compatible` nötig) |
| `DEFAULT_AI_MODEL` | ➖ | Modellname des Fallback-Providers |
| `BROWSER_HEADLESS` | ➖ | `true` (Standard) — `false` zeigt das Chromium-Fenster (Desktop-Debug) |
| `BROWSER_IDLE_TIMEOUT_MIN` | ➖ | Session-Aufräumzeit in Minuten (Standard: 30) |

**API-Keys niemals als `NEXT_PUBLIC_*` anlegen** — sie würden sonst im Browser sichtbar.
Alle Keys werden ausschließlich serverseitig gelesen/verschlüsselt.

## Wichtige Dateien

| Datei / Ordner | Zweck |
| --- | --- |
| `src/app/page.tsx` | Haupt-UI: Split-Layout Browser + KI-Chat |
| `src/app/settings/page.tsx` | Einstellungen (Anbieter, Browser, Datenschutz) |
| `src/lib/browser/manager.ts` | Browser-Session-Manager (Playwright, Tabs, SSRF-Schutz) |
| `src/lib/browser/tools.ts` | 12 Agenten-Tools inkl. Risikostufen |
| `src/lib/agent/loop.ts` | Agenten-Loop (LLM ↔ Tool-Calls ↔ Bestätigungen, SSE) |
| `src/lib/ai/` | Provider-System (`types.ts`, `registry.ts`, `openai-compatible.ts`) |
| `src/lib/crypto.ts` | AES-256-GCM-Verschlüsselung der API-Keys |
| `src/app/api/browser/*` | navigate / action / input / stream (SSE) / state |
| `src/app/api/chat/*` | Agenten-Endpunkt, Approvals, Verlauf |
| `src/app/api/ai-configs/*` | Provider-CRUD + Verbindungstest |
| `src/db/schema.ts` | Tabellen: `ai_configs`, `chat_messages` |
| `Dockerfile`, `docker-compose.yml` | Deployment |
| `.env.example` | Vorlage der Umgebungsvariablen |

## Agenten-Tools & Berechtigungen

| Tool | Stufe | Standard-Freigabe |
| --- | --- | --- |
| `get_current_page`, `get_page_text`, `get_page_links`, `get_interactive_elements`, `search_web`, `take_screenshot` | **Lesen** | immer erlaubt |
| `navigate`, `go_back`, `reload_page`, `scroll` | **Navigation** | mit „Auto-Approve: Navigation“ automatisch, sonst Nachfrage |
| `click_element`, `type_text` | **Interaktion** | immer Nachfrage, außer „Interaktionen“ explizit aktiviert |

Vor jeder bestätigungspflichtigen Aktion erscheint eine Karte im Chat:
„Ich möchte auf ‚Kaufen‘ klicken.“ → **[Erlauben] [Ablehnen]** (Timeout = Ablehnung).

## Neuen KI-Anbieter hinzufügen (Erweiterbarkeit)

1. In `src/lib/ai/registry.ts` einen Eintrag in `PROVIDERS` ergänzen
   (Label, Standard-Base-URL, vorgeschlagene Modelle — solange der Endpunkt
   OpenAI-kompatibel ist, funktioniert alles Weitere automatisch).
2. Für nicht-kompatible APIs: neue Klasse mit dem Interface `AIProvider`
   (`chat`, `testConnection`, `listModels`) implementieren und in
   `createProvider()` verdrahten.
3. Fertig — UI, Einstellungen und Agent nutzen den Provider automatisch.

## Sicherheitshinweise

- Gespeicherte Keys: AES-256-GCM, Schlüssel nur aus `ENCRYPTION_KEY` (nie in der DB, nie im Client).
- Live-Streaming der Browser-Ansicht läuft über authentifizierte Same-Origin-SSE; Frames verlassen den Server nicht anders.
- Navigation zu privaten/internen IPs (10.x, 192.168.x, 127.x, IPv6-ULA …) ist blockiert (SSRF-Schutz).
- Die KI hat Zugriff **nur** auf die aktive Browser-Session, nicht auf andere Nutzerdaten oder andere Sessions.
- Für Produktivbetrieb mit mehreren Nutzern: echte Authentifizierung (z. B. Supabase Auth, NextAuth) vor die Routen setzen und Sessions an User-IDs binden.

## Hinweise

- Erste Chat-/Browser-Aktion kann einige Sekunden dauern (Chromium-Kaltstart).
- Manche Seiten blockieren Headless-Browser oder zeigen CAPTCHAs — das ist technisch bedingt.
- `npm run lint`, `npm run typecheck` für Qualitätssicherung.
