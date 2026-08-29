import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

// Wichtig: Hier NICHT werfen. Next.js importiert diese Datei bereits beim
// "Collecting page data"-Schritt des Builds (z.B. auf Vercel), auch für
// Routen mit `export const dynamic = "force-dynamic"`. Ein Throw auf
// Modulebene würde also jeden Build ohne DATABASE_URL zur Build-Zeit
// abbrechen. `pg.Pool` verbindet sich erst bei der ersten Query, daher
// reicht ein Platzhalter, damit der Build durchläuft; zur Laufzeit muss
// DATABASE_URL trotzdem gesetzt sein, sonst schlägt die erste DB-Anfrage fehl.
if (!databaseUrl) {
  console.warn(
    "[db] DATABASE_URL ist nicht gesetzt — Datenbankzugriffe schlagen zur Laufzeit fehl, bis die Variable konfiguriert ist."
  );
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl ?? "postgres://invalid:invalid@localhost:5432/invalid",
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
