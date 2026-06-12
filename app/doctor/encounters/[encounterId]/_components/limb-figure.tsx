"use client";

import type {
  NeuroExam,
  NeuroLimb,
  NeuroSide,
  Plantar,
  ReflexGrade,
  Tone,
} from "@/lib/clerkship/exam/neurological";
import { useState } from "react";

import { NEURO_LIMBS, REFLEX_OPTS, TONE_OPTS } from "@/lib/clerkship/exam/neurological";
import { cn } from "@/lib/utils";
import { ChipRow, ValueChip } from "./exam-kit";

/**
 * The four limbs as a tappable body figure — the neurological workspace's
 * signature spatial control. Presentation-only: it renders the SAME per-limb
 * power / tone / reflex (and per-side plantar) records the form already holds and
 * calls the SAME handlers (cyclePower / setLimb / setPlantar). HTML buttons (full
 * keyboard + screen-reader support) laid over a decorative body outline pick the
 * ACTIVE limb; the selected limb's structured grading is shown beneath. Cell
 * intensity ramps TEAL→AMBER only (full power → mild weakness → severe weakness),
 * matching the sibling abdo-region-map — clinical-red stays reserved for genuine
 * emergencies (GCS≤8 / cord / cauda / raised-ICP), which surface in the panel.
 *
 * Anatomical orientation: the patient's right is on the viewer's left.
 */

// MRC power → cell tone. Teal (full) → amber (mild) → stronger amber (MRC ≤2).
function powerTone(p: number | undefined): "off" | "ok" | "weak" | "severe" {
  if (p === undefined) return "off";
  if (p <= 2) return "severe";
  if (p < 5) return "weak";
  return "ok";
}

const CELL = {
  off: "border-dashed border-border bg-card text-muted-foreground hover:bg-muted/50",
  ok: "border-teal-400 bg-teal-50 text-teal-700 dark:border-teal-700/70 dark:bg-teal-950/30 dark:text-teal-200",
  weak: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-300",
  severe:
    "border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-500 dark:bg-amber-900/45 dark:text-amber-100",
} as const;

