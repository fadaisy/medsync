"use client";

import { ean13Runs } from "@/lib/pharmacy/barcode";

/**
 * Prints only the element that carries `data-print-area` (RECEIVE §E): every other top-level node of the page is
 * hidden, and the dialog around the area is un-fixed so it flows onto the paper. `data-print-hide` leaves the page.
 */
const CSS = `@media print {
  body > *:not(:has([data-print-area])) { display: none !important; }
  [data-slot="dialog-overlay"], [data-print-hide] { display: none !important; }
  [data-slot="dialog-content"] { position: static !important; transform: none !important; max-width: none !important;
    width: 100% !important; max-height: none !important; overflow: visible !important; box-shadow: none !important; animation: none !important; }
  [data-print-area] { overflow: visible !important; max-height: none !important; padding: 0 !important; color: #000; }
}`;

export const PrintStyle = () => <style>{CSS}</style>;

const QUIET = 9;
const TOTAL = 95 + 2 * QUIET;

/** The bars of an EAN-13 as one `<rect>` per bar run, 9 modules of quiet zone each side; the digits go under it. */
export function Ean13({ code, label }: { code: string; label: string }) {
  let x = QUIET;
  const bars: { x: number; w: number }[] = [];
  for (const r of ean13Runs(code)) {
    if (r.bar) bars.push({ x, w: r.width });
    x += r.width;
  }
  return (
    <svg
      viewBox={`0 0 ${TOTAL} 50`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
      className="block h-11 w-full max-w-[220px] bg-white"
    >
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={50} fill="#000" />
      ))}
    </svg>
  );
}
