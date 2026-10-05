"use client";

import type { ExamView } from "./model";
import type { ExamAttribute, ExamItem } from "@/lib/clerking/exam/catalogue";
import type { AttrValue, ExamDraft } from "@/lib/clerking/exam/payload";
import type { KeyboardEvent } from "react";
import { useState } from "react";
import { ArrowUpRightIcon, CheckIcon, LockIcon, MinusIcon } from "lucide-react";

import { EmrDialog } from "@/components/emr/emr-dialog";
import { Button } from "@/components/ui/button";
import * as A from "@/lib/clerking/exam/answers";
import { appliesToSex } from "@/lib/clerking/exam/catalogue";
import { itemSummary } from "@/lib/clerking/exam/compose";
import { cn } from "@/lib/utils";
import { Chip, ScaleStrip, Stepper } from "../controls";
import { ResultPill } from "./result-pill";

/**
 * One examination item, rendered by its response type (PROMPT-CLERKING-EXAM-V2 §4 card anatomy 5,
 * E1): the label and the live clause on the left, the control in the item's own words on the
 * right, and under a positive answer the attribute box (150 px label column; chips, steppers, body
 * maps, the 0–10 strip; `shown_when` rows appear with their parent). Components never name an item.
 */

const FOCUS = "outline-none focus-visible:shadow-focus";

export interface RowProps {
  v: ExamView;
  item: ExamItem;
  editable: boolean;
  sex: "female" | "male" | null;
  onExam: (fn: (d: ExamDraft) => ExamDraft) => void;
  /** Open another system / part / item (links, mirrors, read-only owners). */
  onGo: (system: string, part?: string, item?: string) => void;
  onNotExamined: (itemId: string) => void;
}

const restricted = (s?: string) => !!s && s !== "standard";

/** The two answers in the item's own words; tapping the recorded one clears it. `data-answer`
 *  lets `a` and `p` answer the focused row (§5.16). */
