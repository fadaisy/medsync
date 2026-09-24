"use client";

import type { AmpleInput } from "./step-panel-draft";
import type { OptimisticRow } from "./use-desk";
import type { TimelineEvent } from "@/lib/resus/types";
import { useMemo, useState } from "react";
import { XIcon } from "lucide-react";

import { recordStepFindingsV2 } from "@/app/nurse/resus/_v2/actions-survey";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EMPTY_LOCAL } from "@/lib/resus/model";
import { abcAbnormalFrom, legacyStepContext } from "@/lib/resus/survey/context";
import { EXPOSURE_ADAPTER } from "@/lib/resus/survey/floor";
import { buildAllergyNote, buildAssessmentPayload } from "@/lib/resus/v2-payloads";
import { VITAL_INPUT_BOUNDS } from "@/lib/resus/vitals";
import { useDeskCtx } from "./desk-context";
import {
  diffCount,
  findingsFor,
  inRange,
  seedFor,
  stepDrafts,
  toAmpleInput,
} from "./step-panel-draft";
import { toOutcome } from "./use-desk";

/**
 * Resus Desk v2 — the E AMPLE editor as a drawer (prompt §5.2): opened from the
 * context bar's Allergies chip and from E. AMPLE stays stored in step E; Save
 * re-records E with the AMPLE merged in, so the server also writes the
 * allergy-capture note the prescribing allergy check reads. An unsaved E draft
 * is recorded with it (never silently replaced by the older E record).
 */

/** The allergy-capture note the server writes beside an E record (optimistic twin). */
export function allergyNoteRows(ample: AmpleInput | null | undefined): OptimisticRow[] {
  const allergies = ample?.allergies ?? [];
  if (allergies.length === 0 && !ample?.nkda) return [];
  return [
    {
      kind: "note",
      step: null,
      payload: buildAllergyNote(allergies, ample?.nkda === true && allergies.length === 0),
    },
  ];
}

/** The latest allergy capture in the record (latest wins; NKDA clears), or null. */
export function latestAllergyCapture(
  events: readonly TimelineEvent[],
): { substances: string[]; nkda: boolean } | null {
  let latest: TimelineEvent | null = null;
  for (const e of events)
    if (e.payload.allergyCapture && (!latest || e.recordedAt >= latest.recordedAt)) latest = e;
  const cap = latest?.payload.allergyCapture as
    | { substances?: string[]; nkda?: boolean }
    | undefined;
  if (!cap) return null;
  return { substances: cap.nkda ? [] : (cap.substances ?? []), nkda: cap.nkda === true };
}

const FIELD =
  "border-border bg-card text-body-l sm:text-body-m text-foreground w-full rounded-md border px-3 py-2 outline-none focus-visible:border-teal-500 focus-visible:shadow-focus disabled:opacity-60";

