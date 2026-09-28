"use client";

import type { ExamView } from "./model";
import type { Blocks, Consciousness, ExamDraft, MrcGrade } from "@/lib/clerking/exam/payload";
import type { Acvpu } from "@/lib/clerking/exam/scores";
import type { KeyboardEvent, ReactNode } from "react";
import { useId, useState } from "react";
import { CheckIcon, MinusIcon, SparklesIcon } from "lucide-react";

import { PRESS } from "@/components/emr/orders/choice-chips";
import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { fillGrid, setBlocks, setGridCell } from "@/lib/clerking/exam/answers";
import { motorPattern } from "@/lib/clerking/exam/classifiers";
import {
  acvpuOf,
  acvpuSuggestion,
  amts,
  gcsP,
  gcsText,
  gcsTotal,
  mrcNumber,
  orientation,
  orientationState,
} from "@/lib/clerking/exam/scores";
import { cn } from "@/lib/utils";
import { Chip, FieldRow, PANEL, PANEL_HEAD, Segmented, YesNoRow } from "../controls";
import { Pill } from "./result-pill";

/**
 * The examination's blocks (PROMPT-CLERKING-EXAM-V2 §5.2, §5.3, §5.6, §10): consciousness (GCS or
 * ACVPU, with orientation), the AMTS, the motor grids and the pulses grid. State lives in
 * `v.exam.blocks` and changes only through `onExam` with the answers.ts writers. Scores come from
 * scores.ts and the motor hint from classifiers.ts; nothing is computed here. Suggestions are
 * indigo and never applied; caution is amber; red never appears (D-CV-03). Grids are tables with
 * row and column headers, each cell a radio group that arrow keys move. Below 640 px a grid shows
 * one side at a time (§5.15); every phone rule is `max-sm:` or `sm:hidden`.
 */

export interface BlockProps {
  v: ExamView;
  editable: boolean;
  onExam: (fn: (d: ExamDraft) => ExamDraft) => void;
}

type GcsKey = "E" | "V" | "M";
type Side = "R" | "L";
type Plantar = NonNullable<NonNullable<Blocks["plantars"]>["R"]>;
type Pulse = NonNullable<NonNullable<Blocks["pulses"]>[string]["R"]>;

/** The catalogue's scales this file reads (they are loosely typed in the catalogue). */
interface Scales {
  gcs: {
    components: Record<GcsKey, [number, string][]>;
    not_testable: Record<GcsKey, string[]>;
  };
  acvpu: { levels: [Acvpu, string][] };
  amts: { items: { n: number; text: string; uganda_adaptation?: boolean }[] };
  mrc_power: { grades: [number, string][]; optional_modifiers: MrcGrade[] };
  ninds_reflex: { grades: [number, string][]; plantar_options: string[] };
  pulses_grid: { values: string[] };
}
const scalesOf = (v: ExamView) => v.ecat.data.scales as unknown as Scales;

const FOCUS = "outline-none focus-visible:shadow-focus";
// The dark teal ramp is light, so the chosen fill's text turns deep teal there.
const CHOSEN = "border-teal-700 bg-teal-700 font-medium text-white dark:text-teal-50";
const OPEN = "border-border bg-card text-foreground hover:bg-muted";
const SQUARE =
  "size-[30px] font-mono tabular-nums pointer-coarse:size-11 max-sm:size-11 max-sm:text-body-m";
const SECTION = cn("flex flex-col gap-3", PANEL);
const HEAD = cn("text-body-s text-foreground font-medium", PANEL_HEAD);
const MUTED = "text-caption text-muted-foreground";
const SMALL_BUTTON = "min-h-[30px] pointer-coarse:min-h-11 max-sm:min-h-11";
const SIDES = ["R", "L"] as const;
const SIDE_WORD: Record<Side, string> = { R: "Right", L: "Left" };
const GCS_ROWS: readonly { k: GcsKey; label: string }[] = [
  { k: "E", label: "Eye opening" },
  { k: "V", label: "Verbal response" },
  { k: "M", label: "Best motor response" },
];
const minus = (g: string) => g.replace("-", "−");
const slug = (s: string) => s.toLowerCase().replace(/\s+/g, "_");

