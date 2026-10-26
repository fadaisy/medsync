import { addDays } from "@/lib/pharmacy/stores/ledger";

/**
 * The partner register (Pharmacy Phase 4, 6.5: PN-1 to PN-5; D-PH4-09, D-PH4-14, D-PH4-22). Pure. A partner is never a
 * `hospitals` row (ADR 0437); 0231 holds the register. Status is a projection evaluated at every routing and every
 * supply, so no scheduled job is relied on (PN-2).
 *
 * The pack (Appendix D: verification standard, re-verification period, licence warning window) is signed by the CSO
 * and MedSync's legal adviser. While it is unsigned (`null`) no partner can be verified, so none is in force.
 */

export interface RegisterPack {
  reverifyDays: number;
  licenceWarningDays: number;
  /** The signed rule asks for the responsible pharmacist's registration to be in date. */
  pharmacistRegistrationRequired: boolean;
}

export interface PartnerFacts {
  /** The latest verification that a second person confirmed (PN-4). */
  confirmedOn: string | null;
  suspended: boolean;
  withdrawn: boolean;
  licenceExpiry: string | null;
  responsiblePharmacist: { registrationExpiry: string | null } | null;
}

export type NotInForce =
  | "unsigned"
  | "not_verified"
  | "suspended"
  | "withdrawn"
  | "licence_expired"
  | "reverification_overdue"
  | "no_responsible_pharmacist"
  | "registration_expired";

/** PN-3: the last confirmed verification plus the signed period, or the licence expiry if earlier. */
export function reverificationDue(p: PartnerFacts, pack: RegisterPack): string | null {
  if (!p.confirmedOn) return null;
  const due = addDays(p.confirmedOn, pack.reverifyDays);
  return p.licenceExpiry && p.licenceExpiry < due ? p.licenceExpiry : due;
}

/** PN-2: every reason the partner is not in force on `date`; empty means it is. */
export function notInForce(p: PartnerFacts, date: string, pack: RegisterPack | null): NotInForce[] {
  if (!pack) return ["unsigned"];
  const out: NotInForce[] = [];
  if (!p.confirmedOn) out.push("not_verified");
  if (p.suspended) out.push("suspended");
  if (p.withdrawn) out.push("withdrawn");
  if (!p.licenceExpiry || p.licenceExpiry < date) out.push("licence_expired");
  const due = reverificationDue(p, pack);
  if (due && due < date) out.push("reverification_overdue");
  if (!p.responsiblePharmacist) out.push("no_responsible_pharmacist");
  else if (
    pack.pharmacistRegistrationRequired &&
    (!p.responsiblePharmacist.registrationExpiry ||
      p.responsiblePharmacist.registrationExpiry < date)
  )
    out.push("registration_expired");
  return out;
}

export const inForce = (p: PartnerFacts, date: string, pack: RegisterPack | null) =>
  notInForce(p, date, pack).length === 0;

/** 5.6: the licence warning, from the signed window. */
export const licenceExpiring = (p: PartnerFacts, date: string, pack: RegisterPack | null) =>
  !!pack &&
  !!p.licenceExpiry &&
  p.licenceExpiry >= date &&
  p.licenceExpiry <= addDays(date, pack.licenceWarningDays);

/**
 * PN-4: verification and its confirmation (or an agreement and its second approval) are two different people,
 * neither holding a disclosed interest in the partner. 0231's guards enforce the same.
 */
export function fourEyes(
  first: string,
  second: string | null,
  interested: ReadonlySet<string>,
): "same_person" | "interested" | null {
  if (interested.has(first) || (second !== null && interested.has(second))) return "interested";
  if (second !== null && second === first) return "same_person";
  return null;
}

/** PN-5, Appendix A v5: one partner per user; a technician's supply names the supervising pharmacist. */
export type PartnerRole = "responsible_pharmacist" | "pharmacist" | "technician";
export type NetworkPermission = "network.admin" | "network.supply" | "network.record";

export const NETWORK_PERMISSIONS: Readonly<Record<PartnerRole, readonly NetworkPermission[]>> = {
  responsible_pharmacist: ["network.admin", "network.supply"],
  pharmacist: ["network.supply"],
  technician: ["network.record"],
};

/** Law 13: by district, then name. Nothing else (no interest, no agreement age) takes part in the order. */
export const neutralOrder = <P extends { district: string; tradingName: string }>(
  ps: readonly P[],
) =>
  [...ps].sort(
    (a, b) =>
      a.district.localeCompare(b.district, "en-GB") ||
      a.tradingName.localeCompare(b.tradingName, "en-GB"),
  );
