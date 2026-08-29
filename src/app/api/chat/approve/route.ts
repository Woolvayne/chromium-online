import { NextRequest } from "next/server";
import { resolveApproval } from "@/lib/agent/approvals";

export const dynamic = "force-dynamic";

/** POST /api/chat/approve { approvalId, approved } */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { approvalId?: string; approved?: boolean };
    if (!body.approvalId) {
      return Response.json({ error: "approvalId fehlt" }, { status: 400 });
    }
    const found = resolveApproval(body.approvalId, Boolean(body.approved));
    if (!found) {
      return Response.json(
        { error: "Anfrage nicht gefunden oder abgelaufen" },
        { status: 404 }
      );
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
