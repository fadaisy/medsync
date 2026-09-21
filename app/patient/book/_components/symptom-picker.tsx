"use client";

import type { DraftSymptom } from "../_lib/booking";
import type { BookingSymptomOption } from "@/lib/catalog/symptoms";
import { useId, useState } from "react";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  MAX_SYMPTOM_LABEL,
  MAX_SYMPTOMS,
  SYMPTOM_DURATIONS,
  SYMPTOM_SYSTEMS,
  SYMPTOMS_NOTE,
  symptomSystemLabel,
} from "@/supabase/functions/_shared/symptoms";
import { Chip } from "./pick-steps";

/**
 * "What is bothering you?" — words for the clinic, nothing more (ADR 0095,
 * superseding PRD §5.4 / §7.2 rule 1 for this one section). Optional; the
 * catalogue is flat and in its own order; a chosen entry carries only a
 * label and a duration. Nothing here ranks, scores or colours, and the
 * sentence under the section says so verbatim. Shared by the patient wizard
 * and the reception desk.
 */

/** Shown when a chosen entry still has no duration; the wizard blocks Continue on the same fact. */
export const DURATION_MISSING = "Choose a duration for each one.";

const FULL = `That is the most you can add (${MAX_SYMPTOMS}). Remove one to add another.`;

interface Props {
  options: ReadonlyArray<BookingSymptomOption>;
  value: ReadonlyArray<DraftSymptom>;
  onChange: (next: DraftSymptom[]) => void;
  idPrefix?: string;
}

export function SymptomPicker({ options, value, onChange, idPrefix }: Props) {
  const reactId = useId();
  const id = idPrefix ?? reactId;
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const full = value.length >= MAX_SYMPTOMS;
  const q = query.trim().toLowerCase();
  const shown = q
    ? options.filter(
        (o) =>
          o.display.toLowerCase().includes(q) ||
          o.synonyms.some((s) => s.toLowerCase().includes(q)),
      )
    : options;
  // The catalogue's systems in the lay order, then anything it does not name.
  const systems = [
    ...new Set([...SYMPTOM_SYSTEMS.map((s) => s.code), ...shown.map((o) => o.system)]),
  ].filter((code) => shown.some((o) => o.system === code));

  const chosen = (o: BookingSymptomOption) => value.some((s) => s.code === o.code);
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const toggle = (o: BookingSymptomOption) => {
    const i = value.findIndex((s) => s.code === o.code);
    if (i >= 0) remove(i);
    else if (!full) onChange([...value, { code: o.code, label: o.display, duration: null }]);
  };
  const addCustom = () => {
    const label = custom.trim().slice(0, MAX_SYMPTOM_LABEL);
    if (!label || full) return;
    setCustom("");
    if (value.some((s) => s.label.toLowerCase() === label.toLowerCase())) return;
    onChange([...value, { code: null, label, duration: null }]);
  };

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h3 id={`${id}-title`} className="text-foreground text-body-s font-medium">
          What is bothering you?
        </h3>
        <p className="text-muted-foreground text-caption">
          Optional. Choose anything that fits, or type your own.
        </p>
      </div>

      {value.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Chosen">
          {value.map((s, i) => (
            <li
              key={s.code ?? `custom:${s.label}`}
              className="bg-card dark:shadow-card flex flex-col gap-2 rounded-xl p-3 shadow-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-foreground text-body-s min-w-0 truncate font-medium">
                  {s.label}
                </span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Remove ${s.label}`}
                  className="tap text-muted-foreground hover:text-foreground focus-visible:shadow-focus grid size-11 shrink-0 place-items-center rounded-lg outline-none"
                >
                  <XIcon className="size-4" aria-hidden />
                </button>
              </div>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-muted-foreground text-caption">Duration</legend>
                {/* Real radios, sr-only, styled as chips: one tab stop, arrow
                    keys, an announced state — the ChoiceList idiom. */}
                <div className="flex flex-wrap gap-2">
                  {SYMPTOM_DURATIONS.map((d) => {
                    const on = s.duration === d.code;
                    return (
                      <label
                        key={d.code}
                        className={cn(
                          "tap has-[:focus-visible]:shadow-focus text-body-s flex min-h-11 cursor-pointer items-center rounded-lg px-3",
                          on
                            ? "bg-primary text-primary-foreground font-medium"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <input
                          type="radio"
                          name={`${id}-duration-${i}`}
                          value={d.code}
                          checked={on}
                          onChange={() =>
                            onChange(
                              value.map((e, j) => (j === i ? { ...e, duration: d.code } : e)),
                            )
                          }
                          className="sr-only"
                        />
                        {d.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </li>
          ))}
        </ul>
      ) : null}
      {value.some((s) => s.duration === null) ? (
        // A live region: Continue is disabled while this shows, and a screen
        // reader would otherwise reach an inert button with no reason given.
        <p role="status" className="text-status-caution-fg text-body-s">
          {DURATION_MISSING}
        </p>
      ) : null}
      {full ? (
        // Said where the chips are, since a chip tapped at the cap does nothing.
        <p role="status" className="text-muted-foreground text-body-s">
          {FULL}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-search`}>Search</Label>
        <Input
          id={`${id}-search`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a word"
          autoComplete="off"
          className="min-h-11"
        />
      </div>

      {systems.length === 0 ? (
        <p className="text-muted-foreground text-body-s">
          Nothing in the list matches. Type it under Something else.
        </p>
      ) : (
        systems.map((code) => (
          <div key={code} className="flex flex-col gap-2">
            <h4 className="text-muted-foreground text-caption font-medium">
              {symptomSystemLabel(code)}
            </h4>
            <ul className="flex flex-wrap gap-2">
              {shown
                .filter((o) => o.system === code)
                .map((o) => (
                  <li key={o.code}>
                    <Chip selected={chosen(o)} onSelect={() => toggle(o)}>
                      {o.display}
                    </Chip>
                  </li>
                ))}
            </ul>
          </div>
        ))
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-custom`}>Something else</Label>
        <div className="flex gap-2">
          <Input
            id={`${id}-custom`}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            maxLength={MAX_SYMPTOM_LABEL}
            placeholder="In your own words"
            autoComplete="off"
            disabled={full}
            className="min-h-11"
          />
          <Button type="button" variant="secondary" size="lg" disabled={full} onClick={addCustom}>
            Add
          </Button>
        </div>
        {full ? <p className="text-muted-foreground text-caption">{FULL}</p> : null}
      </div>

      <p className="text-muted-foreground text-body-s">{SYMPTOMS_NOTE}</p>
    </section>
  );
}
