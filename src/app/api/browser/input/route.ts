import { NextRequest } from "next/server";
import { getSessionManager } from "@/lib/browser/manager";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface InputBody {
  sid?: string;
  kind?: "click" | "dblclick" | "text" | "key" | "scroll";
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  deltaY?: number;
}

/**
 * POST /api/browser/input — leitet Maus-/Tastatur-Ereignisse des
 * Nutzers an die serverseitige Chromium-Seite weiter.
 * Koordinaten beziehen sich auf den Viewport (1280×800).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as InputBody;
    if (!body.sid || !body.kind) {
      return Response.json({ error: "sid und kind erforderlich" }, { status: 400 });
    }
    const session = getSessionManager().get(body.sid);
    const page = session?.activePage();
    if (!session || !page) {
      return Response.json({ error: "Keine aktive Browser-Session" }, { status: 404 });
    }
    session.touch();

    switch (body.kind) {
      case "click":
        await page.mouse.click(body.x ?? 0, body.y ?? 0);
        break;
      case "dblclick":
        await page.mouse.dblclick(body.x ?? 0, body.y ?? 0);
        break;
      case "text":
        if (body.text) await page.keyboard.insertText(body.text);
        break;
      case "key":
        if (body.key) await page.keyboard.press(body.key);
        break;
      case "scroll":
        await page.mouse.wheel(0, body.deltaY ?? 0);
        break;
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}
