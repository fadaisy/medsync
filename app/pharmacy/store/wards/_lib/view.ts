import type { PlaceProduct } from "@/lib/pharmacy/stores/ward-read";

/**
 * What the count screens receive (Law 5, S20b): names, units and batch labels only. No balance, last
 * count, issue, return, dose, level or top-up reaches a count screen before the count is committed.
 */
export interface CountItem {
  productId: string;
  name: string;
  issueUnit: string;
  controlled: boolean;
  batches: { id: string; batchNumber: string; expiryText: string }[];
}
export const countItems = (products: readonly PlaceProduct[]): CountItem[] =>
  products
    .filter((p) => p.batches.length > 0)
    .map((p) => ({
      productId: p.id,
      name: p.name,
      issueUnit: p.issueUnit,
      controlled: p.controlled,
      batches: p.batches.map((b) => ({
        id: b.id,
        batchNumber: b.batchNumber,
        expiryText: b.expiryText,
      })),
    }));

const TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Kampala",
});
export const when = (d: Date | string) => TIME.format(new Date(d));
