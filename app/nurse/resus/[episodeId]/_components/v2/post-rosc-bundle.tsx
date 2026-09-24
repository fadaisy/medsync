"use client";

import type { LineState } from "./post-rosc-bundle-rows";
import type { BundleItemState } from "@/lib/resus/model";
import type { PostRoscBundleItem, PostRoscDomain } from "@/lib/resus/reference/post-rosc-catalog";
import type { AbcdeLetter } from "@/lib/resus/types";
import { useMemo, useState } from "react";
import { CheckIcon, ChevronDownIcon, InfoIcon, PinIcon } from "lucide-react";

import { setObeysCommandsV2, setPostRoscItemV2 } from "@/app/nurse/resus/_v2/actions-arrest";
import { bundleState, obeysCommands, postRoscPins } from "@/lib/resus/closeout/post-rosc";
import { ADULT_MIN_AGE_YEARS } from "@/lib/resus/reference/als-catalog";
import { POST_ROSC_BUNDLE, POST_ROSC_REF } from "@/lib/resus/reference/post-rosc-catalog";
import { refValue } from "@/lib/resus/reference/ref";
import { cn } from "@/lib/utils";
import { useDeskCtx } from "./desk-context";
import {
  ItemRow,
  OBEYS_ID,
  ObeysRow,
  RecordedLine,
  signedText,
  STATES,
} from "./post-rosc-bundle-rows";
import { toOutcome } from "./use-desk";

/**
 * The post-ROSC bundle (docs/clinical/resus-post-rosc-clinical-catalog.md): the
 * PR-* checklist rows grouped A / B / C / D / E / Cause / Family, each done / not
 * indicated / not available here (latest wins). Sections collapse ("n of m
 * recorded"); the one holding the first open item opens at mount; a recorded item
 * is one line with its state (tap to change). The section pins (PR-PIN-B..E) stay
 * visible when collapsed; the oximetry caveat (PR-B-04) stays under the SpO₂ row
 * in both its forms. D asks "Obeys
 * commands?" (PR-D-01). PR-NEVER-01 is a standing rule, not a row — the desk
 * makes no prognostic statement.
 */

type DomainKey = Exclude<PostRoscDomain, null>;

const DOMAINS: { key: DomainKey; label: string }[] = [
  { key: "A", label: "A · Airway" },
  { key: "B", label: "B · Breathing" },
  { key: "C", label: "C · Circulation" },
  { key: "D", label: "D · Disability" },
  { key: "E", label: "E · Exposure" },
  { key: "Cause", label: "Cause work-up" },
  { key: "Family", label: "Family" },
];
const PIN_STEPS: readonly string[] = ["B", "C", "D", "E"];
const CAVEAT_ID = "PR-B-04";
const SPO2_ID = "PR-B-02";

const toggled = <T,>(s: ReadonlySet<T>, v: T, on: boolean): ReadonlySet<T> => {
  const n = new Set(s);
  if (on) n.add(v);
  else n.delete(v);
  return n;
};