export function PairButtons({
  label,
  negative,
  positive,
  value,
  onAnswer,
  disabled,
}: {
  label: string;
  negative: string;
  positive: string;
  value: "negative" | "positive" | undefined;
  onAnswer: (s: "negative" | "positive") => void;
  disabled?: boolean;
}) {
  const btn = (s: "negative" | "positive", word: string) => {
    const on = value === s;
    return (
      <button
        type="button"
        data-answer={s === "negative" ? "a" : "p"}
        aria-pressed={on}
        disabled={disabled}
        onClick={() => onAnswer(s)}
        className={cn(
          "text-caption inline-flex min-h-7 items-center gap-1 rounded-sm px-2.5 whitespace-nowrap pointer-coarse:min-h-11",
          "max-sm:text-body-s max-sm:min-h-9 max-sm:justify-center max-sm:font-medium",
          FOCUS,
          on
            ? s === "positive"
              ? "bg-card text-teal-800 shadow-xs"
              : "bg-card text-foreground shadow-xs"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {on ? (
          s === "positive" ? (
            <CheckIcon aria-hidden className="size-3" />
          ) : (
            <MinusIcon aria-hidden className="size-3" />
          )
        ) : null}
        {word}
      </button>
    );
  };
  return (
    <span
      role="group"
      aria-label={label}
      className="bg-muted inline-flex shrink-0 rounded-md p-0.5 max-sm:rounded-[10px]"
    >
      {btn("negative", negative)}
      {btn("positive", positive)}
    </span>
  );
}

/* ─── Body maps ───────────────────────────────────────────────────── */

const ZONE_WORDS = (label: string, map?: string) => {
  if (map !== "lungs") return label;
  const [side, level, back] = label.split(" ");
  return `${side === "R" ? "Right" : "Left"} ${level} zone${back ? ", back" : ", front"}`;
};

export function BodyMap({
  v,
  attr,
  value,
  onToggle,
  disabled,
}: {
  v: ExamView;
  attr: ExamAttribute;
  value: readonly string[];
  onToggle: (zone: string) => void;
  disabled?: boolean;
}) {
  const zones = v.ecat.zones(attr);
  const zoneButton = (z: { id: string; label: string }, short: string) => {
    const on = value.includes(z.id);
    return (
      <button
        key={z.id}
        type="button"
        aria-pressed={on}
        aria-label={ZONE_WORDS(z.label, attr.body_map)}
        disabled={disabled}
        onClick={() => onToggle(z.id)}
        className={cn(
          "text-caption flex min-h-9 items-center justify-center rounded-sm border px-1 text-center pointer-coarse:min-h-11",
          FOCUS,
          on
            ? "border-teal-600 bg-teal-50 text-teal-800"
            : "border-border bg-card text-muted-foreground hover:bg-muted",
        )}
      >
        {short}
      </button>
    );
  };
  const listText = value.length
    ? value
        .map((id) => ZONE_WORDS(zones.find((z) => z.id === id)?.label ?? id, attr.body_map))
        .join("; ")
    : "None marked";
  return (
    <div className="flex flex-col gap-2">
      {attr.body_map === "lungs" ? (
        <div className="flex flex-wrap gap-4">
          {(["front", "back"] as const).map((view) => (
            <figure key={view} className="flex flex-col gap-1">
              <figcaption className="text-caption text-muted-foreground">
                {view === "front" ? "Front" : "Back"}
              </figcaption>
              <div
                role="group"
                aria-label={`Lung zones, ${view}. ${view === "front" ? "The patient's right is on your left." : "The patient's right is on your right."}`}
                className="border-border grid w-44 grid-cols-2 gap-1 rounded-[40%_40%_12%_12%/20%_20%_8%_8%] border p-2 pt-4"
              >
                {zones
                  .filter((z) => z.view === view)
                  .map((z) =>
                    zoneButton(
                      z,
                      z.label
                        .replace(/ back$/, "")
                        .replace(/^R /, "R ")
                        .replace(/^L /, "L "),
                    ),
                  )}
              </div>
            </figure>
          ))}
          <p className="text-caption text-muted-foreground self-end">
            Patient’s right is on your left (front view)
          </p>
        </div>
      ) : attr.body_map === "abdomen" ? (
        <div className="flex flex-col gap-1">
          <div
            role="group"
            aria-label="Abdominal regions. The patient's right is on your left."
            className="grid w-full max-w-sm grid-cols-3 gap-1"
          >
            {zones.map((z) => zoneButton(z, z.label))}
          </div>
          <p className="text-caption text-muted-foreground">Patient’s right is on your left</p>
        </div>
      ) : attr.body_map === "spine" ? (
        <div
          role="group"
          aria-label="Spinal levels"
          className="grid grid-cols-5 gap-1 sm:grid-cols-9 lg:grid-cols-13"
        >
          {zones.map((z) => zoneButton(z, z.label))}
        </div>
      ) : (
        <div role="group" aria-label={attr.label} className="flex flex-wrap gap-1.5">
          {zones.map((z) => zoneButton(z, z.label))}
        </div>
      )}
      <p className="text-caption text-muted-foreground">
        <span className="sr-only">Marked: </span>
        {listText}
      </p>
    </div>
  );
}

/* ─── Attribute box ───────────────────────────────────────────────── */

function AttributeControl({ p, attr }: { p: RowProps; attr: ExamAttribute }) {
  const { v, item, editable, onExam } = p;
  const value = A.readAttr(v.ecat, v.exam, item.id, attr.id);
  const set = (val: string | number | null) =>
    onExam((d) => A.setAttr(v.ecat, d, item.id, attr.id, val));
  const has = (o: string) => (Array.isArray(value) ? value.includes(o) : value === o);

  if (attr.kind === "number") {
    const s = A.stepperValue(attr, value);
    const step = attr.step ?? 1;
    return (
      <span className="inline-flex items-center gap-2">
        <Stepper
          label={attr.label}
          value={s.touched ? s.value : null}
          disabled={!editable}
          // The shown start is only where the stepper begins; the first press stores start ± step (E8).
          onStep={(d) => set(Math.round((s.value + d * step) * 100) / 100)}
        />
        <span className="text-caption text-muted-foreground">
          {s.touched ? attr.unit : `${attr.unit ?? ""} · starts at ${s.value}`.trim()}
        </span>
      </span>
    );
  }
  if (attr.kind === "scale")
    return (
      <ScaleStrip
        label={attr.label}
        value={typeof value === "number" ? value : undefined}
        onPick={(n) => set(value === n ? null : n)}
        cautionFrom={null}
        disabled={!editable}
      />
    );
  if (attr.kind === "zones" && (attr.body_map || !attr.options?.length))
    return (
      <BodyMap
        v={v}
        attr={attr}
        value={Array.isArray(value) ? value : []}
        onToggle={(z) => set(z)}
        disabled={!editable}
      />
    );
  const options =
    attr.kind === "shared" && attr.shared_with
      ? (v.ecat.attribute(attr.shared_with.item, attr.shared_with.attribute)?.options ?? [])
      : (attr.options ?? []);
  return (
    <span role="group" aria-label={attr.label} className="flex flex-wrap gap-1.5">
      {options
        .filter((o) => appliesToSex(o as { applies_to_sex?: "female" | "male" | null }, p.sex))
        .map((o) => {
          const edge =
            attr.kind === "shared"
              ? undefined
              : v.ecat.mirror({ item: item.id, attribute: attr.id, option: o.id });
          const owner = edge?.to[0];
          return (
            <span key={o.id} className="inline-flex items-center gap-1">
              <Chip
                selected={has(o.id)}
                disabled={!editable || !!edge?.readOnly}
                onPress={() => set(o.id)}
              >
                {o.label}
                {restricted(o.sensitivity) ? (
                  <LockIcon aria-label="restricted" className="size-3" />
                ) : null}
                {o.who_stage_hint ? (
                  <span className="text-caption text-muted-foreground font-normal">{`WHO stage ${o.who_stage_hint} hint`}</span>
                ) : null}
              </Chip>
              {edge?.readOnly && owner ? (
                <button
                  type="button"
                  onClick={() => {
                    const place = v.ecat.placeOf(owner.item);
                    if (place) p.onGo(place.system.id, place.part.id, owner.item);
                  }}
                  className={cn(
                    "text-caption text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300",
                    FOCUS,
                  )}
                >
                  {`Recorded in ${v.ecat.item(owner.item)?.label ?? "its owner"}`}
                </button>
              ) : null}
            </span>
          );
        })}
    </span>
  );
}

export function AttributeBox(p: RowProps) {
  const e = p.v.exam.entries[p.item.id];
  const attrs = A.visibleAttributes(p.item, e, p.sex).filter(
    (a) => !(p.item.response.type === "measured" && a.id === "muac"),
  );
  if (!attrs.length) return null;
  return (
    <div
      data-slot="attribute-box"
      className="bg-muted/40 border-border ml-0 flex flex-col gap-2.5 rounded-md border p-3 sm:ml-4"
    >
      {attrs.map((a) => (
        <div key={a.id} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
          <span className="text-caption text-muted-foreground sm:w-[150px] sm:shrink-0 sm:pt-1.5">
            {a.label}
          </span>
          <div className="min-w-0 flex-1">
            <AttributeControl p={p} attr={a} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── The row ─────────────────────────────────────────────────────── */

function LinkLine({ p }: { p: RowProps }) {
  const r = p.item.response;
  if (r.type !== "link") return null;
  const owners = [r.owner, r.also].filter(Boolean) as string[];
  const words = owners
    .map((id) => {
      const it = p.v.ecat.item(id);
      if (!it) return null;
      const s = itemSummary(p.v.x, p.v.results, it, p.v.exam.entries[id]);
      return s?.text ?? `${it.label}: not recorded`;
    })
    .filter(Boolean)
    .join("; ");
  const place = p.v.ecat.placeOf(r.owner);
  const [sys, part] = place
    ? [place.system.id, place.part.id]
    : r.owner === "ex.general.consciousness"
      ? ["general", "consciousness"]
      : ["cardiovascular", "palpation"];
  return (
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 py-1">
      <span className="text-body-s text-foreground">{p.item.label}</span>
      <span className="inline-flex items-center gap-2">
        <span className="text-body-s text-muted-foreground">{words || r.shows}</span>
        <button
          type="button"
          onClick={() => p.onGo(sys!, part, place ? r.owner : undefined)}
          className={cn(
            "text-caption inline-flex min-h-7 items-center gap-0.5 text-indigo-700 hover:underline dark:text-indigo-300 pointer-coarse:min-h-11",
            FOCUS,
          )}
        >
          {`Open in ${place?.system.name ?? "its owner"}`}
          <ArrowUpRightIcon aria-hidden className="size-3" />
        </button>
      </span>
    </div>
  );
}

/** Below 640 px the attribute box opens as a bottom sheet with Done (§5.15). */
const phoneNow = () =>
  typeof window !== "undefined" && window.matchMedia("(max-width: 639.98px)").matches;

export function ItemRow(p: RowProps) {
  const { v, item, editable, onExam } = p;
  const [sheet, setSheet] = useState(false);
  const r = item.response;
  if (r.type === "link") return <LinkLine p={p} />;
  const e = v.exam.entries[item.id];
  const summary = itemSummary(v.x, v.results, item, e);
  const lock = restricted(item.sensitivity);
  const words = A.pairWords(item);
  const keys = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.target !== ev.currentTarget && (ev.target as HTMLElement).tagName === "INPUT") return;
    if (ev.key === "x" && editable) {
      ev.preventDefault();
      p.onNotExamined(item.id);
    }
  };
  const control = (() => {
    if (words)
      return (
        <PairButtons
          label={item.label}
          negative={words.negative}
          positive={words.positive}
          value={e?.state === "not_examined" ? undefined : e?.state}
          disabled={!editable}
          onAnswer={(s) => {
            onExam((d) => A.setState(v.ecat, d, item.id, s));
            if (
              s === "positive" &&
              e?.state !== "positive" &&
              item.attributes?.length &&
              phoneNow()
            )
              setSheet(true);
          }}
        />
      );
    if (r.type === "choice")
      return (
        <span role="group" aria-label={item.label} className="flex flex-wrap justify-end gap-1.5">
          {r.options.map((o) => (
            <Chip
              key={o.id}
              selected={e?.choice === o.id}
              disabled={!editable}
              onPress={() => onExam((d) => A.setChoice(v.ecat, d, item.id, o.id))}
            >
              {o.label}
            </Chip>
          ))}
        </span>
      );
    if (r.type === "classified")
      return (
        <PairButtons
          label={item.label}
          negative="No signs"
          positive="Signs"
          value={e?.state === "not_examined" ? undefined : e?.state}
          disabled={!editable}
          onAnswer={(s) => {
            onExam((d) => A.setState(v.ecat, d, item.id, s));
            if (
              s === "positive" &&
              e?.state !== "positive" &&
              item.attributes?.length &&
              phoneNow()
            )
              setSheet(true);
          }}
        />
      );
    if (r.type === "measured") {
      const muac = v.ecat.attribute(item.id, "muac");
      return muac ? <AttributeControl p={p} attr={muac} /> : null;
    }
    return null;
  })();
  const result =
    r.type === "classified" || r.type === "measured" ? v.results.get(r.classifier) : undefined;
  const severity = "severity" in r && r.severity ? v.results.get(r.severity.classifier) : undefined;
  return (
    <div
      data-item={item.id}
      tabIndex={-1}
      onKeyDown={keys}
      className="flex flex-col gap-2 py-2 outline-none"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col">
          <span className="text-body-s text-foreground max-sm:text-body-m inline-flex items-center gap-1.5 font-medium">
            {item.label}
            {lock ? (
              <span title="Restricted" className="text-muted-foreground inline-flex">
                <LockIcon aria-hidden className="size-3" />
                <span className="sr-only">restricted</span>
              </span>
            ) : null}
          </span>
          <span
            className={cn(
              "text-caption min-h-4",
              summary?.positive ? "text-teal-800" : "text-muted-foreground",
            )}
          >
            {e?.state === "not_examined"
              ? `Not examined: ${v.ecat.data.not_examined.reasons.find((x) => x.id === e.reason?.id)?.label.toLowerCase() ?? ""}${e.reason?.equipment ? ` (${e.reason.equipment.toLowerCase()})` : ""}`
              : (summary?.text ?? "")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {result ? <ResultPill r={result} hideReason /> : null}
          {severity && e?.state === "positive" ? <ResultPill r={severity} hideReason /> : null}
          {control}
        </div>
      </div>
      {result && result.status !== "none" && (result.reason || result.hint || result.note) ? (
        <p className="text-caption text-muted-foreground flex flex-col gap-0.5 sm:ml-4">
          {result.reason ? <span>{result.reason}</span> : null}
          {result.note ? (
            <span className="text-amber-800 dark:text-amber-200">{result.note}</span>
          ) : null}
          {result.hint ? (
            <span className="text-indigo-700 dark:text-indigo-300">{`Hint, not written to the note: ${result.hint}`}</span>
          ) : null}
        </p>
      ) : null}
      {item.hint?.text && e ? (
        <p className="text-caption text-indigo-700 sm:ml-4 dark:text-indigo-300">
          {item.hint.text}
        </p>
      ) : null}
      {r.type === "measured" ||
      (e &&
        e.state !== "not_examined" &&
        (e.state === "positive" ||
          r.type === "choice" ||
          A.visibleAttributes(item, e, p.sex).length > 0)) ? (
        <>
          <div className="max-sm:hidden">
            <AttributeBox {...p} />
          </div>
          {A.visibleAttributes(item, e, p.sex).length ? (
            <div className="sm:hidden">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSheet(true)}
                aria-haspopup="dialog"
              >
                {`Details${Object.keys(e?.attrs ?? {}).length ? ` (${Object.keys(e?.attrs ?? {}).length})` : ""}`}
              </Button>
              <EmrDialog
                open={sheet}
                onOpenChange={setSheet}
                title={item.label}
                description={summary?.text ?? ""}
                sheet="tall"
                footer={<Button onClick={() => setSheet(false)}>Done</Button>}
              >
                <AttributeBox {...p} />
              </EmrDialog>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export type { AttrValue };
