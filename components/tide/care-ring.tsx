import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The progress ring (§5.4 `Ring`), hand-built SVG: a track and an arc from twelve o'clock. Colours are token
 * classes (`stroke-pw-*`). The arc fills at 400 ms on the house curve; reduce motion skips it. A ring with a
 * `label` is an image with that name; without one it is decoration beside words that say the same.
 */
export function Ring({
  value,
  size,
  stroke,
  arc = "stroke-pw-accent",
  track = "stroke-pw-surface-3",
  label,
  children,
}: {
  value: number;
  size: number;
  stroke: number;
  arc?: string;
  track?: string;
  label?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className={track}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          opacity={v ? 1 : 0}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          className={cn(
            arc,
            "transition-[stroke-dashoffset] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          )}
        />
      </svg>
      <span className="relative flex flex-col items-center leading-none">{children}</span>
    </span>
  );
}
