import type { ValueLine } from "@/lib/lab/patient-results";

import { LAB5 } from "@/content/lab-phase-5";
import { rangeLine, rangeWords } from "@/lib/lab/patient-release";

/**
 * PR-9: the usual range shaded, the value as a dot, labels at the range ends, and the same in words for screen
 * readers. Qualitative results and a missing range draw no line.
 */
export function RangeLine({ v }: { v: ValueLine }) {
  const r = rangeLine(v.num, v.low, v.high);
  const words = rangeWords(
    v.value,
    v.unit,
    v.low === null ? null : String(v.low),
    v.high === null ? null : String(v.high),
    v.word,
  );
  if (!r) return <p className="text-body-s">{words}</p>;
  const x = (n: number) => ((n - r.min) / (r.max - r.min)) * 100;
  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox="0 0 100 14" className="h-8 w-full" role="img" aria-label={words}>
        <line x1="0" y1="7" x2="100" y2="7" className="stroke-ink-300" strokeWidth="1" />
        <rect
          x={x(r.bandFrom)}
          y="3"
          width={Math.max(x(r.bandTo) - x(r.bandFrom), 1)}
          height="8"
          rx="1"
          className="fill-ink-150"
        />
        <circle cx={x(r.value)} cy="7" r="3" className="fill-foreground" />
      </svg>
      <div className="text-caption text-muted-foreground relative h-4 font-mono" aria-hidden>
        {r.openLow ? null : (
          <span className="absolute -translate-x-1/2" style={{ left: `${x(r.bandFrom)}%` }}>
            {v.low}
          </span>
        )}
        {r.openHigh ? null : (
          <span className="absolute -translate-x-1/2" style={{ left: `${x(r.bandTo)}%` }}>
            {v.high}
          </span>
        )}
      </div>
      <figcaption className="text-caption text-muted-foreground">{LAB5.rangeNote}</figcaption>
    </figure>
  );
}

export const WORD = {
  within: LAB5.statusWithin,
  higher: LAB5.statusHigher,
  lower: LAB5.statusLower,
  no_range: LAB5.statusNoRange,
} as const;
