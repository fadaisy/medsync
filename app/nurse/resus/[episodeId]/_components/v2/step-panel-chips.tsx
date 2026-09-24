"use client";

import type { FindingGroup } from "@/lib/resus/reference/presentation";
import type { AbcdeLetter } from "@/lib/resus/types";
import type { ReactNode } from "react";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";

import { AIRWAY_PATENCY_LABEL } from "@/lib/resus/reference/airway-catalog";
import { BREATHING_STATE_LABEL } from "@/lib/resus/reference/breathing-catalog";
import { CIRCULATORY_STATE_LABEL } from "@/lib/resus/reference/circulation-catalog";
import { DISABILITY_STATE_LABEL } from "@/lib/resus/reference/disability-catalog";
import { EXPOSURE_STATE_LABEL } from "@/lib/resus/reference/exposure-catalog";
import { FINDING_GROUPS } from "@/lib/resus/reference/presentation";
import { cn } from "@/lib/utils";

/**
 * Resus Desk v2 — the step panel's findings controls (part of step-panel.tsx):
 * finding chips (`data-chip`), overall-picture chips (`data-overall`), rows,
 * step-local toggles, "More signs" by group, and search.
 */

const OVERALL: Record<AbcdeLetter, Record<string, string>> = {
  A: AIRWAY_PATENCY_LABEL,
  B: BREATHING_STATE_LABEL,
  C: CIRCULATORY_STATE_LABEL,
  D: DISABILITY_STATE_LABEL,
  E: EXPOSURE_STATE_LABEL,
};

/** The signed state label split into a chip title and its qualifier. */
export function overallLabel(step: AbcdeLetter, code: string): { short: string; detail: string } {
  const full = OVERALL[step][code] ?? code;
  const short = full.split(/ — | \(/)[0] ?? full;
  const detail = full
    .slice(short.length)
    .replace(/[()]/g, "")
    .replace(/^\s*—\s*/, "")
    .trim();
  return { short, detail };
}

const CHIP =
  "tap text-body-s inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 py-1.5 text-left disabled:opacity-60";
/**
 * A selected finding / context flag (DESIGN-medsync: the brand teal selected
 * state). The teal ramp flips in .dark, so no dark: overrides: text ≥ 7:1 and
 * a teal-600 border ≥ 3:1 against the card in both themes.
 */
export const SELECTED = "border-teal-600 bg-teal-50 text-teal-800";

export function Chip({
  label,
  detail,
  on,
  disabled,
  onToggle,
  overall = false,
  measure = true,
}: {
  label: string;
  detail?: string;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
  /** An overall-picture chip (not counted in the finding-chip budget). */
  overall?: boolean;
  /** Counted as a finding chip (`data-chip`). */
  measure?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onToggle}
      data-chip={measure && !overall ? "" : undefined}
      data-overall={overall ? "" : undefined}
      className={cn(
        CHIP,
        on
          ? overall
            ? "border-foreground bg-foreground text-background"
            : SELECTED
          : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {on ? <CheckIcon className="size-3.5 shrink-0" aria-hidden /> : null}
      <span className="flex flex-col">
        <span>{label}</span>
        {detail ? (
          <span className={cn("text-caption", on ? "opacity-80" : "text-muted-foreground")}>
            {detail}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function FindingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-overline text-muted-foreground uppercase">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** A step-local toggle (A gag, D low RR, E left exposed) — a switch, not a finding. */
export function LocalToggle({
  label,
  on,
  hint,
  disabled,
  onToggle,
}: {
  label: string;
  on: boolean;
  hint: string | null;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={cn(CHIP, "border-border bg-card text-foreground hover:bg-muted")}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-sm border",
          on ? "border-foreground bg-foreground text-background" : "border-gray-500",
        )}
      >
        {on ? <CheckIcon className="size-3" /> : null}
      </span>
      {label}
      {hint ? (
        <span className="text-caption text-amber-700 dark:text-amber-300">· {hint}</span>
      ) : null}
    </button>
  );
}

const GROUP_LABEL: Record<FindingGroup, string> = {
  look: "Look",
  listen: "Listen",
  feel: "Feel",
  measure: "Measure",
  results: "Results",
};
/** "More signs ▸ Look 6 · Feel 9 · Results 11" — collapsed, by group. */
export function MoreSigns({
  step,
  groups,
  open,
  onOpen,
  renderChips,
  children,
}: {
  step: AbcdeLetter;
  groups: Record<FindingGroup, string[]>;
  open: boolean;
  onOpen: (open: boolean) => void;
  renderChips: (codes: string[]) => ReactNode;
  children?: ReactNode;
}) {
  const present = FINDING_GROUPS.filter((g) => groups[g].length > 0);
  const counts = present.map((g) => `${GROUP_LABEL[g]} ${groups[g].length}`).join(" · ");
  const id = `more-signs-${step}`;
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onOpen(!open)}
        className="tap border-border text-body-s text-foreground hover:bg-muted flex min-h-11 w-full items-center justify-between gap-2 rounded-md border px-3 text-left"
      >
        <span>
          <span className="font-medium">More signs</span>
          {counts ? <span className="text-muted-foreground"> · {counts}</span> : null}
        </span>
        <ChevronDownIcon
          className={cn(
            "ease-expo-out size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div id={id} className="flex flex-col gap-4">
          {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
          {present.map((g) => (
            <FindingRow key={g} label={GROUP_LABEL[g]}>
              {renderChips(groups[g])}
            </FindingRow>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SearchSigns({
  query,
  onQuery,
  matches,
  renderChips,
}: {
  query: string;
  onQuery: (q: string) => void;
  matches: string[];
  renderChips: (codes: string[]) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="relative flex items-center">
        <SearchIcon className="text-muted-foreground absolute left-3 size-4" aria-hidden />
        <span className="sr-only">Search signs</span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search signs (e.g. tension, bleed)"
          className="border-border bg-card text-body-l sm:text-body-m text-foreground placeholder:text-muted-foreground focus-visible:shadow-focus min-h-11 w-full rounded-md border pr-3 pl-9 outline-none focus-visible:border-teal-500"
        />
      </label>
      <p className="sr-only" aria-live="polite">
        {query.trim() === ""
          ? ""
          : matches.length > 0
            ? `${matches.length} ${matches.length === 1 ? "sign matches" : "signs match"}`
            : `No sign matches “${query.trim()}”.`}
      </p>
      {query.trim() === "" ? null : matches.length > 0 ? (
        <div className="flex flex-wrap gap-2">{renderChips(matches)}</div>
      ) : (
        <p className="text-body-s text-muted-foreground">No sign matches “{query.trim()}”.</p>
      )}
    </div>
  );
}