export function PostRoscBundle() {
  const { store, ageYears } = useDeskCtx();
  // Law 7 / D13: a child never sees an adult number — rows that carry one are withheld.
  const child = ageYears !== null && ageYears < ADULT_MIN_AGE_YEARS;
  const events = store.activeEvents;
  const states = useMemo(() => bundleState(events), [events]);
  const obeys = useMemo(() => obeysCommands(events), [events]);
  const episodeId = store.episode.id;
  const disabled = store.readOnly;

  const rows = POST_ROSC_BUNDLE.filter(
    (i) =>
      i.checklist &&
      i.domain !== null &&
      i.id !== CAVEAT_ID &&
      (!child || !i.showsNumber || i.id === OBEYS_ID),
  );
  const isRecorded = (i: PostRoscBundleItem) =>
    i.id === OBEYS_ID ? obeys !== null : (states[i.id] ?? "open") !== "open";
  const recorded = rows.filter(isRecorded).length;

  const [open, setOpen] = useState<ReadonlySet<PostRoscDomain>>(
    () => new Set([rows.find((i) => !isRecorded(i))?.domain ?? null]),
  );
  const [editing, setEditing] = useState<ReadonlySet<string>>(() => new Set());
  // The item whose row / line should hold the focus after it re-renders in its other form.
  const [focusId, setFocusId] = useState<string | null>(null);
  const settle = (itemId: string) => {
    setEditing((s) => toggled(s, itemId, false));
    setFocusId(itemId);
  };

  const pick = (itemId: string, state: BundleItemState) => {
    settle(itemId);
    if (states[itemId] === state) return;
    const label = `${POST_ROSC_REF[itemId]!.text.slice(0, 80)} — ${state.replace(/_/g, " ")}`;
    store.submit({
      label,
      optimistic: () => [
        {
          kind: "decision",
          step: "post",
          payload: { decision: "post_rosc_item", itemId, state, label },
        },
      ],
      run: async ({ clientEventId, recordedAt }) =>
        toOutcome(await setPostRoscItemV2({ episodeId, clientEventId, recordedAt, itemId, state })),
    });
  };

  const setObeys = (value: boolean) => {
    settle(OBEYS_ID);
    if (obeys === value) return;
    const label = value ? "Obeys commands (motor 6)" : "Does not obey commands — comatose";
    store.submit({
      label,
      optimistic: () => [
        { kind: "decision", step: "post", payload: { decision: "obeys_commands", value, label } },
      ],
      run: async ({ clientEventId, recordedAt }) =>
        toOutcome(await setObeysCommandsV2({ episodeId, clientEventId, recordedAt, value })),
    });
  };

  const renderItem = (item: PostRoscBundleItem) => {
    const focus = focusId === item.id;
    // PR-B-04: the caveat goes under the SpO₂ target row, open or recorded — never its own row.
    const note =
      item.id === SPO2_ID ? (
        <p className="text-caption text-muted-foreground flex gap-1.5">
          <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          {signedText(CAVEAT_ID)}
        </p>
      ) : null;
    if (isRecorded(item) && !editing.has(item.id)) {
      const state: LineState =
        item.id === OBEYS_ID
          ? { label: obeys ? "Yes" : "No — comatose", icon: CheckIcon, on: STATES[0]!.on }
          : STATES.find((s) => s.value === states[item.id])!;
      return (
        <RecordedLine
          key={item.id}
          text={item.id === OBEYS_ID ? "Obeys commands?" : signedText(item.id)}
          state={state}
          note={note}
          disabled={disabled}
          focus={focus}
          onEdit={() => {
            setEditing((s) => toggled(s, item.id, true));
            setFocusId(item.id);
          }}
        />
      );
    }
    return item.id === OBEYS_ID ? (
      <ObeysRow
        key={item.id}
        obeys={obeys}
        child={child}
        disabled={disabled}
        focus={focus}
        onPick={setObeys}
      />
    ) : (
      <ItemRow
        key={item.id}
        item={item}
        value={states[item.id] ?? "open"}
        note={note}
        disabled={disabled}
        focus={focus}
        onPick={(s) => pick(item.id, s)}
      />
    );
  };

  return (
    <div className="px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-overline text-muted-foreground uppercase">Post-ROSC bundle</h3>
        <p className="text-caption text-muted-foreground">
          {recorded} of {rows.length} recorded · targets CSO-signed
        </p>
      </div>
      {child ? (
        <p className="text-caption text-muted-foreground">
          Child — adult targets are not shown (D13).
        </p>
      ) : null}
      <div className="mt-1">
        {DOMAINS.map((dom) => {
          const items = rows.filter((i) => i.domain === dom.key);
          if (items.length === 0) return null;
          const done = items.filter(isRecorded).length;
          const isOpen = open.has(dom.key);
          const pins =
            child || !PIN_STEPS.includes(dom.key) ? [] : postRoscPins(dom.key as AbcdeLetter);
          return (
            <section key={dom.key} className="border-border border-t py-1">
              <h4 className="text-body-s text-foreground font-medium">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`post-rosc-${dom.key}`}
                  onClick={() => {
                    setFocusId(null);
                    setOpen((s) => toggled(s, dom.key, !isOpen));
                  }}
                  className="hover:bg-muted focus-visible:shadow-focus -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 text-left outline-none"
                >
                  {dom.label}
                  <span className="text-caption text-muted-foreground inline-flex items-center gap-1 font-normal">
                    {done === items.length ? <CheckIcon className="size-3.5" aria-hidden /> : null}
                    {done} of {items.length} recorded
                  </span>
                  <ChevronDownIcon
                    aria-hidden
                    className={cn(
                      "text-muted-foreground ease-expo-out ml-auto size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
              </h4>
              {/* An open B prints the caveat under its SpO₂ row instead. */}
              {pins
                .filter((p) => !(isOpen && p.id === CAVEAT_ID))
                .map((p) => {
                  const Icon = p.id === CAVEAT_ID ? InfoIcon : PinIcon;
                  return (
                    <p key={p.id} className="text-caption text-muted-foreground flex gap-1.5 pb-1">
                      <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
                      <span>
                        {p.id === CAVEAT_ID ? null : <span className="sr-only">Pinned: </span>}
                        {refValue(p)}
                      </span>
                    </p>
                  );
                })}
              {isOpen ? (
                <ul id={`post-rosc-${dom.key}`} className="divide-border divide-y">
                  {items.map(renderItem)}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
