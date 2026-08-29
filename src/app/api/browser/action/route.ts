import { NextRequest } from "next/server";
import { getSessionManager, homeUrlFromRequest } from "@/lib/browser/manager";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type BrowserAction =
  | "back"
  | "forward"
  | "reload"
  | "home"
  | "new-tab"
  | "close-tab"
  | "switch-tab"
  | "reset"
  | "destroy"
  | "clear-cookies"
  | "restart";

/** POST /api/browser/action { sid, action, tabId?, url? } */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      sid?: string;
      action?: BrowserAction;
      tabId?: string;
      url?: string;
    };
    if (!body.sid || !body.action) {
      return Response.json({ error: "sid und action erforderlich" }, { status: 400 });
    }
    const manager = getSessionManager();
    const home = homeUrlFromRequest(req);

    // Restart verwirft alle Sessions → danach frisch anlegen
    if (body.action === "restart") {
      await manager.restartBrowser();
      const session = await manager.getOrCreate(body.sid, home);
      return Response.json({ ok: true, state: await session.state() });
    }
    if (body.action === "reset") {
      await manager.destroy(body.sid);
      const session = await manager.getOrCreate(body.sid, home);
      return Response.json({ ok: true, state: await session.state() });
    }
    if (body.action === "destroy") {
      await manager.destroy(body.sid);
      return Response.json({ ok: true });
    }

    const session = await manager.getOrCreate(body.sid, home);
    session.touch();

    switch (body.action) {
      case "back":
        await session.activePage()?.goBack({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => null);
        break;
      case "forward":
        await session.activePage()?.goForward({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => null);
        break;
      case "reload":
        await session.activePage()?.reload({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => null);
        break;
      case "home":
        await session.activePage()?.goto(session.homeUrl, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => null);
        break;
      case "new-tab": {
        const page = await session.context.newPage();
        session.addTab(page);
        await page.goto(body.url ?? session.homeUrl, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => null);
        break;
      }
      case "close-tab":
        if (body.tabId) await session.closeTab(body.tabId);
        break;
      case "switch-tab":
        if (body.tabId && session.tabs.has(body.tabId)) {
          session.activeTabId = body.tabId;
        }
        break;
      case "clear-cookies":
        await session.context.clearCookies();
        break;
      default:
        return Response.json({ error: "Unbekannte Aktion" }, { status: 400 });
    }

    return Response.json({ ok: true, state: await session.state() });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
