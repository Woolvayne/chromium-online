import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiConfigs, type AiConfigRow } from "@/db/schema";
import { decryptSecret, maskSecret } from "@/lib/crypto";
import { envFallbackConfig, PROVIDERS } from "./registry";
import type { AIProviderConfig, ProviderId } from "./types";

/**
 * Zugriff auf gespeicherte KI-Konfigurationen.
 * Öffentliche Darstellung enthält ausschließlich maskierte Keys;
 * Entschlüsselung passiert ausschließlich serverseitig (getActiveProviderConfig).
 */

export interface PublicConfig {
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

function toPublic(row: AiConfigRow): PublicConfig {
  let maskedKey = "••••";
  try {
    maskedKey = maskSecret(decryptSecret(row.apiKeyEnc));
  } catch {
    /* defekte Verschlüsselung → nichts anzeigen */
  }
  return {
    id: row.id,
    provider: row.provider,
    providerLabel: PROVIDERS[row.provider as ProviderId]?.label ?? row.provider,
    label: row.label,
    baseUrl: row.baseUrl,
    maskedKey,
    model: row.model,
    isActive: row.isActive,
    lastTestOk: row.lastTestOk,
    lastLatencyMs: row.lastLatencyMs,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listConfigs(): Promise<PublicConfig[]> {
  const rows = await db.select().from(aiConfigs).orderBy(desc(aiConfigs.createdAt));
  return rows.map(toPublic);
}

/** Liefert die aktive Konfiguration inkl. entschlüsseltem Key (nur Server!). */
export async function getActiveProviderConfig(): Promise<AIProviderConfig | null> {
  try {
    const rows = await db
      .select()
      .from(aiConfigs)
      .where(eq(aiConfigs.isActive, true))
      .limit(1);
    const row = rows[0];
    if (row) {
      return {
        provider: row.provider as ProviderId,
        apiKey: decryptSecret(row.apiKeyEnc),
        baseUrl: row.baseUrl,
        model: row.model,
      };
    }
  } catch (err) {
    console.error("[WebPilot] Konfiguration konnte nicht geladen werden:", err);
  }
  return envFallbackConfig();
}

export async function getConfigKey(configId: string): Promise<AIProviderConfig | null> {
  const rows = await db.select().from(aiConfigs).where(eq(aiConfigs.id, configId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    provider: row.provider as ProviderId,
    apiKey: decryptSecret(row.apiKeyEnc),
    baseUrl: row.baseUrl,
    model: row.model,
  };
}
