"use client";

import {
  BrainIcon,
  CircleDotIcon,
  EyeIcon,
  FootprintsIcon,
  HeartIcon,
  PersonStandingIcon,
  WindIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Anatomical Canvas — a themeable full-body navigator for the Examination
 * workspace (Anatomical Canvas GATE B; see docs/design/anatomical-canvas-gate-a.md).
 *
 * HARD BOUNDARY — this is a VIEW, not a new data model. It does NOT capture or
 * store anything. Tapping an anatomical region simply SELECTS that system; the
 * existing system-exam card (with its own detailed capture + region maps) renders
 * below exactly as it does from the tab bar. The canvas only reads each system's
 * has-content flag (to show an at-a-glance dot) and calls onSelect — the same
 * setExamSystem the tab bar already calls. No clinical field, value-set, handler,
 * or record is added or changed.
 *
 * Presentation: a procedural, themeable body silhouette (currentColor over the
 * design tokens — light + dark for free, tiny, offline, 100% our IP) with HTML
 * button hotspots over it (full keyboard + screen-reader support). Clinical-red
 * stays reserved for emergencies — the only accent here is the teal selection.
 *
 * The whole feature is opt-in (the form defaults to the "By system" view) and can
 * be hard-disabled with NEXT_PUBLIC_ANATOMICAL_CANVAS="0" — so if it doesn't look
 * right in production, the existing experience is untouched and reverting is a flip.
 */

/** Kill-switch: the body-map view is offered unless explicitly disabled. */
export const ANATOMICAL_CANVAS_ENABLED = process.env.NEXT_PUBLIC_ANATOMICAL_CANVAS !== "0";

export type ExamSystemKey =
  | "general"
  | "cardiovascular"
  | "respiratory"
  | "abdominal"
  | "neurological"
  | "musculoskeletal"
  | "endovascular";

export type ExamSystemMeta = { key: ExamSystemKey; label: string; hasContent: boolean };

/** Anatomical placement of each system's hotspot (% of the body frame). Patient's
 *  right is on the viewer's left, so e.g. the cardiac apex sits viewer-right. */
const SPOT: Record<
  ExamSystemKey,
  { top: number; left: number; icon: typeof HeartIcon; aria: string }
> = {
  general: { top: 7, left: 50, icon: EyeIcon, aria: "general inspection (head & whole patient)" },
  respiratory: { top: 29, left: 38, icon: WindIcon, aria: "respiratory (chest / lung fields)" },
  cardiovascular: { top: 32, left: 60, icon: HeartIcon, aria: "cardiovascular (precordium)" },
  abdominal: { top: 50, left: 50, icon: CircleDotIcon, aria: "abdomen" },
  neurological: { top: 49, left: 17, icon: BrainIcon, aria: "neurological (limbs / CNS)" },
  musculoskeletal: {
    top: 72,
    left: 63,
    icon: PersonStandingIcon,
    aria: "musculoskeletal (joints)",
  },
  endovascular: { top: 90, left: 50, icon: FootprintsIcon, aria: "endocrine, vascular & foot" },
};

export function AnatomicalCanvas({
  systems,
  active,
  onSelect,
}: {
  systems: ExamSystemMeta[];
  active: ExamSystemKey;
  onSelect: (key: ExamSystemKey) => void;
}) {
  return (
    <div className="border-border/70 bg-muted/20 relative flex flex-col items-center gap-1 rounded-xl border px-4 py-4">
      <p className="text-muted-foreground self-start text-[11px]">
        Tap a region to examine that system
      </p>

      <div className="relative mx-auto aspect-1/2 w-full max-w-55">
        {/* decorative front-facing body silhouette (stroke = border token → themes) */}
        <svg
          aria-hidden
          viewBox="0 0 200 400"
          className="text-muted-foreground/40 pointer-events-none absolute inset-0 h-full w-full"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* head + neck */}
          <circle cx="100" cy="32" r="22" opacity="0.7" />
          <path d="M90 52 Q100 60 110 52" opacity="0.6" />
          {/* shoulders + torso */}
          <path d="M66 80 Q100 66 134 80 L126 232 Q100 248 74 232 Z" opacity="0.55" />
          {/* arms */}
          <path d="M70 84 Q38 112 30 210 Q30 224 40 226" opacity="0.5" />
          <path d="M130 84 Q162 112 170 210 Q170 224 160 226" opacity="0.5" />
          {/* legs */}
          <path d="M84 236 Q76 320 74 392" opacity="0.5" />
          <path d="M116 236 Q124 320 126 392" opacity="0.5" />
          {/* feet */}
          <path d="M60 392 Q74 404 86 394" opacity="0.6" />
          <path d="M114 394 Q126 404 140 392" opacity="0.6" />
          {/* midline */}
          <line x1="100" y1="60" x2="100" y2="232" opacity="0.3" />
        </svg>

        {/* hotspots */}
        {systems.map((s) => {
          const pos = SPOT[s.key];
          const Icon = pos.icon;
          const isActive = active === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onSelect(s.key)}
              aria-pressed={isActive}
              aria-label={`Examine ${pos.aria}${s.hasContent ? " — has findings" : ""}`}
              style={{ top: `${pos.top}%`, left: `${pos.left}%` }}
              className="tap absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
            >
              <span
                className={cn(
                  "relative inline-flex size-8 items-center justify-center rounded-full border transition-colors duration-200",
                  isActive
                    ? "border-teal-500 bg-teal-600 text-white shadow-sm ring-2 ring-teal-500/30"
                    : "border-border bg-card text-muted-foreground hover:border-teal-400 hover:text-teal-600",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {s.hasContent ? (
                  <span
                    aria-hidden
                    className="scale-in absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-(--color-card) bg-teal-500"
                  />
                ) : null}
              </span>
              <span
                className={cn(
                  "rounded px-1 text-[9.5px] font-medium whitespace-nowrap transition-colors duration-200",
                  isActive ? "text-teal-700 dark:text-teal-300" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
