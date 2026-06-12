"use client";

import type { RespExam, RespZone } from "@/lib/clerkship/exam/respiratory";

import { RESP_ZONES } from "@/lib/clerkship/exam/respiratory";
import { cn } from "@/lib/utils";

/**
 * Chest as a tappable zonal anatomical map — the respiratory Examination's
 * signature spatial control, analogous to the 9-region abdomen map. The domain
 * model captures 6 anterior zones (upper/mid/lower × Left/Right) — there is NO
 * anterior/posterior split in RespExam, so none is rendered. Presentation-only:
 * it renders the SAME zonal records the form already holds (percussion / breath
 * sounds / vocal resonance, or the added-sounds selection cursor) and calls the
 * SAME cycle handler. HTML buttons (full keyboard + screen-reader support) laid
 * over a decorative thorax/ribcage outline. Intensity ramps TEAL→AMBER only —
 * teal = normal recorded, amber = abnormal recorded — clinical-red stays
 * reserved for genuine emergencies elsewhere. Anatomical orientation: the
 * patient's right is on the viewer's left (RESP_ZONES is ordered R · L per row).
 */

export type ChestModality = "percussion" | "breathSounds" | "vocalResonance" | "added";

const CELL = {
  off: "border-dashed border-border bg-card text-muted-foreground hover:bg-muted/50",
  normal:
    "border-teal-400 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/30 dark:text-teal-300",
  abnormal:
    "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  active:
    "border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-500 dark:bg-teal-950/40 dark:text-teal-200",
} as const;

export function ChestZoneMap({
  value,
  modality,
  options,
  activeZone,
  onCycle,
  onSelectZone,
}: {
  value: RespExam;
  modality: ChestModality;
  /** Value-set for the active scalar modality (percussion / breath / VR). */
  options: { value: string; label: string; abnormal: boolean }[];
  /** The zone whose added-sounds are being edited (added modality only). */
  activeZone?: RespZone | null;
  /** Cycle a scalar zone value (percussion / breath / VR). */
  onCycle: (zone: RespZone) => void;
  /** Select a zone to edit its added sounds (added modality). */
  onSelectZone?: (zone: RespZone) => void;
}) {
  const scalarRec =
    modality === "added"
      ? undefined
      : ((value[modality] as Partial<Record<RespZone, string>>) ?? {});

  return (
    <div className="relative mx-auto w-full max-w-[280px]">
      {/* decorative thorax / ribcage outline — clavicles + sternum above, costal
          margins sweeping down to the diaphragm below */}
      <svg
        aria-hidden
        viewBox="0 0 280 300"
        className="text-border pointer-events-none absolute inset-0 h-full w-full"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        {/* shoulders / clavicles */}
        <path d="M30 30 Q90 14 140 18 Q190 14 250 30" strokeLinecap="round" opacity="0.7" />
        {/* lateral chest walls */}
        <path d="M34 38 Q24 150 50 250 Q70 296 140 300" opacity="0.5" />
        <path d="M246 38 Q256 150 230 250 Q210 296 140 300" opacity="0.5" />
        {/* sternum */}
        <line x1="140" y1="30" x2="140" y2="200" opacity="0.3" />
        {/* ribs (gentle costal arcs, left + right) */}
        <path d="M40 70 Q90 86 138 78" opacity="0.3" />
        <path d="M242 70 Q192 86 142 78" opacity="0.3" />
        <path d="M40 120 Q90 138 138 128" opacity="0.3" />
        <path d="M242 120 Q192 138 142 128" opacity="0.3" />
        <path d="M44 170 Q92 190 138 178" opacity="0.3" />
        <path d="M238 170 Q190 190 142 178" opacity="0.3" />
        {/* costal margin / diaphragm */}
        <path d="M50 250 Q95 270 140 268 Q186 270 230 250" strokeLinecap="round" opacity="0.6" />
      </svg>

      <div className="relative grid grid-cols-2 gap-2 px-3 py-5">
        {RESP_ZONES.map((z) => {
          if (modality === "added") {
            const n = (value.addedSounds?.[z.zone] ?? []).length;
            const isActive = activeZone === z.zone;
            const tone: keyof typeof CELL = isActive ? "active" : n ? "abnormal" : "off";
            return (
              <button
                key={z.zone}
                type="button"
                onClick={() => onSelectZone?.(z.zone)}
                aria-label={`${z.level} zone, ${z.side} — added sounds: ${n ? `${n} recorded` : "none"}${isActive ? " (editing)" : ""}`}
                aria-pressed={isActive}
                className={cn(
                  "tap relative flex aspect-[5/3] flex-col items-center justify-center gap-0.5 rounded-xl border text-center transition-colors duration-150",
                  CELL[tone],
                )}
              >
                <span className="text-[10.5px] font-semibold tracking-tight">{z.short}</span>
                <span className="text-[9.5px] leading-none opacity-80">{n ? `·${n}` : "tap"}</span>
              </button>
            );
          }

          const cur = scalarRec?.[z.zone];
          const opt = options.find((o) => o.value === cur);
          const tone: keyof typeof CELL = !cur ? "off" : opt?.abnormal ? "abnormal" : "normal";
          return (
            <button
              key={z.zone}
              type="button"
              onClick={() => onCycle(z.zone)}
              aria-label={`${z.level} zone, ${z.side} — ${opt?.label ?? "not recorded"}`}
              className={cn(
                "tap relative flex aspect-[5/3] flex-col items-center justify-center gap-0.5 rounded-xl border text-center transition-colors duration-150",
                CELL[tone],
              )}
            >
              {cur ? (
                <span
                  key={cur}
                  aria-hidden
                  className="select-flare pointer-events-none absolute inset-0 rounded-xl"
                />
              ) : null}
              <span className="text-[10.5px] font-semibold tracking-tight">{z.short}</span>
              <span className="text-[9.5px] leading-none opacity-80">{opt?.label ?? "tap"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
