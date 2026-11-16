/**
 * Which provider adapter a hospital's payments go through (patient app v2 §8.2, D-PA-01).
 *
 * Only the sandbox exists until the owner signs D-PA-01 and the hospital signs its merchant agreement (D-PA-02).
 * A real provider is refused unless MOBILE_PAYMENTS=1 is set on the functions AND its adapter is built; both
 * are later steps. The sandbox moves no money and works with the flag off, in development and tests.
 * Keys live in the function environment (never in a table, never in the app bundle).
 */
import type { ProviderAdapter } from "./payments.ts";

import { sandboxAdapter } from "./payments.ts";

export type ProviderName = "sandbox" | "flutterwave" | "pesapal";

export class ProviderUnavailable extends Error {}

let sandbox: ReturnType<typeof sandboxAdapter> | null = null;

/**
 * The sandbox runs only where it is switched on (PAY_SANDBOX_ALLOWED=1) and has its own secret: a sandbox
 * "paid" moves no money, so it must never be reachable where real patients pay.
 */
export function sandboxSecret(): string {
  const secret = Deno.env.get("PAY_SANDBOX_SECRET") ?? "";
  if (Deno.env.get("PAY_SANDBOX_ALLOWED") !== "1" || secret.length < 16) {
    throw new ProviderUnavailable("The payment sandbox is not switched on here.");
  }
  return secret;
}

export function adapterFor(provider: ProviderName): ProviderAdapter & {
  callbackFor?: (ref: string) => Promise<{ body: string; signature: string } | null>;
} {
  if (provider === "sandbox") {
    const secret = sandboxSecret();
    sandbox ??= sandboxAdapter(secret);
    return sandbox;
  }
  if (Deno.env.get("MOBILE_PAYMENTS") !== "1") {
    throw new ProviderUnavailable("Mobile Money is not switched on yet.");
  }
  throw new ProviderUnavailable(`The ${provider} adapter is not built yet (D-PA-01).`);
}
