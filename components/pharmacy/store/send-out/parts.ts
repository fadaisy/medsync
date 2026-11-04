import type { StoreSection } from "@/content/pharmacy-store";

import { SO } from "@/content/pharmacy-store-sendout";
import { addDays, fmtDow, isoWeekday } from "@/lib/pharmacy/derive/store/format";

export const CARD = "bg-card shadow-card flex min-w-0 flex-col gap-3 rounded-2xl p-4";
export const sectionHref = (s: StoreSection) => `?tab=main&section=${s}`;

/** "Every day", "Tuesday and Friday", "Monday, Wednesday and Friday". */
export function scheduleDays(weekdays: readonly number[]) {
  if (new Set(weekdays).size === 7) return SO.runs.everyDay;
  const names = [...weekdays].sort((a, b) => a - b).map((d) => SO.runs.days[d - 1]!);
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")}${SO.runs.and}${names.at(-1)}`
    : (names[0] ?? "");
}

/** The first delivery day after today: "Thu 5 Nov". */
export function nextRunDay(weekdays: readonly number[], today: string) {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, i);
    if (weekdays.includes(isoWeekday(d))) return fmtDow(d);
  }
  return "";
}

/** Prints only `el`: everything else on the way up to the body is hidden until the print is done. */
export function printOnly(el: HTMLElement) {
  const hidden: [HTMLElement, string][] = [];
  for (let n = el; n.parentElement && n !== document.body; n = n.parentElement)
    for (const s of n.parentElement.children)
      if (s !== n && s instanceof HTMLElement) {
        hidden.push([s, s.style.display]);
        s.style.display = "none";
      }
  window.addEventListener(
    "afterprint",
    () => {
      for (const [s, d] of hidden) s.style.display = d;
    },
    { once: true },
  );
  window.print();
}
