"use client";

import type { SubmissionAudience } from "@/supabase/functions/_shared/symptom-catalog/types";

import { cn } from "@/lib/utils";

export type Who = "me" | "child" | "other";
export type AgeBand = Extract<SubmissionAudience, `child_${string}`>;

export interface AudienceState {
  who: Who;
  ageBand: AgeBand;
  pregnant: boolean;
}

/** The concrete audience the classifier sees (PRD §6.1). */
export function toAudience(a: AudienceState): SubmissionAudience {
  if (a.who === "child") return a.ageBand;
  return a.pregnant ? "pregnant" : "adult";
}

const WHO: ReadonlyArray<{ value: Who; label: string }> = [
  { value: "me", label: "Me" },
  { value: "child", label: "A child" },
  { value: "other", label: "Someone else" },
];
const BANDS: ReadonlyArray<{ value: AgeBand; label: string }> = [
  { value: "child_u2m", label: "Under 2 months" },
  { value: "child_2m_5y", label: "2 months – 5 years" },
  { value: "child_5_12", label: "5 – 12 years" },
];

/**
 * S1's first row: who this is about, as real radios drawn as a segmented
 * control (44px). A child adds the age band; an adult adds the pregnancy
 * toggle — for "Me" only when the profile's sex at birth makes it relevant,
 * for "Someone else" always (PRD §6.1).
 */
export function AudienceSelector({
  value,
  showPregnancyForMe,
  onChange,
}: {
  value: AudienceState;
  showPregnancyForMe: boolean;
  onChange: (next: AudienceState) => void;
}) {
  const pregnancyRelevant = value.who === "other" || (value.who === "me" && showPregnancyForMe);
  return (
    <div className="flex flex-col gap-2">
      <fieldset className="bg-muted grid min-h-11 grid-cols-3 gap-1 rounded-lg p-1">
        <legend className="sr-only">Who is this about?</legend>
        {WHO.map((w) => (
          <Segment
            key={w.value}
            name="who"
            checked={value.who === w.value}
            label={w.label}
            onChange={() => onChange({ ...value, who: w.value })}
          />
        ))}
      </fieldset>
      {value.who === "child" ? (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="text-muted-foreground text-caption mb-1 w-full">
            How old is the child?
          </legend>
          {BANDS.map((b) => (
            <Segment
              key={b.value}
              name="age-band"
              checked={value.ageBand === b.value}
              label={b.label}
              onChange={() => onChange({ ...value, ageBand: b.value })}
            />
          ))}
        </fieldset>
      ) : pregnancyRelevant ? (
        <label className="tap bg-card dark:shadow-card has-[:focus-visible]:shadow-focus flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-3 shadow-xs">
          <input
            type="checkbox"
            checked={value.pregnant}
            onChange={(e) => onChange({ ...value, pregnant: e.target.checked })}
            className="accent-brand-500 size-4 shrink-0"
          />
          <span className="text-foreground text-body-s">
            Pregnant, or gave birth in the last 6 weeks
          </span>
        </label>
      ) : null}
    </div>
  );
}

function Segment({
  name,
  checked,
  label,
  onChange,
}: {
  name: string;
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "tap text-body-s has-[:focus-visible]:shadow-focus flex min-h-9 cursor-pointer items-center justify-center rounded-md px-3 text-center",
        checked ? "bg-foreground text-background font-medium" : "text-muted-foreground",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {label}
    </label>
  );
}
