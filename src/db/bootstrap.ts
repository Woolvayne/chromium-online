import { pool } from "@/db";

/**
 * Legt fehlende Tabellen beim Server-Start automatisch an
 * (idempotent). Ermöglicht Docker-Start ohne manuelle Migration;
 * für die Entwicklung kann weiterhin `npx drizzle-kit push` genutzt werden.
 */
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_configs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      provider text NOT NULL,
      label text NOT NULL,
      base_url text,
      api_key_enc text NOT NULL,
      model text NOT NULL DEFAULT '',
      is_active boolean NOT NULL DEFAULT false,
      last_test_ok boolean,
      last_latency_ms integer,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id text NOT NULL,
      role text NOT NULL,
      content text NOT NULL,
      meta jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_messages_session_idx
      ON chat_messages (session_id, created_at);
  `);
}