export function AmpleDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <SheetContent widthClassName="w-full sm:max-w-[480px]">
        <AmpleForm onClose={onClose} />
      </SheetContent>
    </Sheet>
  );
}
function AmpleForm({ onClose }: { onClose: () => void }) {
  const { store, ui, flags, inArrest, survey } = useDeskCtx();
  const readOnly = store.readOnly;
  const latestE = useMemo(() => EXPOSURE_ADAPTER.latest(store.activeEvents), [store.activeEvents]);
  const capture = useMemo(() => latestAllergyCapture(store.activeEvents), [store.activeEvents]);
  const init = toAmpleInput(latestE?.ample);
  const [allergies, setAllergies] = useState<string[]>(
    capture?.substances ?? init?.allergies ?? [],
  );
  const [nkda, setNkda] = useState(capture?.nkda ?? init?.nkda === true);
  const [entry, setEntry] = useState("");
  const [meds, setMeds] = useState(init?.medications ?? "");
  const [past, setPast] = useState(init?.pastHistory ?? "");
  const [meal, setMeal] = useState(init?.lastMeal ?? "");
  const [events, setEvents] = useState(init?.events ?? "");

  const split = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim().slice(0, 80))
      .filter(Boolean);
  const withEntry = [...new Set([...allergies, ...split(entry)])].slice(0, 30);
  const add = () => {
    if (!entry.trim()) return;
    setAllergies(withEntry);
    setEntry("");
    setNkda(false);
  };
  const empty =
    withEntry.length === 0 && !nkda && ![meds, past, meal, events].some((s) => s.trim());

  function save() {
    const ample: AmpleInput = {
      allergies: withEntry,
      medications: meds.trim() || undefined,
      pastHistory: past.trim() || undefined,
      lastMeal: meal.trim() || undefined,
      events: events.trim() || undefined,
      nkda: nkda && withEntry.length === 0 ? true : undefined,
    };
    const episodeId = store.episode.id;
    const seedE = seedFor("E", store.activeEvents);
    const held = stepDrafts.get(episodeId, "E");
    const draft = held && diffCount(held.draft, seedE.draft) > 0 ? held.draft : null;
    // A valid unsaved E draft goes in with the AMPLE; otherwise keep the latest E findings.
    const { min, max } = VITAL_INPUT_BOUNDS.temperature;
    const withDraft = draft !== null && inRange(draft.coreTemp, min, max);
    const findings = withDraft
      ? { ...findingsFor("E", draft, seedE.carry), ample }
      : {
          state: latestE?.state ?? null,
          present: latestE?.present ?? [],
          coreTempC: latestE?.coreTempC ?? null,
          ample,
        };
    const local = {
      ...EMPTY_LOCAL,
      ...ui.local,
      notRecovered: ui.local.notRecovered || latestE?.context.notRecovered === true,
      ...(withDraft ? draft.local : {}),
    };
    const context = legacyStepContext("E", {
      flags,
      inArrest,
      local,
      abcAbnormal: abcAbnormalFrom(survey.states),
    });
    const id = store.submit({
      label: "Save AMPLE",
      optimistic: () => [
        {
          kind: "assessment",
          step: "E",
          payload: buildAssessmentPayload("E", { ...findings, context }),
        },
        ...allergyNoteRows(ample),
      ],
      run: async ({ clientEventId, recordedAt }) =>
        toOutcome(
          await recordStepFindingsV2({
            episodeId: store.episode.id,
            clientEventId,
            recordedAt,
            step: "E",
            findings,
            local,
          }),
        ),
    });
    // Recorded with it, or (invalid, e.g. a mistyped temperature) kept on top of the new E record.
    stepDrafts.set(episodeId, "E", draft && !withDraft ? { base: id, draft } : null);
    ui.toast({ message: withDraft ? "AMPLE and E findings saved" : "AMPLE saved" });
    onClose();
  }

  const text = (label: string, value: string, set: (v: string) => void, max: number) => (
    <label className="flex flex-col gap-1">
      <span className="text-caption text-muted-foreground">{label}</span>
      <textarea
        rows={2}
        maxLength={max}
        value={value}
        disabled={readOnly}
        onChange={(e) => set(e.target.value)}
        className={FIELD}
      />
    </label>
  );

  return (
    <>
      <SheetHeader>
        <SheetTitle>AMPLE history</SheetTitle>
        <SheetDescription>Allergies feed the prescribing allergy check.</SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-caption text-muted-foreground mb-1">Allergies</legend>
          {allergies.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {allergies.map((a) => (
                <button
                  key={a}
                  type="button"
                  disabled={readOnly}
                  onClick={() => setAllergies(allergies.filter((x) => x !== a))}
                  aria-label={`Remove ${a}`}
                  className="tap text-body-s inline-flex min-h-11 items-center gap-1.5 rounded-md bg-amber-100 px-3 text-amber-800 disabled:opacity-60 dark:bg-amber-900/40 dark:text-amber-200"
                >
                  {a}
                  {readOnly ? null : <XIcon className="size-3.5" aria-hidden />}
                </button>
              ))}
            </div>
          ) : null}
          {readOnly ? null : (
            <div className="flex gap-2">
              <input
                value={entry}
                maxLength={400}
                onChange={(e) => setEntry(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
                placeholder="e.g. penicillin, peanut"
                aria-label="Add an allergy"
                className={FIELD}
              />
              <button
                type="button"
                onClick={add}
                className="tap border-border text-body-s hover:bg-muted min-h-11 shrink-0 rounded-md border px-4 font-medium"
              >
                Add
              </button>
            </div>
          )}
          <label className="text-body-s text-foreground flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-teal-600"
              checked={nkda && withEntry.length === 0}
              disabled={readOnly || withEntry.length > 0}
              onChange={(e) => setNkda(e.target.checked)}
            />
            No known drug allergies (NKDA)
          </label>
        </fieldset>
        {text("Medications (incl. patches / anticoagulants)", meds, setMeds, 500)}
        {text("Past history", past, setPast, 500)}
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted-foreground">Last meal</span>
          <input
            value={meal}
            maxLength={200}
            disabled={readOnly}
            onChange={(e) => setMeal(e.target.value)}
            className={FIELD}
          />
        </label>
        {text("Events / environment (mechanism, timeline, toxins)", events, setEvents, 500)}
      </SheetBody>
      <SheetFooter>
        <button
          type="button"
          onClick={onClose}
          className="tap text-body-s text-muted-foreground hover:bg-muted min-h-11 rounded-md px-4 font-medium"
        >
          {readOnly ? "Close" : "Cancel"}
        </button>
        {readOnly ? null : (
          <button
            type="button"
            disabled={empty}
            onClick={save}
            className="tap text-body-s bg-primary text-primary-foreground enabled:hover:bg-primary-hover min-h-11 rounded-md px-4 font-medium disabled:opacity-50"
          >
            Save AMPLE
          </button>
        )}
      </SheetFooter>
    </>
  );
}
