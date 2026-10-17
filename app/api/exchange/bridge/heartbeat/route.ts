import { NextResponse } from "next/server";

import { db } from "@/db";
import { bearer } from "@/lib/exchange/http";
import { authenticate, heartbeat, SCOPE } from "@/lib/exchange/store";

export const dynamic = "force-dynamic";

/** AB-13: the machine says it is alive; Connections and Analysers show "Not heard since" when it stops. */
export async function POST(request: Request) {
  const token = bearer(request);
  const url = new URL(request.url);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ok = await db.transaction(async (tx) => {
    const now = new Date();
    const who = await authenticate(tx, {
      token,
      scope: SCOPE.heartbeat,
      senderId: url.searchParams.get("sender") ?? "",
      hospitalId: url.searchParams.get("hospital") ?? "",
      now,
    });
    if (!who) return false;
    await heartbeat(tx, who.senderId, now);
    return true;
  });
  return ok
    ? new NextResponse(null, { status: 204 })
    : NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
