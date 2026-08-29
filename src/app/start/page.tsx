import type { Metadata } from "next";

export const metadata: Metadata = { title: "WebPilot Start" };

const QUICK_LINKS = [
  { name: "Wikipedia", url: "https://de.wikipedia.org", desc: "Freies Wissen" },
  { name: "YouTube", url: "https://www.youtube.com", desc: "Videos" },
  { name: "GitHub", url: "https://github.com", desc: "Code & Projekte" },
  { name: "Hacker News", url: "https://news.ycombinator.com", desc: "Tech-News" },
  { name: "Tagesschau", url: "https://www.tagesschau.de", desc: "Nachrichten" },
  { name: "OpenStreetMap", url: "https://www.openstreetmap.org", desc: "Karten" },
];

/**
 * Interne Startseite der Chromium-Session. Wird im integrierten
 * Browser angezeigt (about:home-Äquivalent) und bietet eine
 * schlüssellose DuckDuckGo-Suche als Einstieg.
 */
export default function StartPage() {
  return (
    <main className="min-h-screen bg-[#0b0c13] text-zinc-100">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 420px at 50% -10%, rgba(110,107,248,0.18), transparent 65%)",
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6e6bf8] to-[#a78bfa] shadow-[0_10px_40px_-10px_rgba(110,107,248,0.7)]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
        </div>
        <h1 className="text-center text-3xl font-bold tracking-tight">
          WebPilot <span className="bg-gradient-to-r from-[#8f8bff] to-[#c4b5fd] bg-clip-text text-transparent">AI</span>
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Dein KI-gesteuerter Browser — wohin soll die Reise gehen?
        </p>

        <form
          action="https://duckduckgo.com/"
          method="get"
          className="mt-8 flex w-full max-w-lg items-center gap-2"
        >
          <input
            type="text"
            name="q"
            autoFocus
            placeholder="Das Web durchsuchen …"
            className="h-12 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[15px] outline-none placeholder:text-zinc-500 focus:border-[#6e6bf8]/60 focus:ring-2 focus:ring-[#6e6bf8]/25"
          />
          <button
            type="submit"
            className="h-12 rounded-xl bg-gradient-to-r from-[#6e6bf8] to-[#8b7cf6] px-5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
          >
            Suchen
          </button>
        </form>

        <div className="mt-10 grid w-full max-w-lg grid-cols-2 gap-2.5 sm:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <a
              key={link.name}
              href={link.url}
              className="group rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 transition hover:border-[#6e6bf8]/40 hover:bg-white/[0.06]"
            >
              <div className="text-sm font-medium group-hover:text-white">{link.name}</div>
              <div className="text-xs text-zinc-500">{link.desc}</div>
            </a>
          ))}
        </div>

        <p className="mt-12 text-xs text-zinc-600">
          Gesteuert von WebPilot AI · Diese Seite läuft in einer isolierten Chromium-Session
        </p>
      </div>
    </main>
  );
}
