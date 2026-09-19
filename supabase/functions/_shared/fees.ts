/**
 * What a clinic will ask for, and the words that go beside it (Gate G,
 * ADR 0092; migration 0063).
 *
 * ZERO imports, like `slots.ts` and `dispatches.ts`: the Next app takes it as
 * `@/supabase/functions/_shared/fees`, a Deno Edge Function as `./fees.ts`,
 * and the Expo app as `@shared/fees`. One copy of the arithmetic and one copy
 * of the sentences, so the number a patient reads while browsing, the number
 * quoted at booking and the number the desk asks for cannot drift.
 *
 * MedSync TAKES NO PAYMENT. PRD §0: it "does NOT sell appointment times"
 * (ruling C2). A fee here is information the patient is told before they
 * commit, and pay at the hospital. Nothing in the product blocks, ranks or
 * refuses on money.
 *
 * ── Why a cadre override on a flat base ──
 * Uganda's MoH guidelines (binding 1 July 2025) price private care in public
 * units by case-mix weight x a base rate that varies with geography, facility
 * level and service class. Cadre is not an input, and Mulago's own private
 * wing charges one consultation fee whoever sees you. So the base fee
 * (`service_lines.fee_ugx`) is the model, and `service_line_fees` is a sparse
 * override a facility may choose. Resolution is COALESCE, nothing more.
 *
 * ── Why the label is never a compliment ──
 * UMDPC Code of Professional Ethics 2019 §5(d) forbids implying one
 * practitioner is better qualified than another in the same field, and §4
 * brings mobile apps inside the advertising rules. The label is the cadre's
 * REGISTERED name, verbatim, or the service line's name. Never "senior",
 * "premium", "recommended", never a comparison, never an explanation that a
 * higher fee buys better care.
 */

/** A cadre-specific override, as the tables hold it. */
export interface CadreFee {
  cadreId: string;
  /** `public.cadres.name`, rendered verbatim. */
  cadreName: string;
  feeUgx: number;
}

export interface FeeInputs {
  /** `service_lines.payment_posture`: 'none' | 'deposit' | 'full'. */
  posture: string;
  /** `service_lines.fee_ugx` — the flat base, null when the line is free. */
  baseFeeUgx: number | null;
  /** The line's name, the label when the base answers. */
  lineName: string;
  /** Every override row for this line. Empty is the common, compliant case. */
  cadreFees: ReadonlyArray<CadreFee>;
}

/** One resolved quote: a number and the words beside it, or no fee at all. */
export interface Quote {
  feeUgx: number | null;
  /** The cadre's registered name, or the line's. Null when there is no fee. */
  label: string | null;
}

/** What browsing shows when the clinician — and so the cadre — is not yet known. */
export interface FeeRange {
  minUgx: number;
  maxUgx: number;
  /** True when every applicable fee is the same number: render one, not a range. */
  single: boolean;
}

/** A line with no charge at all. `posture` is the switch; a null base is the same answer. */
export function isFree(inputs: Pick<FeeInputs, "posture" | "baseFeeUgx">): boolean {
  return inputs.posture === "none" || inputs.baseFeeUgx === null;
}

/**
 * The fee for a booking whose clinician IS known — the only moment a price is
 * ever promised. `_shared/book.ts` refuses a clinic day with no clinician
 * (409) and a slot needs one by construction, so at the instant booking is
 * allowed this always resolves to exactly one number.
 */
export function resolveFee(inputs: FeeInputs, cadreId: string | null): Quote {
  if (isFree(inputs)) return { feeUgx: null, label: null };
  const override = cadreId ? inputs.cadreFees.find((f) => f.cadreId === cadreId) : undefined;
  return override
    ? { feeUgx: override.feeUgx, label: override.cadreName }
    : { feeUgx: inputs.baseFeeUgx, label: inputs.lineName };
}

/**
 * What a not-yet-bookable clinic day shows: the span the patient might be
 * asked for, over the base and every override on the line. Collapses to one
 * number whenever they agree — which is the Ugandan norm, and a range shown
 * where none exists is noise.
 *
 * Null when the line is free. A range is only ever shown where an exact price
 * is genuinely unknowable; the honest alternative is silence, and silence
 * about money is what this whole design exists to stop.
 */
export function feeRange(inputs: FeeInputs): FeeRange | null {
  if (isFree(inputs)) return null;
  const all = [inputs.baseFeeUgx as number, ...inputs.cadreFees.map((f) => f.feeUgx)];
  const minUgx = Math.min(...all);
  const maxUgx = Math.max(...all);
  return { minUgx, maxUgx, single: minUgx === maxUgx };
}

/** "UGX 50,000" — grouped, no decimals; shillings have no minor unit in practice. */
export function formatUgx(amount: number): string {
  return `UGX ${Math.round(amount).toLocaleString("en-UG")}`;
}

/**
 * The sentence a patient reads. Two clauses are NOT optional and are the
 * reason this lives in one file:
 *
 *   "You pay at the hospital, not in the app."  — MedSync takes no payment,
 *   and a number beside a Book button otherwise reads as a checkout.
 *
 *   "Waivers may apply — ask at the desk."      — MoH July 2025 §2.2(J) makes
 *   waiving fees for those who cannot afford them a management DUTY. A price
 *   shown without this deters exactly the patient the waiver exists for.
 */
export const FEE_FOOTNOTE = "You pay at the hospital, not in the app.";
export const WAIVER_NOTE = "Waivers may apply — ask at the desk.";

/** The quoted line for a known clinician: "Consultant · UGX 85,000". */
export function quoteLine(quote: Quote): string | null {
  if (quote.feeUgx === null) return null;
  return quote.label ? `${quote.label} · ${formatUgx(quote.feeUgx)}` : formatUgx(quote.feeUgx);
}

/** The browse line when the cadre is unknown. Never a lure — a plain current amount. */
export function rangeLine(range: FeeRange | null): string | null {
  if (!range) return null;
  return range.single
    ? formatUgx(range.minUgx)
    : `${formatUgx(range.minUgx)} to ${formatUgx(range.maxUgx)}, depending on which clinician you see`;
}
