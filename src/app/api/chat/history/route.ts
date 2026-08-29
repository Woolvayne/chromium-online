import { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages } from "@/db/schema";

export const dynamic = "force-dynamic";

/** GET /api/chat/history?sid=… → gespeicherter Verlauf der Session */
export async function GET(req: NextRequest) {
  const sid = new URL(req.url).searchParams.get("sid");
  if (!sid) return Response.json({ error: "sid fehlt" }, { status: 400 });
  try {
    const rows = await db
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        meta: chatMessages.meta,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sid))
      .orderBy(asc(chatMessages.createdAt))
      .limit(200);
    return Response.json({ messages: rows });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** DELETE /api/chat/history?sid=… → Verlauf der Session löschen */
export async function DELETE(req: NextRequest) {
  const sid = new URL(req.url).searchParams.get("sid");
  if (!sid) return Response.json({ error: "sid fehlt" }, { status: 400 });
  try {
    await db.delete(chatMessages).where(eq(chatMessages.sessionId, sid));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
