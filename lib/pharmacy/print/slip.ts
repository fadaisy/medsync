import type { SignedCopy } from "@/content/signed-copy";

import { directionsAsWritten, printDay, printTime } from "@/lib/pharmacy/print/label";

/**
 * The slip to fill elsewhere (Pharmacy Phase 1, §5.5, §6.10): LB-5, LB-6, gate-a-proposal §1 W1 and W2.
 * Pure: the caller passes the lines, the point, the code and the print time.
 *
 * - LB-5 Only lines whose outcome is `buying_outside`, with the quantity not supplied or "Quantity: as on
 *   the prescription" (B-33). A controlled line is never printed: one in the input refuses the slip.
 * - LB-6 `newVerificationCode` draws at least 8 characters, uniformly, from the unambiguous alphabet of
 *   0126's CHECK (`^[A-HJKMNP-Z2-9]{8,12}$`); it is random and carries no patient information. Uniqueness
 *   is the table's UNIQUE (the caller redraws on a clash).
 * - W1 The verification line needs the dispensing point's phone. Without it the slip does not print.
 * - D-PH1-13 is provisional until legal Q5: the wording below is `draft`, and the app prints it only
 *   outside production. That gate is the app's, not this engine's.
 */

/** gate-a-content Part 1, B-31 to B-37 (CSO + PR; legal Q5 for B-31, B-32), exactly as written. */
export const SLIP_COPY = {
  status: "signed",
  signedBy: "Fadhul (CSO)",
  signedOn: "2026-10-13",
  title: "Medicine not supplied: to fill at another pharmacy",
  body: "This medicine was not available at the hospital pharmacy today. Give this to the pharmacy together with your signed prescription.",
  noQuantity: "Quantity: as on the prescription",
  changed: "The prescription was changed on {date}. Ask the hospital for a new copy.",
  genericNames: "Written by generic name.",
  verification:
    "To check this is real, call the hospital pharmacy on {phone} and give this code: {code}.",
  footer:
    "Controlled drugs are never printed on this form. Printed {time} at {point}. Copy {n} of {N}.",
} as const satisfies SignedCopy & Record<string, unknown>;

/** 0126 `pharmacy_slips.code` CHECK, character for character. */
export const VERIFICATION_CODE_PATTERN = /^[A-HJKMNP-Z2-9]{8,12}$/;
export const VERIFICATION_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * LB-6: uniform over the 31-character alphabet by rejection sampling (bytes ≥ 248 are redrawn, so no
 * character is favoured). `randomBytes` is injected: `crypto.getRandomValues` in the app, a stub in tests.
 */
export function newVerificationCode(randomBytes: (n: number) => Uint8Array, length = 8): string {
  if (!Number.isInteger(length) || length < 8 || length > 12)
    throw new RangeError("length 8 to 12");
  const n = VERIFICATION_ALPHABET.length;
  const limit = 256 - (256 % n);
  let code = "";
  while (code.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < limit) code += VERIFICATION_ALPHABET[b % n];
      if (code.length === length) break;
    }
  }
  return code;
}

export interface SlipLine {
  outcome: string;
  controlled: boolean;
  /** Generic name, form and strength. */
  medicine: string;
  directions: string;
  /** Whole number, only from a structured quantity or the pharmacist's entry; null prints B-33. */
  quantityNotSupplied: number | null;
}

export interface SlipInput {
  hospital: { name: string; district: string | null };
  point: { name: string; phone: string | null };
  prescriptionNumber: string | null;
  patient: { name: string; medsyncNumber: string; sexAndAge: string };
  /** D-PH1-37: name, cadre and council number, from the record. */
  prescriber: { name: string; cadre: string; councilNumber: string | null };
  lines: readonly SlipLine[];
  /** When the prescription changed after it was last printed (D-PH1-49), else null. */
  changedAt: string | null;
  code: string;
  printedAt: string;
  copy: { n: number; of: number };
  timeZone?: string;
}

export interface Slip {
  title: string;
  hospital: string;
  point: string;
  prescriptionNumber: string | null;
  date: string;
  patient: { name: string; medsyncNumber: string; sexAndAge: string };
  genericNames: string;
  lines: { medicine: string; directions: string; quantity: string }[];
  body: string;
  prescriber: { name: string; cadre: string; councilNumber: string | null };
  changed: string | null;
  verification: string;
  footer: string;
}

export type SlipResult =
  | { ok: true; slip: Slip }
  | { ok: false; reason: "no_point_phone" | "controlled_line" | "no_lines" | "bad_code" };

const fill = (s: string, values: Record<string, string>) =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);

export function slipFor(input: SlipInput): SlipResult {
  const outside = input.lines.filter((l) => l.outcome === "buying_outside");
  if (outside.some((l) => l.controlled)) return { ok: false, reason: "controlled_line" };
  if (outside.length === 0) return { ok: false, reason: "no_lines" };
  const phone = input.point.phone?.trim();
  if (!phone) return { ok: false, reason: "no_point_phone" };
  if (!VERIFICATION_CODE_PATTERN.test(input.code)) return { ok: false, reason: "bad_code" };

  const tz = input.timeZone;
  return {
    ok: true,
    slip: {
      title: SLIP_COPY.title,
      hospital: [input.hospital.name, input.hospital.district].filter(Boolean).join(", "),
      point: input.point.name,
      prescriptionNumber: input.prescriptionNumber,
      date: printDay(input.printedAt, tz),
      patient: { ...input.patient },
      genericNames: SLIP_COPY.genericNames,
      lines: outside.map((l) => ({
        medicine: l.medicine,
        directions: directionsAsWritten(l.directions),
        quantity:
          l.quantityNotSupplied === null
            ? SLIP_COPY.noQuantity
            : `Quantity: ${l.quantityNotSupplied}`,
      })),
      body: SLIP_COPY.body,
      prescriber: { ...input.prescriber },
      changed: input.changedAt
        ? fill(SLIP_COPY.changed, { date: printDay(input.changedAt, tz) })
        : null,
      verification: fill(SLIP_COPY.verification, { phone, code: input.code }),
      footer: fill(SLIP_COPY.footer, {
        time: printTime(input.printedAt, tz),
        point: input.point.name,
        n: String(input.copy.n),
        N: String(input.copy.of),
      }),
    },
  };
}
