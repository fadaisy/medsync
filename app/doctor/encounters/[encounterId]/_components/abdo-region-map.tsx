"use client";

import type { AbdoExam, AbdoRegion } from "@/lib/clerkship/exam/abdominal";

import { ABDO_REGIONS } from "@/lib/clerkship/exam/abdominal";
import { cn } from "@/lib/utils";

/**
 * Abdomen as a tappable 9-region anatomical map — the Examination workspace's
 * signature spatial control. Presentation-only: it renders the SAME tenderness /
 * guarding records the form already holds and calls the SAME cycle handler. HTML
 * buttons (full keyboard + screen-reader support) laid over a decorative torso
 * outline. Intensity ramps through TEAL→AMBER only — clinical-red stays reserved
 * for genuine emergencies elsewhere. Anatomical orientation: the patient's right
 * is on the viewer's left (ABDO_REGIONS is ordered R · mid · L per row).
 */

type Modality = "tenderness" | "guarding";

const CELL = {
  off: "border-dashed border-border bg-card text-muted-foreground hover:bg-muted/50",
  // tenderness: tender → deep ;  guarding: voluntary → involuntary
  light:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-300",
  strong:
    "border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-500 dark:bg-amber-900/45 dark:text-amber-100",
} as const;

function cellTone(modality: Modality, v: string | undefined): keyof typeof CELL {
  if (!v) return "off";
  if (modality === "tenderness") return v === "deep" ? "strong" : "light";
  return v === "involuntary" ? "strong" : "light";
}
function shortValue(modality: Modality, v: string | undefined): string {
  if (!v) return "—";
  if (modality === "tenderness") return v === "deep" ? "deep" : "tender";
  return v === "involuntary" ? "invol." : "vol.";
}

export function AbdoRegionMap({
  value,
  modality,
  onCycle,
}: {
  value: AbdoExam;
  modality: Modality;
  onCycle: (region: AbdoRegion) => void;
}) {
  const activeRec = modality === "tenderness" ? value.tenderness : value.guarding;
  const otherRec = modality === "tenderness" ? value.guarding : value.tenderness;

  return (
    <div className="relative mx-auto w-full max-w-[280px]">
      {/* decorative torso outline — ribcage arc above, iliac crests below */}
      <svg
        aria-hidden
        viewBox="0 0 280 300"
        className="text-border pointer-events-none absolute inset-0 h-full w-full"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M40 20 Q140 -6 240 20" strokeLinecap="round" opacity="0.7" />
        <path d="M30 36 Q26 150 44 250 Q60 296 140 300" opacity="0.5" />
        <path d="M250 36 Q254 150 236 250 Q220 296 140 300" opacity="0.5" />
        <path d="M44 250 Q90 270 140 268 Q190 270 236 250" strokeLinecap="round" opacity="0.7" />
        <line x1="140" y1="120" x2="140" y2="150" opacity="0.35" />
      </svg>

      <div className="relative grid grid-cols-3 gap-2 px-3 py-5">
        {ABDO_REGIONS.map((r) => {
          const v = activeRec?.[r.region];
          const tone = cellTone(modality, v);
          const hasOther = !!otherRec?.[r.region];
          return (
            <button
              key={r.region}
              type="button"
              onClick={() => onCycle(r.region)}
              aria-label={`${r.label} — ${modality}: ${v ?? "none"}${hasOther ? ` (also ${modality === "tenderness" ? "guarding" : "tender"})` : ""}`}
              className={cn(
                "tap relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border text-center transition-colors duration-150",
                CELL[tone],
              )}
            >
              <span className="text-[10.5px] font-semibold tracking-tight">{r.short}</span>
              <span className="text-[9.5px] leading-none opacity-80">
                {shortValue(modality, v)}
              </span>
              {hasOther ? (
                <span
                  aria-hidden
                  className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-amber-400"
                  title={modality === "tenderness" ? "guarding recorded" : "tender recorded"}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
