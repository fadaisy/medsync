import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { ALGORITHMS } from "@/lib/exchange/jwt";
import { pairSender } from "@/lib/exchange/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  senderId: z.uuid(),
  code: z.string().trim().min(6).max(40),
  jwk: z.object({
    kid: z.string().min(4).max(100),
    kty: z.enum(["EC", "RSA"]),
    alg: z.enum(ALGORITHMS).optional(),
    crv: z.literal("P-384").optional(),
    x: z.string().max(200).optional(),
    y: z.string().max(200).optional(),
    n: z.string().max(1200).optional(),
    e: z.string().max(20).optional(),
    d: z.never().optional(),
  }),
});

/**
 * Pairing (AB-6, B3): the machine presents the one-time code the laboratory lead created and its PUBLIC key (a
 * private key is refused). The code expires and locks after repeated failures. The answer is the fingerprint the
 * lead compares on screen before enabling the connection.
 */
export async function POST(request: Request) {
  const b = Body.safeParse(await request.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const r = await db.transaction((tx) => pairSender(tx, { ...b.data, now: new Date() }));
  if ("error" in r)
    return NextResponse.json(
      { error: "pairing_refused" },
      { status: r.error === "locked" ? 423 : 400 },
    );
  return NextResponse.json({ fingerprint: r.fingerprint });
}
