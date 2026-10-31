/**
 * Ticking several picks in the catalogue picker (multi mode, the delivery only): one pick per medicine, each with
 * its pack, or one per product of yours. Pure, so the picker's rules can be tested without the dialog.
 */
export type PickLike =
  | { kind: "product"; productId: string }
  | { kind: "pack"; medicine: { id: string }; pack: { packId: string | null } };

export const pickKey = (p: PickLike) =>
  p.kind === "product" ? `product:${p.productId}` : `medicine:${p.medicine.id}`;

const samePick = (a: PickLike, b: PickLike) =>
  pickKey(a) === pickKey(b) &&
  (a.kind === "product" || (b.kind === "pack" && a.pack.packId === b.pack.packId));

/** Tick `p`: a medicine already ticked takes the new pack in its place; otherwise it joins the end. */
export function setPick<T extends PickLike>(list: readonly T[], p: T): T[] {
  const i = list.findIndex((x) => pickKey(x) === pickKey(p));
  return i < 0 ? [...list, p] : list.map((x, j) => (j === i ? p : x));
}

/** Tick `p`, or untick it when exactly that pick (same medicine and pack, or same product) is ticked. */
export function togglePick<T extends PickLike>(list: readonly T[], p: T): T[] {
  return list.some((x) => samePick(x, p)) ? list.filter((x) => !samePick(x, p)) : setPick(list, p);
}
