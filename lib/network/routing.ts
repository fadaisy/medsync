import type { RepeatStatus } from "@/lib/prescribing/repeats";

/**
 * Agreements and routing (Pharmacy Phase 4, 6.6: AG-1, RT-1 to RT-7; Laws 5, 6, 7). Pure. 0231 holds the rows and
 * re-checks the same conditions under its guards (`routing_guard`, `ps_supplier`, `ps_routing_once`).
 *
 * The pack (Appendix D: routing list, never-routed list, response window, reasons) is signed by the pharmacist
 * reviewer and the CSO. While it is unsigned (`null`) nothing can be routed.
 */

export interface RoutingPack {
  routingList: readonly string[];
  neverRouted: readonly string[];
  responseWindowHours: number;
}

export interface Agreement {
  switchedOn: boolean;
  paused: boolean;
  ended: boolean;
  startsOn: string;
  endsOn: string | null;
  kinds: readonly ("refills" | "out_of_stock")[];
  dispensingPointIds: readonly string[];
  /** Medicines this agreement routes; a medicine must be on it and on the hospital's list. */
  routingList: readonly string[];
  /** Programme codes the agreement names, with their authority (D-PH4-05). */
  programmes: readonly string[];
}

/** AG-1. */
export const agreementInForce = (a: Agreement, date: string): boolean =>
  a.switchedOn &&
  !a.paused &&
  !a.ended &&
  a.startsOn <= date &&
  (a.endsOn === null || date <= a.endsOn);

export type RouteRefusal =
  | "routing_unsigned"
  | "no_consent"
  | "partner_not_in_force"
  | "agreement_not_in_force"
  | "not_on_routing_list"
  | "never_routed"
  | "controlled"
  | "already_taken"
  | "repeat_not_allowed"
  | "needs_pharmacist_acceptance"
  | "programme_not_in_agreement"
  | "no_quantity";

export interface RouteFacts {
  pack: RoutingPack | null;
  date: string;
  medicineId: string;
  controlled: boolean;
  /** The programme the medicine belongs to (antiretrovirals, TB), or none. */
  programme: string | null;
  pointId: string;
  kind: "refills" | "out_of_stock";
  /** RT-2: a live consent for this partner covering this line. */
  consented: boolean;
  /** PN-2, evaluated by the caller for `date`. */
  partnerInForce: boolean;
  agreement: Agreement | null;
  /** Already prepared, routed, supplied or closed (Law 7). */
  taken: boolean;
  /** For a refill, RP-6 on the current, uncancelled version. */
  repeat: RepeatStatus["kind"] | null;
  pharmacistFirst: boolean;
  /** A pharmacist accepted this version (and, for a refill, this instance: D-PH4-21). */
  pharmacistAccepted: boolean;
  routedQuantity: number | null;
}

/** RT-1: `[]` is ok; otherwise each failed condition, separately. */
export function routeRefusals(f: RouteFacts): RouteRefusal[] {
  if (!f.pack) return ["routing_unsigned"];
  const a = f.agreement;
  const out: RouteRefusal[] = [];
  if (!f.consented) out.push("no_consent");
  if (!f.partnerInForce) out.push("partner_not_in_force");
  if (
    !a ||
    !agreementInForce(a, f.date) ||
    !a.dispensingPointIds.includes(f.pointId) ||
    !a.kinds.includes(f.kind)
  )
    out.push("agreement_not_in_force");
  if (!f.pack.routingList.includes(f.medicineId) || !a?.routingList.includes(f.medicineId))
    out.push("not_on_routing_list");
  if (f.pack.neverRouted.includes(f.medicineId)) out.push("never_routed");
  if (f.controlled) out.push("controlled");
  if (f.taken) out.push("already_taken");
  if (f.kind === "refills" && f.repeat !== "allowed") out.push("repeat_not_allowed");
  if (f.pharmacistFirst && !f.pharmacistAccepted) out.push("needs_pharmacist_acceptance");
  if (f.programme !== null && !a?.programmes.includes(f.programme))
    out.push("programme_not_in_agreement");
  if (f.routedQuantity === null || !Number.isInteger(f.routedQuantity) || f.routedQuantity <= 0)
    out.push("no_quantity");
  return out;
}

/** RT-4, RT-7: where an unsupplied routed line goes back to; a refill instance goes back to `to_prepare`. */
export const returnTo = (from: "owed" | "buying_outside" | "ready" | "instance") =>
  from === "instance" ? "to_prepare" : from;

/** RT-7: the six things that return every unsupplied routed line, each in its own transaction. */
export const RETURN_CAUSES = [
  "routing_withdrawn",
  "consent_withdrawn",
  "repeats_stopped",
  "line_changed",
  "partner_suspended",
  "agreement_paused_or_ended",
] as const;

/** RT-4: the partner may accept at most the routed quantity. */
export const acceptOk = (quantity: number, routed: number) =>
  Number.isInteger(quantity) && quantity > 0 && quantity <= routed;

export type PartnerSupplyRefusal =
  | "code_not_live"
  | "partner_not_in_force"
  | "agreement_not_in_force"
  | "identity_not_confirmed"
  | "paper_not_presented"
  | "over_accepted"
  | "repeat_not_allowed"
  | "line_changed"
  | "already_supplied";

/** RT-5: checked under the same line lock the hospital uses (Law 7). */
export function partnerSupplyRefusals(f: {
  codeLive: boolean;
  partnerInForce: boolean;
  agreementInForce: boolean;
  identityConfirmed: boolean;
  paperPresented: boolean;
  quantity: number;
  accepted: number;
  /** For a refill, RP-6 now; null for an out-of-stock line. */
  repeat: RepeatStatus["kind"] | null;
  lineChangedSinceRouting: boolean;
  /** The supply already recorded, named in the refusal. */
  firstSupplyId: string | null;
}): PartnerSupplyRefusal[] {
  if (f.firstSupplyId) return ["already_supplied"];
  const out: PartnerSupplyRefusal[] = [];
  if (!f.codeLive) out.push("code_not_live");
  if (!f.partnerInForce) out.push("partner_not_in_force");
  if (!f.agreementInForce) out.push("agreement_not_in_force");
  if (!f.identityConfirmed) out.push("identity_not_confirmed");
  if (!f.paperPresented) out.push("paper_not_presented");
  if (!acceptOk(f.quantity, f.accepted)) out.push("over_accepted");
  if (f.repeat !== null && f.repeat !== "allowed") out.push("repeat_not_allowed");
  if (f.lineChangedSinceRouting) out.push("line_changed");
  return out;
}

/* ─── RT-6: the partner's read, Law 6 and nothing else ───────────────── */

export const PARTNER_LINE_FIELDS = [
  "patientName",
  "age",
  "sex",
  "medicine",
  "form",
  "strength",
  "directions",
  "quantity",
  "prescriberName",
  "prescriberCadre",
  "prescriberCouncilNumber",
  "hospitalName",
  "pharmacyPhone",
  "routingReference",
] as const;

export type PartnerLineView = Record<(typeof PARTNER_LINE_FIELDS)[number], string | number | null>;

/** RT-6: copies exactly Law 6's fields from whatever the caller read; a schema test pins the list. */
export function partnerLineView(full: PartnerLineView & Record<string, unknown>): PartnerLineView {
  return Object.fromEntries(
    PARTNER_LINE_FIELDS.map((k) => [k, full[k] ?? null]),
  ) as PartnerLineView;
}
