import { NextRequest } from "next/server";
import {
  getSessionManager,
  homeUrlFromRequest,
  navigateTo,
} from "@/lib/browser/manager";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/browser/navigate { sid, url, tabId? } */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { sid?: string; url?: string; tabId?: string };
    if (!body.sid || !body.url) {
      return Response.json({ error: "sid und url erforderlich" }, { status: 400 });
    }
    const manager = getSessionManager();
    const session = await manager.getOrCreate(body.sid, homeUrlFromRequest(req));
    const info = await navigateTo(session, body.url, body.tabId);
    const state = await session.state();
    return Response.json({ ok: true, ...info, state });
  } catch (err) {
    return Response.json(
      { ok: false, error: (err as Error).message },
      { status: 400 }
    );
  }
}
