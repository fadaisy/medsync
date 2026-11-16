/**
 * Patient payments: the pure rules and the provider seam (patient app v2 §5.4, §8.2; laws PA1–PA6).
 *
 * ZERO imports, like `fees.ts`: the Next app takes it as `@/supabase/functions/_shared/payments`, a Deno Edge
 * Function as `./payments.ts`, and the phone through `packages/patient-core/payments.ts`. One copy of each
 * rule (ADR 0420).
 *
 * Tether never holds patient money (PA1). The money moves from the patient's Mobile Money to the hospital's own
 * collection account through a licensed provider. Tether creates the bill, starts the prompt, verifies the
 * provider's callback and issues the receipt. The exactly-once part lives in SQL (migration 0299,
 * `private.pay_apply_event`); this file decides what a state means and what a patient may do.
 */

export type Network = "mtn" | "airtel";
export type Channel = "app" | "phone_prompt" | "counter";
export type IntentStatus = "created" | "prompted" | "succeeded" | "failed" | "expired";
export type BillStatus = "open" | "paid" | "part_paid" | "waived" | "refunded";
export type RefundStatus = "waiting" | "approved" | "declined" | "sent" | "failed";
export type FailureReason =
  | "declined"
  | "not_enough_balance"
  | "timeout"
  | "amount_mismatch"
  | "provider_error";

export const NETWORK_NAME: Record<Network, string> = { mtn: "MTN MoMo", airtel: "Airtel Money" };

/** How long a phone prompt waits before it counts as "Nothing was taken" (matches 0299's default). */
export const PROMPT_TTL_MS = 10 * 60 * 1000;

/* ─── Phone numbers ─────────────────────────────────────────────────────────── */

/**
 * A Ugandan mobile number as the provider wants it (2567XXXXXXXX), or null. Accepts 07…, 7…, 2567… and +2567…,
 * with spaces or dashes. The network is chosen by the patient, never guessed from the prefix.
 */
export function normaliseUgMsisdn(input: string): string | null {
  const d = input.replace(/[\s-]/g, "").replace(/^\+/, "");
  const m = /^(?:256|0)?(7\d{8})$/.exec(d);
  return m ? `256${m[1]}` : null;
}

/** What the screen, the receipt and the logs show: never the whole number (MR12). "07•• ••• 123". */
export function maskMsisdn(msisdn: string): string {
  const n = normaliseUgMsisdn(msisdn);
  if (!n) return "•••";
  return `07•• ••• ${n.slice(-3)}`;
}

/* ─── What a state reads as (PA5: one truth, read the same everywhere) ────────── */

export type PaymentChip = "paid_app" | "paid_counter" | "at_hospital" | "none";

/** The chip on a Visits row and the desk (§5.2). A free visit has none. */
export function paymentChip(
  bill: { status: BillStatus; totalUgx: number } | null,
  paidChannel: Channel | null,
): PaymentChip {
  if (!bill || bill.totalUgx <= 0) return "none";
  if (bill.status === "paid") return paidChannel === "counter" ? "paid_counter" : "paid_app";
  if (bill.status === "waived" || bill.status === "refunded") return "none";
  return "at_hospital";
}

export type TicketPayLine =
  | { kind: "free" }
  | { kind: "paid"; amountUgx: number; method: Network | "counter"; receiptNumber: number }
  | { kind: "to_pay"; amountUgx: number }
  | { kind: "refunded"; amountUgx: number };

/** The payment line on the ticket's stub (§5.4). */
export function ticketPayLine(
  bill: {
    status: BillStatus;
    totalUgx: number;
    paidUgx: number;
    refundedUgx: number;
  } | null,
  receipt: { method: Network | "counter"; number: number } | null,
): TicketPayLine {
  if (!bill || bill.totalUgx <= 0 || bill.status === "waived") return { kind: "free" };
  if (bill.status === "refunded") return { kind: "refunded", amountUgx: bill.refundedUgx };
  if (bill.status === "paid" && receipt) {
    return {
      kind: "paid",
      amountUgx: bill.paidUgx,
      method: receipt.method,
      receiptNumber: receipt.number,
    };
  }
  return { kind: "to_pay", amountUgx: bill.totalUgx - bill.paidUgx };
}

/** What the waiting screen says while an attempt is live, and after (§5.4 Prompt; announced, §11). */
export type PromptView = "approve_on_phone" | "paid" | "nothing_taken";
export function promptView(status: IntentStatus): PromptView {
  if (status === "succeeded") return "paid";
  if (status === "created" || status === "prompted") return "approve_on_phone";
  return "nothing_taken";
}

/** The pay choice preselected at booking (D-PA-03). */
export function defaultPayChoice(savedMsisdn: string | null): "momo" | "hospital" {
  return savedMsisdn && normaliseUgMsisdn(savedMsisdn) ? "momo" : "hospital";
}

/* ─── Refunds (P5, PA6, D-PA-06) ─────────────────────────────────────────────── */

export type RefundEligibility =
  | { eligible: true; amountUgx: number; automatic: boolean }
  | { eligible: false; why: "not_paid" | "after_cutoff" | "already_refunded" };

/**
 * Can cancelling this booking return the money, and does it need approval? A hospital cancellation always
 * refunds, automatically. A patient cancellation refunds before the cut-off, after the accounts supervisor
 * approves. After the cut-off the hospital's D-PA-07 rule applies (decided by the owner, not here).
 */