export function LimbFigure({
  value,
  cyclePower,
  setLimb,
  setPlantar,
}: {
  value: NeuroExam;
  cyclePower: (limb: NeuroLimb) => void;
  setLimb: <K extends "tone" | "reflexes">(
    key: K,
    limb: NeuroLimb,
    v: K extends "tone" ? Tone : ReflexGrade,
  ) => void;
  setPlantar: (side: NeuroSide, p: Plantar) => void;
}) {
  const [active, setActive] = useState<NeuroLimb>("r_arm");
  const activeMeta = NEURO_LIMBS.find((l) => l.limb === active) ?? NEURO_LIMBS[0]!;
  const side = activeMeta.side;
  const isLeg = active === "r_leg" || active === "l_leg";

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-stretch sm:gap-3.5">
      {/* ── Body figure — tap a limb to select it ── */}
      <div className="relative mx-auto w-full max-w-45 shrink-0 self-center">
        {/* decorative body outline — head, torso, arms, legs */}
        <svg
          aria-hidden
          viewBox="0 0 200 320"
          className="text-border pointer-events-none absolute inset-0 h-full w-full"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* head */}
          <circle cx="100" cy="34" r="22" opacity="0.6" />
          {/* neck + torso */}
          <path d="M88 54 Q100 64 112 54" opacity="0.5" />
          <path d="M72 84 Q100 70 128 84 L122 188 Q100 200 78 188 Z" opacity="0.45" />
          {/* shoulders → arms */}
          <path d="M74 86 Q44 100 40 170" opacity="0.5" />
          <path d="M126 86 Q156 100 160 170" opacity="0.5" />
          {/* legs */}
          <path d="M82 190 Q72 250 70 300" opacity="0.5" />
          <path d="M118 190 Q128 250 130 300" opacity="0.5" />
          <line x1="100" y1="70" x2="100" y2="190" opacity="0.3" />
        </svg>

        <div className="relative h-75 w-full">
          {NEURO_LIMBS.map((l) => {
            // Anatomical: patient's right (r_*) on viewer's left.
            const pos =
              l.limb === "r_arm"
                ? { left: "6%", top: "40%" }
                : l.limb === "l_arm"
                  ? { left: "70%", top: "40%" }
                  : l.limb === "r_leg"
                    ? { left: "24%", top: "82%" }
                    : { left: "52%", top: "82%" };
            const p = value.power?.[l.limb];
            const tone = powerTone(p);
            const isActive = active === l.limb;
            const toneVal = value.tone?.[l.limb];
            const reflexVal = value.reflexes?.[l.limb];
            return (
              <button
                key={l.limb}
                type="button"
                onClick={() => setActive(l.limb)}
                aria-pressed={isActive}
                aria-label={`${l.label} — power ${p ?? "not tested"} of 5${
                  toneVal ? `, tone ${toneVal}` : ""
                }${reflexVal ? `, reflexes ${reflexVal}` : ""}. Select to grade.`}
                style={{ left: pos.left, top: pos.top }}
                className={cn(
                  "tap absolute flex w-[24%] flex-col items-center justify-center gap-0.5 rounded-xl border py-1.5 text-center transition-colors duration-150",
                  CELL[tone],
                  isActive && "ring-offset-card ring-2 ring-teal-500/60 ring-offset-1",
                )}
              >
                <span className="text-[10px] font-semibold tracking-tight">{l.short}</span>
                <span className="font-mono text-[12px] leading-none tabular-nums">{p ?? "–"}</span>
              </button>
            );
          })}
        </div>
        <p className="text-muted-foreground mt-1 text-center text-[9.5px]">
          patient&rsquo;s right on your left · cell = power /5
        </p>
      </div>

      {/* ── Selected-limb grading ── */}
      <div className="border-border/70 bg-muted/10 flex min-w-0 flex-1 flex-col gap-2 rounded-lg border p-2.5">
        <div className="flex items-center gap-2">
          <span className="text-foreground text-[12.5px] font-semibold">{activeMeta.label}</span>
          <span className="text-muted-foreground ml-auto text-[10px]">
            tap power to cycle 5→0→unset
          </span>
        </div>

        {/* Power — tap-to-cycle */}
        <ChipRow label="Power /5">
          <button
            type="button"
            onClick={() => cyclePower(active)}
            className={cn(
              "tap bg-card inline-flex min-w-14 items-center justify-center rounded-md border px-2 py-1 text-center font-mono text-[13px] tabular-nums transition-colors duration-150",
              value.power?.[active] === undefined
                ? "border-border text-muted-foreground border-dashed"
                : powerTone(value.power[active]) === "severe"
                  ? "border-amber-500 text-amber-800 dark:text-amber-200"
                  : powerTone(value.power[active]) === "weak"
                    ? "border-amber-400 text-amber-700 dark:text-amber-300"
                    : "border-teal-400 text-teal-700 dark:text-teal-300",
            )}
            aria-label={`${activeMeta.label} power ${value.power?.[active] ?? "not tested"} of 5 — tap to cycle`}
          >
            {value.power?.[active] ?? "–"}
          </button>
        </ChipRow>

        {/* Tone */}
        <ChipRow label="Tone">
          {TONE_OPTS.map((t) => (
            <ValueChip
              key={t.value}
              active={value.tone?.[active] === t.value}
              onClick={() => setLimb("tone", active, t.value)}
            >
              {t.label}
            </ValueChip>
          ))}
        </ChipRow>

        {/* Reflexes */}
        <ChipRow label="Reflexes">
          {REFLEX_OPTS.map((r) => (
            <ValueChip
              key={r.value}
              active={value.reflexes?.[active] === r.value}
              onClick={() => setLimb("reflexes", active, r.value)}
            >
              {r.label}
            </ValueChip>
          ))}
        </ChipRow>

        {/* Plantar — by side (shown for legs; the foot sign for this side) */}
        {isLeg ? (
          <ChipRow label={`Plantar (${side === "right" ? "R" : "L"})`}>
            {(["down", "up", "equivocal"] as Plantar[]).map((p) => (
              <ValueChip
                key={p}
                active={value.plantar?.[side] === p}
                tone={p === "up" ? "amber" : "default"}
                onClick={() => setPlantar(side, p)}
              >
                {p === "up" ? "↑ up" : p === "down" ? "↓ down" : "equivocal"}
              </ValueChip>
            ))}
          </ChipRow>
        ) : null}
      </div>
    </div>
  );
}
