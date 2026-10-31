import type { EmrDb } from "@/lib/emr/db";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { ingestSensor, SensorInput } from "@/lib/pharmacy/cold/store";

export const dynamic = "force-dynamic";

/**
 * A fridge sensor posts its samples here: `x-fridge-key: <the fridge's key>` and
 * `{ "fridge": "<fridge id>", "readings": [{ "at": "<ISO time>", "tempC": 4.2 }] }`. The key is set per fridge in
 * Set-up and stored only as its SHA-256. No session: the key is the only credential.
 */
export async function POST(request: Request) {
  const key = request.headers.get("x-fridge-key")?.trim();
  const body = SensorInput.safeParse(await request.json().catch(() => null));
  if (!key || !body.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const n = await ingestSensor(db as unknown as EmrDb, key, body.data);
  if (n === null) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, stored: n });
}