export function refundEligibility(input: {
  paidUgx: number;
  refundedUgx: number;
  visitStartsAt: Date;
  now: Date;
  cutoffHours: number;
  cancelledBy: "patient" | "hospital";
}): RefundEligibility {
  const left = input.paidUgx - input.refundedUgx;
  if (input.paidUgx <= 0) return { eligible: false, why: "not_paid" };
  if (left <= 0) return { eligible: false, why: "already_refunded" };
  if (input.cancelledBy === "hospital") return { eligible: true, amountUgx: left, automatic: true };
  const cutoff = input.visitStartsAt.getTime() - input.cutoffHours * 3600_000;
  if (input.now.getTime() > cutoff) return { eligible: false, why: "after_cutoff" };
  return { eligible: true, amountUgx: left, automatic: false };
}

/** The refund tracker's three steps (§5.4): how many are done. */
export function refundStep(status: RefundStatus): 1 | 2 | 3 {
  if (status === "sent") return 3;
  if (status === "approved") return 2;
  return 1;
}

/* ─── Callback signatures (PA4) ──────────────────────────────────────────────── */

const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

/** HMAC-SHA256 of the raw body, lower-case hex. WebCrypto: the same in Deno, Node and the browser. */
export async function signBody(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
}

/** Constant-time compare of the provider's signature with ours. */
export async function verifyBodySignature(
  secret: string,
  body: string,
  signature: string | null,
): Promise<boolean> {
  if (!secret || !signature) return false;
  const want = await signBody(secret, body);
  const got = signature.trim().toLowerCase();
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

/* ─── The provider seam ──────────────────────────────────────────────────────── */

/** One provider event, normalised. Only an amount, a reference and the outcome: never a clinic (MR12). */
export interface ProviderEvent {
  eventId: string;
  providerRef: string;
  outcome: "succeeded" | "failed";
  amountUgx: number | null;
  reason: FailureReason | null;
}

export interface RequestToPay {
  /** Our idempotency key; the provider must treat a repeat as the same request. */
  idempotencyKey: string;
  amountUgx: number;
  msisdn: string;
  network: Network;
  /** Shown on the patient's phone prompt: hospital name and "Clinic visit", never a clinic or diagnosis. */
  narration: string;
}

export interface ProviderAdapter {
  readonly name: "sandbox" | "flutterwave" | "pesapal";
  requestToPay(req: RequestToPay): Promise<{ providerRef: string }>;
  getStatus(providerRef: string): Promise<ProviderEvent | null>;
  refund(
    providerRef: string,
    amountUgx: number,
    idempotencyKey: string,
  ): Promise<{ refundRef: string; ok: boolean }>;
  /** Parse and verify a raw callback. Null = not ours or not verified (the caller records 'unverified'). */
  verifyCallback(
    rawBody: string,
    headers: Record<string, string | null>,
  ): Promise<ProviderEvent | null>;
}

/** The narration on a prompt (§5.4, MR7, MR12). */
export function promptNarration(hospitalName: string): string {
  return `${hospitalName.slice(0, 40)} · Clinic visit`;
}

/**
 * The sandbox provider, for development and tests; no money moves. Outcomes are decided by the number's last
 * digit so every path can be shown on purpose: …0 not enough balance, …1 declined, …9 never answers (times out),
 * anything else succeeds. `pending` holds the events a real provider would send to the callback URL.
 */
export function sandboxAdapter(secret: string) {
  const pending = new Map<string, ProviderEvent>();
  let seq = 0;
  const adapter: ProviderAdapter & {
    /** The callback a real provider would POST: body and signature header, for the tests and the dev harness. */
    callbackFor(providerRef: string): Promise<{ body: string; signature: string } | null>;
  } = {
    name: "sandbox",
    async requestToPay(req) {
      const providerRef = `sbx_${req.idempotencyKey}`;
      if (pending.has(providerRef)) return { providerRef };
      const last = req.msisdn.slice(-1);
      if (last !== "9") {
        const ok = last !== "0" && last !== "1";
        pending.set(providerRef, {
          eventId: `sbx_evt_${++seq}`,
          providerRef,
          outcome: ok ? "succeeded" : "failed",
          amountUgx: ok ? req.amountUgx : null,
          reason: ok ? null : last === "0" ? "not_enough_balance" : "declined",
        });
      }
      return { providerRef };
    },
    async getStatus(providerRef) {
      return pending.get(providerRef) ?? null;
    },
    async refund(providerRef, _amountUgx, idempotencyKey) {
      return { refundRef: `sbx_rf_${idempotencyKey}_${providerRef.slice(-6)}`, ok: true };
    },
    async verifyCallback(rawBody, headers) {
      if (!(await verifyBodySignature(secret, rawBody, headers["x-sandbox-signature"] ?? null)))
        return null;
      try {
        const e = JSON.parse(rawBody) as ProviderEvent;
        if (typeof e.eventId !== "string" || typeof e.providerRef !== "string") return null;
        if (e.outcome !== "succeeded" && e.outcome !== "failed") return null;
        return e;
      } catch {
        return null;
      }
    },
    async callbackFor(providerRef) {
      const e = pending.get(providerRef);
      if (!e) return null;
      const body = JSON.stringify(e);
      return { body, signature: await signBody(secret, body) };
    },
  };
  return adapter;
}
