import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { tokenAudience } from "@/lib/exchange/http";
import { issueToken } from "@/lib/exchange/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const Form = z.object({
  grant_type: z.literal("client_credentials"),
  client_assertion_type: z.literal("urn:ietf:params:oauth:client-assertion-type:jwt-bearer"),
  client_assertion: z.string().min(20).max(8192),
  scope: z.string().max(500).optional(),
});

/**
 * SMART Backend Services token endpoint (Lab Phase 4 D-LAB4-15; bridge-and-security.md §2): a machine signs a
 * short assertion with its private key; MedSync checks it against the public key registered at pairing and
 * answers an opaque token good for 5 minutes, no refresh token. Errors never say which check failed.
 */
export async function POST(request: Request) {
  const form = Form.safeParse(Object.fromEntries(new URLSearchParams(await request.text())));
  if (!form.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  let iss = "";
  try {
    iss =
      (
        JSON.parse(
          Buffer.from(form.data.client_assertion.split(".")[1] ?? "", "base64url").toString("utf8"),
        ) as { iss?: string }
      ).iss ?? "";
  } catch {
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }
  if (!z.uuid().safeParse(iss).success)
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  const r = await db.transaction((tx) =>
    issueToken(tx, {
      senderId: iss,
      assertion: form.data.client_assertion,
      audience: tokenAudience(request),
      scope: form.data.scope ?? null,
      now: new Date(),
    }),
  );
  if ("error" in r) {
    logger.warn("exchange.token.refused", { reason: r.error });
    return NextResponse.json(
      { error: r.error },
      { status: r.error === "invalid_scope" ? 400 : 401 },
    );
  }
  return NextResponse.json(
    { access_token: r.token, token_type: "bearer", expires_in: r.expiresIn, scope: r.scope },
    { headers: { "cache-control": "no-store" } },
  );
}
