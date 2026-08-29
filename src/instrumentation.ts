export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // 1) Datenbank-Tabellen idempotent anlegen
    const { ensureSchema } = await import("@/db/bootstrap");
    try {
      await ensureSchema();
    } catch (err) {
      console.error("[WebPilot] Schema-Bootstrap fehlgeschlagen:", err);
    }

    // 2) Chromium-Bootstrap im Hintergrund anstoßen — in frischen Umgebungen
    //    (fehlende Browser-Binaries/Systemlibs) wird so schon eingerichtet,
    //    bevor der erste Nutzer eine Session öffnet.
    const { kickOffBootstrap } = await import("@/lib/browser/bootstrap");
    kickOffBootstrap();
  }
}
