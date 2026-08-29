import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiConfigs } from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { listConfigs } from "@/lib/ai/config-store";
import { envFallbackConfig, PROVIDERS } from "@/lib/ai/registry";
import type { ProviderId } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

/** GET /api/ai-configs → alle Konfigurationen (Keys maskiert) */
export async function GET() {
  try {
    const configs = await listConfigs();
    return Response.json({
      configs,
      envFallbackActive: configs.every((c) => !c.isActive) && Boolean(envFallbackConfig()),
      providers: Object.values(PROVIDERS).map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        defaultBaseUrl: p.defaultBaseUrl,
        requiresBaseUrl: p.requiresBaseUrl,
        defaultModel: p.defaultModel,
        suggestedModels: p.suggestedModels,
        keyPlaceholder: p.keyPlaceholder,
        docsUrl: p.docsUrl,
      })),
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

interface CreateBody {
  provider?: ProviderId;
  label?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  activate?: boolean;
}

/** POST /api/ai-configs → neue Konfiguration speichern (Key wird verschlüsselt) */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateBody;
    if (!body.provider || !PROVIDERS[body.provider]) {
      return Response.json({ error: "Ungültiger Provider" }, { status: 400 });
    }
    if (!body.apiKey?.trim()) {
      return Response.json({ error: "API-Key ist erforderlich" }, { status: 400 });
    }
    const meta = PROVIDERS[body.provider];
    if (meta.requiresBaseUrl && !body.baseUrl?.trim()) {
      return Response.json(
        { error: `${meta.label} benötigt eine Base URL` },
        { status: 400 }
      );
    }
    const model = body.model?.trim() || meta.defaultModel;
    if (!model) {
      return Response.json({ error: "Ein Modell ist erforderlich" }, { status: 400 });
    }

    const existing = await listConfigs();
    const shouldActivate = body.activate ?? existing.length === 0;
    if (shouldActivate) {
      await db.update(aiConfigs).set({ isActive: false });
    }

    const inserted = await db
      .insert(aiConfigs)
      .values({
        provider: body.provider,
        label: body.label?.trim() || meta.label,
        baseUrl: body.baseUrl?.trim() || null,
        apiKeyEnc: encryptSecret(body.apiKey.trim()),
        model,
        isActive: shouldActivate,
      })
      .returning({
        id: aiConfigs.id,
        provider: aiConfigs.provider,
        label: aiConfigs.label,
        baseUrl: aiConfigs.baseUrl,
        model: aiConfigs.model,
        isActive: aiConfigs.isActive,
        createdAt: aiConfigs.createdAt,
      });

    return Response.json({ ok: true, config: inserted[0] });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

/** DELETE /api/ai-configs?id=… */
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id fehlt" }, { status: 400 });
  try {
    await db.delete(aiConfigs).where(eq(aiConfigs.id, id));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
