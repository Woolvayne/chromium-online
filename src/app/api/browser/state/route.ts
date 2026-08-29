import { NextRequest } from "next/server";
import { getSessionManager, homeUrlFromRequest } from "@/lib/browser/manager";
import { getBootstrapStatus } from "@/lib/browser/bootstrap";

export const dynamic = "force-dynamic";

/** GET /api/browser/state?sid=…&dev=1 → Tabs, aktive URL/Titel, (optional) Logs */
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const sid = params.get("sid");
  if (!sid) return Response.json({ error: "sid fehlt" }, { status: 400 });
  try {
    const session = await getSessionManager().getOrCreate(sid, homeUrlFromRequest(req));
    const state = await session.state();
    const dev = params.get("dev") === "1";
    return Response.json({
      ...state,
      ...(dev ? { consoleLogs: session.consoleLogs.slice(-40).reverse() } : {}),
    });
  } catch (err) {
    // Kein harter Fehler mehr: Der Bootstrap richtet Chromium ggf. gerade
    // ein — der Client soll Fortschritt statt eines 500er generieren.
    const bootstrap = getBootstrapStatus();
    return Response.json({
      ready: false,
      preparing: bootstrap.stage !== "failed",
      bootstrapStage: bootstrap.stage,
      error: (err as Error).message,
    });
  }
}
