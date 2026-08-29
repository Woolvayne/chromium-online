import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/**
 * Gespeicherte KI-Anbieter-Konfigurationen.
 * apiKeyEnc enthält den AES-256-GCM-verschlüsselten API-Key (siehe lib/crypto.ts).
 * Der Klartext-Key verlässt den Server niemals.
 */
export const aiConfigs = pgTable("ai_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").notNull(), // mistral | openai | qwen | compatible
  label: text("label").notNull(),
  baseUrl: text("base_url"),
  apiKeyEnc: text("api_key_enc").notNull(),
  model: text("model").notNull().default(""),
  isActive: boolean("is_active").notNull().default(false),
  lastTestOk: boolean("last_test_ok"),
  lastLatencyMs: integer("last_latency_ms"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Chat-Verlauf, getrennt nach Browser-Session-ID. */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: text("session_id").notNull(),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    meta: jsonb("meta"), // z. B. Token-Nutzung
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("chat_messages_session_idx").on(table.sessionId, table.createdAt),
  ]
);

export type AiConfigRow = typeof aiConfigs.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
