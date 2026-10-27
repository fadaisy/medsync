import type { StockRow } from "@/lib/pharmacy/stock/read";

/** The Shelf views (GATE A §3); anything else falls back to the viewer's first Shelf tab. */
export const SHELF_VIEWS = ["stock", "controlled", "emergency"] as const;
export type ShelfView = (typeof SHELF_VIEWS)[number];

/**
 * The view to show (the Controlled drugs filter form carries `view=controlled` itself).
 */
export function shelfView(
  sp: Record<string, string | string[] | undefined>,
  has: (key: ShelfView) => boolean,
): ShelfView | null {
  const asked = typeof sp.view === "string" ? sp.view : undefined;
  const wanted: ShelfView | undefined = SHELF_VIEWS.find((v) => v === asked);
  if (wanted && has(wanted)) return wanted;
  return SHELF_VIEWS.find(has) ?? null;
}

/**
 * The Shelf strip (board Shelf), from getStockPage's rows and stockFigures: no new rule. `outVital` null is the
 * national list not imported ("Not set"). Last count is the newest count of any scope at the point.
 */
export function shelfStrip(
  rows: readonly Pick<StockRow, "low" | "lastCounted">[],
  figures: { out: number; outVital: number | null; medicines: number },
) {
  const last = rows.reduce<Date | null>(
    (a, r) => (r.lastCounted && (!a || r.lastCounted > a) ? r.lastCounted : a),
    null,
  );
  return {
    medicines: figures.medicines,
    out: figures.out,
    outVital: figures.outVital,
    low: rows.filter((r) => r.low).length,
    lastCount: last,
  };
}
