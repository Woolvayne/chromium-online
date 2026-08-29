import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiConfigs } from "@/db/schema";
import { getConfigKey } from "@/lib/ai/config-store";
import { createProvider, PROVIDERS } from "@/lib/ai/registry";
import type { AIProviderConfig, ProviderId } from "@/lib/ai/types";

export const dynamic = "force-dynamic";
export const maxDuration = 40;

interface TestBody {
  configId?: string;
  provider?: ProviderId;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

/**
 * POST /api/ai-configs/test — Verbindungstest.
 * Entweder configId (nutzt den gespeicherten, verschlüsselten Key)
 * oder flüchtige Werte direkt aus dem Formular. Der API-Key wird
 * niemals im Frontend gespeichert oder zurückgegeben.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TestBody;
    let cfg: AIProviderConfig | null = null;

    if (body.configId) {
      cfg = await getConfigKey(body.configId);
      if (!cfg) return Response.json({ ok: false, error: "Konfiguration nicht gefunden" }, { status: 404 });
    } else if (body.provider && PROVIDERS[body.provider] && body.apiKey?.trim()) {
      cfg = {
        provider: body.provider,
        apiKey: body.apiKey.trim(),
        baseUrl: body.baseUrl?.trim() || null,
        model: body.model?.trim() || PROVIDERS[body.provider].defaultModel,
      };
    } else {
      return Response.json(
        { ok: false, error: "configId oder Provider-Daten erforderlich" },
        { status: 400 }
      );
    }

    const provider = createProvider(cfg);
    const result = await provider.testConnection();

    // Testergebnis in der Konfiguration vermerken
    if (body.configId) {
      await db
        .update(aiConfigs)
        .set({ lastTestOk: result.ok, lastLatencyMs: result.latencyMs })
        .where(eq(aiConfigs.id, body.configId))
        .catch(() => undefined);
    }

    return Response.json({
      ok: result.ok,
      latencyMs: result.latencyMs,
      models: result.models?.slice(0, 200),
      error: result.error,
    });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message.slice(0, 400) });
  }
}
