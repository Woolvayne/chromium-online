import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiConfigs } from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";

export const dynamic = "force-dynamic";

interface PatchBody {
  label?: string;
  baseUrl?: string | null;
  model?: string;
  apiKey?: string; // nur setzen, wenn geändert
  activate?: boolean;
}

/** PATCH /api/ai-configs/[id] — Konfiguration aktualisieren / aktivieren */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as PatchBody;
    const updates: Partial<typeof aiConfigs.$inferInsert> = {};
    if (body.label !== undefined) updates.label = body.label.trim() || "Konfiguration";
    if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl?.trim() || null;
    if (body.model !== undefined && body.model.trim()) updates.model = body.model.trim();
    if (body.apiKey?.trim()) updates.apiKeyEnc = encryptSecret(body.apiKey.trim());

    if (body.activate) {
      await db.update(aiConfigs).set({ isActive: false });
      updates.isActive = true;
    }
    if (Object.keys(updates).length > 0) {
      await db.update(aiConfigs).set(updates).where(eq(aiConfigs.id, id));
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

/** DELETE /api/ai-configs/[id] */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    await db.delete(aiConfigs).where(eq(aiConfigs.id, id));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
