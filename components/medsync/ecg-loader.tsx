import { cn } from "@/lib/utils";

/**
 * The MedSync loading mark — a drawn ECG trace (P-QRS-T) that sweeps across
 * and fades behind itself, like a monitor. Pure SVG + CSS (no runtime, no
 * dependency, works offline). Reduced-motion users see the static trace.
 */
export function EcgLoader({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn("flex flex-col items-center gap-3", className)}
    >
      <svg
        viewBox="0 0 240 64"
        fill="none"
        aria-hidden
        className="text-brand-500 h-12 w-44 motion-reduce:opacity-80"
      >
        {/* ghost trace — always visible so the mark reads even before paint */}
        <path
          d={ECG_PATH}
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* live trace — draws in, sweeps out */}
        <path
          d={ECG_PATH}
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="480"
          className="motion-safe:[animation:medsync-ecg-draw_2.2s_var(--ease-symmetric)_infinite] motion-reduce:[stroke-dasharray:none]"
        />
      </svg>
      <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
        {label}
      </span>
    </div>
  );
}

/* One cardiac cycle, drawn left→right: baseline · P wave · PR · QRS spike ·
   ST · T wave · baseline. Total path length ≈ 480 (matches the dasharray). */
const ECG_PATH =
  "M2 36 H56 Q60 36 62 32 Q65 26 68 32 Q70 36 74 36 H96 L102 36 L108 10 L114 54 L120 30 L124 36 H148 Q153 36 156 28 Q160 18 165 28 Q168 36 174 36 H238";