/* ─── A radio group of scores ─────────────────────────────────────── */

interface Opt {
  id: string;
  text: ReactNode;
  title?: string;
}

/** Score buttons as one radio group (§10): the chosen one is filled teal, arrow keys move the
 *  score (roving tabindex), and the caller decides what tapping the chosen one does (it clears). */
function Radios({
  label,
  options,
  value,
  onPick,
  disabled,
  square,
}: {
  label: string;
  options: readonly Opt[];
  value: string | undefined;
  onPick: (id: string) => void;
  disabled?: boolean;
  /** Number-only buttons (the grids). */
  square?: boolean;
}) {
  const at = options.findIndex((o) => o.id === value);
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const d =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? -1
          : 0;
    if (!d || disabled) return;
    e.preventDefault();
    const next =
      at < 0 ? (d > 0 ? 0 : options.length - 1) : Math.min(options.length - 1, Math.max(0, at + d));
    if (next !== at) onPick(options[next]!.id);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={keys}
      className="flex flex-wrap items-center gap-1"
    >
      {options.map((o, i) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={i === at}
          title={o.title}
          tabIndex={i === at || (at < 0 && i === 0) ? 0 : -1}
          disabled={disabled}
          onClick={() => onPick(o.id)}
          className={cn(
            "text-body-s inline-flex items-center justify-center gap-1.5 rounded-sm border select-none disabled:opacity-50",
            square ? SQUARE : "min-h-[30px] px-2.5 max-sm:min-h-11 pointer-coarse:min-h-11",
            FOCUS,
            PRESS,
            i === at ? CHOSEN : OPEN,
          )}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

/** A number and its word ("4 Spontaneous"). */
const scored = (n: string | number, word: string) => (
  <>
    <span className="font-mono tabular-nums">{n}</span> {word}
  </>
);

/* ─── Consciousness ───────────────────────────────────────────────── */

/** Drop empty parts; a block holding only its method records nothing, so it is removed. GCS 15 is
 *  not a reduced GCS, so "known baseline" goes with it (the note would still write it). */
function tidy(c: Consciousness): Consciousness | undefined {
  const out: Record<string, unknown> = { ...c };
  for (const k of ["nt", "orientation"] as const) {
    const part = Object.entries(c[k] ?? {}).filter(([, x]) => x !== undefined);
    if (part.length) out[k] = Object.fromEntries(part);
    else delete out[k];
  }
  for (const [k, x] of Object.entries(out)) if (x === undefined) delete out[k];
  if (gcsTotal(out as Consciousness) === 15) delete out.baseline;
  return Object.keys(out).length > 1 ? (out as Consciousness) : undefined;
}

function consciousnessLine(c: Consciousness | undefined, levels: Scales["acvpu"]["levels"]) {
  if (!c) return "Not recorded";
  const word = levels.find(([l]) => l === c.acvpu)?.[1];
  const base =
    c.method === "acvpu"
      ? word
        ? `ACVPU: ${word}`
        : "ACVPU not chosen"
      : (gcsText(c) ?? "GCS not scored");
  const o = orientation(c);
  const orient =
    orientationState(c).kind === "not_assessable"
      ? "orientation not assessable"
      : o.full === true
        ? "oriented to time, place and person"
        : o.full === false
          ? `not oriented to ${o.not.join(", ")}`
          : null;
  return [base + (c.baseline ? " (known baseline)" : ""), orient].filter(Boolean).join(" · ");
}

export function ConsciousnessBlock({
  v,
  editable,
  onExam,
  readOnly,
  onOpenOwner,
}: BlockProps & { readOnly?: boolean; onOpenOwner?: () => void }) {
  const c = v.exam.blocks.consciousness;
  // The method before anything is recorded (a method alone is not stored).
  const [chosen, setChosen] = useState<Consciousness["method"]>("gcs");
  const [ntOpen, setNtOpen] = useState<Partial<Record<GcsKey, boolean>>>({});
  const s = scalesOf(v);

  if (readOnly)
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-s text-foreground">
          <span className="text-muted-foreground">Consciousness: </span>
          {consciousnessLine(c, s.acvpu.levels)}
        </p>
        {onOpenOwner ? (
          <Button variant="secondary" size="sm" className={SMALL_BUTTON} onClick={onOpenOwner}>
            Open in General
          </Button>
        ) : null}
      </div>
    );

  const method = c?.method ?? chosen;
  const off = !editable;
  const put = (fn: (x: Consciousness) => Consciousness) =>
    onExam((d) => setBlocks(d, { consciousness: tidy(fn(d.blocks.consciousness ?? { method })) }));
  const total = gcsTotal(c);
  const anyGcs = method === "gcs" && gcsText(c) !== null;
  const suggestion = method === "gcs" ? acvpuSuggestion(c) : null;
  const gp = gcsP(v.exam);
  const o = orientationState(c);
  const word = (l: Acvpu) => s.acvpu.levels.find(([x]) => x === l)?.[1] ?? l;

  return (
    <section aria-label="Consciousness" className={SECTION}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className={HEAD}>Consciousness</h4>
        <span className="inline-flex flex-wrap items-center gap-2">
          {method === "gcs" && !anyGcs ? (
            // One tap for the commonest answer; still an explicit record, never inferred (E2).
            <Button
              variant="secondary"
              size="sm"
              disabled={off}
              onClick={() => put(() => ({ method: "gcs", E: 4, V: 5, M: 6 }))}
            >
              GCS 15/15
            </Button>
          ) : null}
          <Segmented
            label="Method"
            options={[
              { id: "gcs", label: "GCS" },
              { id: "acvpu", label: "ACVPU" },
            ]}
            value={method}
            disabled={off}
            onPick={(m) => {
              setChosen(m);
              if (c && c.method !== m) put((x) => ({ ...x, method: m }));
            }}
          />
        </span>
      </div>

      {method === "gcs" ? (
        <>
          {GCS_ROWS.map(({ k, label }) => {
            const nt = c?.nt?.[k];
            const open = !!nt || !!ntOpen[k];
            return (
              <FieldRow key={k} label={label}>
                <Radios
                  label={`${label} score`}
                  disabled={off}
                  value={nt ? undefined : c?.[k]?.toString()}
                  options={s.gcs.components[k].map(([n, w]) => ({
                    id: String(n),
                    text: scored(n, w),
                  }))}
                  onPick={(id) => {
                    setNtOpen((x) => ({ ...x, [k]: false }));
                    put((x) => ({
                      ...x,
                      [k]: x[k] === Number(id) ? undefined : Number(id),
                      nt: { ...x.nt, [k]: undefined },
                    }));
                  }}
                />
                <Chip
                  selected={open}
                  disabled={off}
                  onPress={() => {
                    setNtOpen((x) => ({ ...x, [k]: !open }));
                    if (nt) put((x) => ({ ...x, nt: { ...x.nt, [k]: undefined } }));
                  }}
                >
                  <span className="font-mono">NT</span> Not testable
                </Chip>
                {open ? (
                  <Segmented
                    label={`${label}: why not testable`}
                    options={s.gcs.not_testable[k].map((r) => ({ id: r, label: r }))}
                    value={nt}
                    disabled={off}
                    onPick={(r) =>
                      put((x) => ({
                        ...x,
                        [k]: undefined,
                        nt: { ...x.nt, [k]: x.nt?.[k] === r ? undefined : r },
                      }))
                    }
                  />
                ) : null}
              </FieldRow>
            );
          })}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <output
              aria-live="polite"
              className="text-body-s text-foreground font-mono font-medium tabular-nums"
            >
              {gcsText(c) ?? "GCS not scored"}
            </output>
            {total !== null && total < 15 ? (
              <Chip
                selected={!!c?.baseline}
                disabled={off}
                onPress={() => put((x) => ({ ...x, baseline: x.baseline ? undefined : true }))}
              >
                Known baseline
              </Chip>
            ) : null}
          </div>
          {gp?.show ? (
            <p className="text-body-s text-foreground font-mono tabular-nums">
              GCS-P {gp.value} <span className={MUTED}>(GCS minus the pupil score)</span>
            </p>
          ) : null}
          {total === 15 ? (
            <p className="text-body-s text-foreground">ACVPU: Alert (from GCS 15)</p>
          ) : null}
        </>
      ) : null}

      {method === "acvpu" || (anyGcs && total !== 15) ? (
        <FieldRow label="ACVPU">
          <Radios
            label="ACVPU for NEWS2"
            disabled={off}
            value={c?.acvpu}
            options={s.acvpu.levels.map(([l, w]) => ({ id: l, text: scored(l, w) }))}
            onPick={(l) => put((x) => ({ ...x, acvpu: x.acvpu === l ? undefined : (l as Acvpu) }))}
          />
        </FieldRow>
      ) : null}
      {suggestion ? (
        <p className="text-caption inline-flex items-center gap-1 text-indigo-700 dark:text-indigo-300">
          <SparklesIcon aria-hidden className="size-3 shrink-0" />
          Suggested: {suggestion} ({word(suggestion).toLowerCase()}) — you choose
        </p>
      ) : null}
      {anyGcs && acvpuOf(c) === null ? (
        <StatusWord tone="caution" className="self-start">
          NEWS2 incomplete: choose ACVPU
        </StatusWord>
      ) : null}

      {o.kind === "ask" ? (
        <FieldRow label="Orientation">
          {(["time", "place", "person"] as const).map((k) => (
            <div key={k} className="max-sm:w-full sm:min-w-[150px]">
              <YesNoRow
                label={k[0]!.toUpperCase() + k.slice(1)}
                value={c?.orientation?.[k]}
                disabled={off}
                onAnswer={(a) =>
                  put((x) => ({
                    ...x,
                    orientation: {
                      ...x.orientation,
                      [k]: x.orientation?.[k] === a ? undefined : a,
                    },
                  }))
                }
              />
            </div>
          ))}
        </FieldRow>
      ) : o.kind === "derived" || o.kind === "not_assessable" ? (
        <FieldRow label="Orientation" group={false}>
          <span className="text-body-s text-foreground sm:pt-1.5">
            {o.kind === "derived"
              ? "Oriented to time, place and person"
              : "Orientation not assessable"}
          </span>
        </FieldRow>
      ) : null}
    </section>
  );
}

/* ─── AMTS ────────────────────────────────────────────────────────── */

export function AmtsBlock({ v, editable, onExam }: BlockProps) {
  const items = scalesOf(v).amts.items;
  const given = v.exam.blocks.amts ?? {};
  const score = amts(v.exam);
  const cut = v.ecat.refNumber("REF-EX-AMTS-IMPAIRED") ?? 6; // as compose.ts reads it
  const low = !!score?.complete && score.score <= cut;
  const answer = (n: number, a: "correct" | "incorrect") =>
    onExam((d) => {
      const next = { ...d.blocks.amts };
      if (next[n] === a) delete next[n];
      else next[n] = a;
      return setBlocks(d, { amts: Object.keys(next).length ? next : undefined });
    });

  return (
    <section aria-label="Abbreviated Mental Test Score" className={SECTION}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className={HEAD}>
          AMTS <span className="text-muted-foreground font-normal">Abbreviated Mental Test</span>
        </h4>
        <span aria-live="polite" className="inline-flex flex-wrap items-center gap-2">
          {score?.complete ? (
            <>
              <Pill tone={low ? "caution" : "ok"} className="font-mono tabular-nums">
                AMTS {score.score}/10
              </Pill>
              {low ? (
                <span className={MUTED}>{cut} or less suggests delirium or dementia</span>
              ) : null}
            </>
          ) : (
            <span className={MUTED}>{score ? score.answered : 0} of 10 answered</span>
          )}
        </span>
      </div>
      <ol className="flex flex-col">
        {items.map((it) => (
          <li
            key={it.n}
            className="border-border flex min-h-[34px] items-center justify-between gap-3 border-t py-1 first:border-t-0 max-sm:min-h-12"
          >
            <span className="text-body-s text-foreground max-sm:text-body-m flex min-w-0 flex-col">
              <span>
                <span className="text-muted-foreground font-mono tabular-nums">{it.n}.</span>{" "}
                {it.text}
              </span>
              {it.uganda_adaptation ? <span className={MUTED}>Uganda wording</span> : null}
            </span>
            <span
              role="group"
              aria-label={`${it.n}. ${it.text}`}
              className="bg-muted inline-flex shrink-0 rounded-md p-0.5"
            >
              {(["correct", "incorrect"] as const).map((a) => {
                const on = given[it.n] === a;
                return (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={on}
                    disabled={!editable}
                    onClick={() => answer(it.n, a)}
                    className={cn(
                      "text-caption inline-flex min-h-[30px] items-center gap-1 rounded-sm px-2.5 disabled:opacity-50 max-sm:min-h-11 pointer-coarse:min-h-11",
                      FOCUS,
                      on
                        ? cn(
                            "bg-card shadow-xs",
                            a === "correct" ? "text-teal-800" : "text-foreground",
                          )
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {on ? (
                      a === "correct" ? (
                        <CheckIcon aria-hidden className="size-3" />
                      ) : (
                        <MinusIcon aria-hidden className="size-3" />
                      )
                    ) : null}
                    {a === "correct" ? "Correct" : "Incorrect"}
                  </button>
                );
              })}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ─── Grids ───────────────────────────────────────────────────────── */

/** Right or Left on a phone (a grid shows one side below 640 px). */
function SideSwitch({ side, onSide }: { side: Side; onSide: (s: Side) => void }) {
  return (
    <div className="sm:hidden">
      <Segmented
        label="Side shown"
        options={SIDES.map((s) => ({ id: s, label: SIDE_WORD[s] }))}
        value={side}
        onPick={onSide}
      />
    </div>
  );
}

/** A grid as a table: row headers (the row and its root) and column headers (Right, Left). On a
 *  phone, the side not shown is hidden and the row's name sits above its buttons. `side` null
 *  shows both sides everywhere. */
function GridTable({
  title,
  action,
  rowHead,
  rows,
  side,
  cell,
}: {
  title: string;
  action: ReactNode;
  rowHead: string;
  rows: readonly { key: string; root?: string }[];
  side: Side | null;
  cell: (row: string, side: Side) => ReactNode;
}) {
  const id = useId();
  const hide = (s: Side) => side !== null && s !== side && "max-sm:hidden";
  const name = (r: { key: string; root?: string }) => (
    <>
      {r.key}
      {r.root ? (
        <span className="text-caption text-muted-foreground ml-1.5 font-mono">{r.root}</span>
      ) : null}
    </>
  );
  const colHead = "text-caption text-muted-foreground py-1 pr-3 text-left font-medium";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={id} className={HEAD}>
          {title}
        </h4>
        {action}
      </div>
      <table aria-labelledby={id} className="w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={cn(colHead, side !== null && "max-sm:sr-only")}>
              {rowHead}
            </th>
            {SIDES.map((s) => (
              <th key={s} scope="col" className={cn(colHead, hide(s))}>
                {SIDE_WORD[s]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-border border-t">
              <th
                scope="row"
                className={cn(
                  "text-body-s text-foreground py-1.5 pr-3 text-left align-middle font-normal",
                  side !== null && "max-sm:sr-only",
                )}
              >
                {name(r)}
              </th>
              {SIDES.map((s) => (
                <td key={s} className={cn("py-1.5 pr-3 align-middle max-sm:pr-0", hide(s))}>
                  {side !== null ? (
                    <span
                      aria-hidden
                      className="text-body-m text-foreground mb-1.5 block sm:hidden"
                    >
                      {name(r)}
                    </span>
                  ) : null}
                  {cell(r.key, s)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const MRC = ["0", "1", "2", "3", "4", "5"] as const;
const NINDS = ["0", "1", "2", "3", "4"] as const;
const gradeTitle = (grades: [number, string][], g: string) => {
  const w = grades.find(([n]) => String(n) === g)?.[1];
  return w ? `${g}: ${w}` : undefined;
};

/** One power cell: MRC 0–5, with 4− and 4+ beside 4 once 4 is chosen (D-EX-09). */
function PowerCell({
  row,
  side,
  value,
  scales,
  disabled,
  onExam,
}: {
  row: string;
  side: Side;
  value: MrcGrade | undefined;
  scales: Scales;
  disabled: boolean;
  onExam: BlockProps["onExam"];
}) {
  const n = mrcNumber(value);
  const checked = n === null ? undefined : String(n);
  const set = (g: MrcGrade) => onExam((d) => setGridCell(d, "power", row, side, g));
  const name = `${row}, ${SIDE_WORD[side].toLowerCase()}`;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Radios
        square
        label={name}
        disabled={disabled}
        value={checked}
        options={MRC.map((g) => ({
          id: g,
          text: g === "4" && checked === "4" ? minus(value!) : g,
          title: gradeTitle(scales.mrc_power.grades, g),
        }))}
        onPick={(g) => set(g === checked ? value! : (g as MrcGrade))}
      />
      {checked === "4"
        ? scales.mrc_power.optional_modifiers.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={value === m}
              aria-label={`${name}: 4 ${m === "4-" ? "minus" : "plus"}`}
              disabled={disabled}
              onClick={() => set(value === m ? "4" : m)}
              className={cn(
                "text-caption inline-flex items-center justify-center rounded-sm border disabled:opacity-50",
                SQUARE,
                FOCUS,
                PRESS,
                value === m ? CHOSEN : cn(OPEN, "border-dashed"),
              )}
            >
              {minus(m)}
            </button>
          ))
        : null}
    </div>
  );
}

export function MotorGrids({ v, editable, onExam }: BlockProps) {
  const [side, setSide] = useState<Side>("R");
  const s = scalesOf(v);
  const b = v.exam.blocks;
  const off = !editable;
  const hint = motorPattern(v.x);
  const power = v.ecat.grids.power.map((r) => ({ key: r.movement, root: r.root }));
  const reflexes = v.ecat.grids.reflexes.map((r) => ({ key: r.reflex, root: r.root }));
  const plantars = s.ninds_reflex.plantar_options.map((w) => ({ id: slug(w), text: w }));
  const setPlantar = (sd: Side, id: string) =>
    onExam((d) => {
      const cur = { ...d.blocks.plantars };
      if (cur[sd] === id) delete cur[sd];
      else cur[sd] = id as Plantar;
      return setBlocks(d, { plantars: cur.R || cur.L ? cur : undefined });
    });
  const all = (label: string, fill: (d: ExamDraft) => ExamDraft) => (
    <Button
      variant="secondary"
      size="sm"
      className={SMALL_BUTTON}
      disabled={off}
      onClick={() => onExam(fill)}
    >
      {label}
    </Button>
  );

  return (
    <section aria-label="Power, reflexes and plantars" className={SECTION}>
      <SideSwitch side={side} onSide={setSide} />
      <div aria-live="polite">
        {hint ? (
          <p className={MUTED}>
            <span className="font-medium">Hint (not written to the note):</span> {hint}
          </p>
        ) : null}
      </div>
      <GridTable
        title="Power (MRC 0 to 5)"
        rowHead="Movement"
        rows={power}
        side={side}
        action={all("All 5", (d) =>
          fillGrid(
            d,
            "power",
            power.map((r) => r.key),
            "5",
          ),
        )}
        cell={(row, sd) => (
          <PowerCell
            row={row}
            side={sd}
            value={b.power?.[row]?.[sd]}
            scales={s}
            disabled={off}
            onExam={onExam}
          />
        )}
      />
      <GridTable
        title="Reflexes (NINDS 0 to 4)"
        rowHead="Reflex"
        rows={reflexes}
        side={side}
        action={all("All 2", (d) =>
          fillGrid(
            d,
            "reflexes",
            reflexes.map((r) => r.key),
            2,
          ),
        )}
        cell={(row, sd) => {
          const val = b.reflexes?.[row]?.[sd];
          return (
            <Radios
              square
              label={`${row}, ${SIDE_WORD[sd].toLowerCase()}`}
              disabled={off}
              value={val === undefined ? undefined : String(val)}
              options={NINDS.map((g) => ({
                id: g,
                text: g,
                title: gradeTitle(s.ninds_reflex.grades, g),
              }))}
              onPick={(g) => onExam((d) => setGridCell(d, "reflexes", row, sd, Number(g)))}
            />
          );
        }}
      />
      <div className="flex flex-col gap-2">
        <h4 className={HEAD}>Plantars</h4>
        {SIDES.map((sd) => (
          <FieldRow key={sd} label={SIDE_WORD[sd]} group={false}>
            <Radios
              label={`${SIDE_WORD[sd]} plantar`}
              disabled={off}
              value={b.plantars?.[sd]}
              options={plantars}
              onPick={(id) => setPlantar(sd, id)}
            />
          </FieldRow>
        ))}
      </div>
    </section>
  );
}

export function PulsesGrid({
  v,
  editable,
  onExam,
  rows,
  readOnly,
  onOpenOwner,
}: BlockProps & { rows?: readonly string[]; readOnly?: boolean; onOpenOwner?: () => void }) {
  const [side, setSide] = useState<Side>("R");
  const list = rows ?? v.ecat.grids.pulses;
  const values = scalesOf(v).pulses_grid.values.map((w) => ({ id: w.toLowerCase(), text: w }));
  const cells = v.exam.blocks.pulses ?? {};
  const action = readOnly ? (
    onOpenOwner ? (
      <Button variant="secondary" size="sm" className={SMALL_BUTTON} onClick={onOpenOwner}>
        Open in Cardiovascular
      </Button>
    ) : null
  ) : (
    <Button
      variant="secondary"
      size="sm"
      className={SMALL_BUTTON}
      disabled={!editable}
      onClick={() => onExam((d) => fillGrid(d, "pulses", list, "present"))}
    >
      All present
    </Button>
  );

  return (
    <section aria-label="Peripheral pulses" className={SECTION}>
      {readOnly ? null : <SideSwitch side={side} onSide={setSide} />}
      <GridTable
        title="Pulses"
        rowHead="Artery"
        rows={list.map((key) => ({ key }))}
        side={readOnly ? null : side}
        action={action}
        cell={(row, sd) =>
          readOnly ? (
            <span className="text-body-s text-foreground">
              {values.find((x) => x.id === cells[row]?.[sd])?.text ?? (
                <span className="text-muted-foreground">Not recorded</span>
              )}
            </span>
          ) : (
            <Radios
              label={`${row}, ${SIDE_WORD[sd].toLowerCase()}`}
              disabled={!editable}
              value={cells[row]?.[sd]}
              options={values}
              onPick={(id) => onExam((d) => setGridCell(d, "pulses", row, sd, id as Pulse))}
            />
          )
        }
      />
    </section>
  );
}
