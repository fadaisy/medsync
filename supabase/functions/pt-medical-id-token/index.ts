/**
 * pt-medical-id-token — a short-lived token for the back of the membership card (patient app v2 §5.9; S24).
 * Input: none. Output: { token, expiresAt, modules }: the token, when it stops working (5 minutes), and its QR as
 * a grid of dark and light squares, so the phone draws it with the SVG it already has (no new dependency). The
 * QR holds no health data. Needs MEDICAL_ID_TOKEN_SECRET (32+ characters) on the functions' environment.
 */
import QRCode from "npm:qrcode@1.5.4";

import { getCaller } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import { conflict, methodNotAllowed, ok, unauthorized } from "../_shared/errors.ts";
import { issueToken } from "../_shared/medical-id-token.ts";

Deno.serve(async (request: Request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const init = { origin: request.headers.get("origin"), requestId };
  const pre = preflight(request);
  if (pre) return pre;
  if (request.method !== "POST") return methodNotAllowed(init);
  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);
  const secret = Deno.env.get("MEDICAL_ID_TOKEN_SECRET") ?? "";
  if (secret.length < 32) return conflict("The medical ID code is not set up yet.", init);
  const { token, expiresAt } = await issueToken(secret, caller.id, new Date(), crypto.randomUUID());
  const qr = QRCode.create(token, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const modules: string[] = [];
  for (let r = 0; r < size; r++) {
    let row = "";
    for (let c = 0; c < size; c++) row += qr.modules.get(r, c) ? "1" : "0";
    modules.push(row);
  }
  return ok({ token, expiresAt, modules }, init);
});
