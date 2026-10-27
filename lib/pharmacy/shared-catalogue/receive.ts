/**
 * Receiving against the catalogue (catalogue slice Step 7). Pure: what the delivery screens and the receiving store
 * both decide. Law 4: packs convert to issue units only by the pack's own whole contents. D-CAT-09: a rescan adds
 * one pack to the open line. Law 9 (D-CAT-08): a lapsed or absent registration needs a coded reason. An unknown
 * register state (O-1: no register file yet) asks nothing.
 */

/** Units into stock for `packs` packs, or null when the contents are not a whole number of the issue unit. */
export function packsToUnits(packs: number, contents: number | null): number | null {
  if (contents === null || !Number.isInteger(contents) || contents <= 0) return null;
  if (!Number.isInteger(packs) || packs < 0) return null;
  return packs * contents;
}

export interface OpenLine {
  lineNo: number;
  productId: string;
  batchNumber: string | null;
}

/**
 * The line a rescan adds to: the newest line of the same product and batch. A plain barcode carries no batch, so
 * it adds to the newest line of the product; a 2D code with a batch never adds to another batch's line.
 */
export function rescanTarget(lines: readonly OpenLine[], productId: string, batch: string | null) {
  const same = lines.filter(
    (l) =>
      l.productId === productId &&
      (batch === null || (l.batchNumber ?? "").toLowerCase() === batch.toLowerCase()),
  );
  return same.length ? Math.max(...same.map((l) => l.lineNo)) : null;
}

export type Registration = "lapsed" | "none" | null;

/** Law 9: lapsed or not found on the register, or "No registration number on the pack" with none recorded since. */
export function registrationState(r: {
  ndaState: string | null;
  answer: string | null;
  registrationNumber: string | null;
}): Registration {
  if (r.ndaState === "lapsed") return "lapsed";
  if (r.ndaState === "not_found") return "none";
  if (r.answer === "none_on_pack" && !r.registrationNumber) return "none";
  return null;
}
