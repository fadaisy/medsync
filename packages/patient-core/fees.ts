import type { FeeInputs } from "../../supabase/functions/_shared/fees";

import { feeRange, resolveFee } from "../../supabase/functions/_shared/fees";

/** What a visit costs, as the patient reads it: pure, shared by the phone and the web. */

/**
 * The three ticket looks (prompt §8.3), chosen by the money alone:
 * no fee → quiet grey, a fee not yet paid → outlined with "Pay now",
 * paid → lagoon with the PAID stamp.
 */
export type PayLook = "free" | "owed" | "paid";

export function payLook(fee: number | null, paid: boolean): PayLook {
  if (!fee || fee <= 0) return "free";
  return paid ? "paid" : "owed";
}

/** "UGX 30,000", or "No fee" for public services (PRD Q4). */
export function feeText(fee: number | null): string {
  return fee && fee > 0 ? `UGX ${fee.toLocaleString("en-US")}` : "No fee";
}

/** One fee as a patient reads it: the lowest amount, and the words when it is a range. */
export interface Fee {
  fee: number | null;
  /** "UGX 20,000 to UGX 50,000" when the clinic charges more than one amount; else null. */
  feeLabel: string | null;
}

/**
 * What a department charges, from its own service lines (ADR 0092, `@shared/fees`):
 * the clinician's cadre resolves one amount per line when it is known; unknown
 * (a walk-in) spans every line's range. No line with a price is no fee: a
 * number is never invented.
 *
 * ponytail: a free line beside a paid one in the same department is ignored,
 * so the paid amount shows. Ceiling: a department mixing free and paid
 * clinics; upgrade by pricing per service line once the patient picks one.
 */
export function feeFor(
  lines: readonly { departmentId: string; fee: FeeInputs }[],
  departmentId: string,
  cadreId: string | null,
): Fee {
  const amounts = lines
    .filter((l) => l.departmentId === departmentId)
    .flatMap((l) => {
      if (cadreId) {
        const q = resolveFee(l.fee, cadreId).feeUgx;
        return q === null ? [] : [q];
      }
      const r = feeRange(l.fee);
      return r ? [r.minUgx, r.maxUgx] : [];
    });
  if (amounts.length === 0) return { fee: null, feeLabel: null };
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  return { fee: min, feeLabel: min === max ? null : `${feeText(min)} to ${feeText(max)}` };
}
