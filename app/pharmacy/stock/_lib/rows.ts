import type { TableRow } from "../_components/stock-table";
import type { StockRow } from "@/lib/pharmacy/stock/read";

import { expiryText, stateWord, STOCK } from "@/content/pharmacy-stock";
import { rowMatches, STOCK_TABS } from "@/lib/pharmacy/stock/read";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";

/** The Stock page's rows as the table draws them: words and dates made on the server (5.8). */
const day = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: DEFAULT_TIME_ZONE,
});
const dayTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: DEFAULT_TIME_ZONE,
});

export const countedText = (d: Date | null, now: Date) =>
  !d ? STOCK.never : day.format(d) === day.format(now) ? dayTime.format(d) : day.format(d);

export function tableRow(r: StockRow, now: Date): TableRow {
  return {
    medicineId: r.medicineId,
    name: r.name,
    venWord: r.venClass ? (STOCK.ven[r.venClass] ?? null) : null,
    onShelf: r.onShelf,
    firstExpiry: r.firstExpiry
      ? `${r.firstExpiry.batchNumber} · ${expiryText(r.firstExpiry)}`
      : null,
    counted: countedText(r.lastCounted, now),
    stateWord: stateWord(r.state, r.days),
    caution: r.state !== "in_stock",
    supplied7: r.supplied7,
    tabs: STOCK_TABS.filter((t) => rowMatches(r, t)),
  };
}
