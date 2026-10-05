"use client";

import type { SiView } from "../si-model";
import type { DxData } from "../use-catalogue";
import type { ImpressionView } from "./model";
import type { History } from "@/lib/clerking/answers";
import type { BoardRow, DxMeta, ImpressionDraft } from "@/lib/clerking/impression/board";
import type { OnsetId } from "@/lib/clerking/impression/catalogue";
import type { CellState, Column } from "@/lib/clerking/impression/evidence";
import type { Finding } from "@/lib/clerking/impression/facts";
import type { SectionId } from "@/lib/clerking/status";
import type { ReactNode } from "react";
import { useId } from "react";
import { ChevronLeftIcon, ClockIcon, ShieldAlertIcon } from "lucide-react";

import { PRESS } from "@/components/emr/orders/choice-chips";
import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { REASON_MIN_WORDS, words } from "@/lib/clerking/impression/board";
import { cellState } from "@/lib/clerking/impression/evidence";
import { cn } from "@/lib/utils";
import { FindingText, NotAsked } from "../summary/summary-step";

/**
 * A diagnosis's Details (§4 "Details drawer", D-SI-16): evidence (accepted and suggested), what is
 * not asked yet, onset, the clinician's grading, tests that would help decide, the reason a
 * must-not-miss is unlikely, and the clinician's reasoning. On a desktop it replaces the note
 * column in place; on a tablet or phone it is the centred dialog (ADR 0161). Nothing here grades,
 * ranks or scores (SI2).
 */

const ONSET_WORD: Record<OnsetId, string> = {
  acute: "Acute",
  subacute: "Subacute",
  chronic: "Chronic",
  acute_on_chronic: "Acute on chronic",
  recurrent: "Recurrent",
};

export function roleOf(row: BoardRow): string {
  if (row.slot === "leading") return "Leading · primary";
  if (row.slot === "also") return "Also this visit";
  return row.mustNotMiss ? "Differential · must not miss" : "Differential";
}

export function subLine(row: BoardRow, dx: DxData | null): string {
  if (row.dx.code) return `ICD-11 ${row.dx.code}`;
  if (row.dx.typed) return "As typed · not coded";
  const n = row.dx.dxId ? dx?.names[row.dx.dxId] : undefined;
  return n && !n.coded ? "As typed · not coded" : "Not coded";
}

function Group({
  id,
  title,
  level,
  children,
}: {
  id: string;
  title: string;
  /** Under the name's h3 in place; under the dialog's own title in the dialog. */
  level: "h3" | "h4";
  children: ReactNode;
}) {
  const H = level;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <H id={id} className="text-caption text-muted-foreground tracking-[0.06em] uppercase">
        {title}
      </H>
      {children}
    </section>
  );
}

function Radios<V extends string>({
  label,
  options,
  value,
  onPick,
  disabled,
}: {
  label: string;
  options: readonly { id: V; label: string }[];
  value: V | undefined;
  onPick: (v: V | undefined) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="bg-muted inline-flex flex-wrap gap-0.5 rounded-md p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          disabled={disabled}
          onClick={() => onPick(value === o.id ? undefined : o.id)}
          className={cn(
            "text-caption focus-visible:shadow-focus min-h-7 rounded-sm px-2.5 outline-none pointer-coarse:min-h-11",
            value === o.id
              ? "bg-card text-teal-800 shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface DetailsProps {
  si: SiView;
  v: ImpressionView;
  row: BoardRow;
  dx: DxData | null;
  editable: boolean;
  /** Below 834 px there is no matrix: evidence is three lists here (D-SI-14). */
  lists: boolean;
  inPlan: ReadonlySet<string>;
  /** Tests the hospital can order (the menu); others are "not on this hospital's test menu". */
  orderable: (testId: string) => boolean;
  onImpression: (fn: (d: ImpressionDraft) => ImpressionDraft) => void;
  onHistory: (fn: (h: History) => History) => void;
  onGo: (step: SectionId, item?: string) => void;
  onCycle: (col: Column, f: Finding) => void;
  onAccept: (col: Column) => void;
  onMatrix?: () => void;
  onAddToPlan?: (testId: string, row: BoardRow) => void;
  onMakeLeading?: (row: BoardRow) => void;
  onDone: () => void;
  /** In the note column: a Back control above the header. */
  inPlace?: boolean;
}

export function DetailsBody(props: DetailsProps) {
  const { si, v, row, dx, editable, onImpression } = props;
  const id = row.dx.logicalId;
  const p = row.profile;
  const meta: DxMeta = si.impression.meta[id] ?? {};
  const setMeta = (patch: Partial<DxMeta>) =>
    onImpression((d) => {
      const next = { ...(d.meta[id] ?? {}), ...patch };
      for (const k of Object.keys(next) as (keyof DxMeta)[])
        if (next[k] === undefined) delete next[k];
      return { ...d, meta: { ...d.meta, [id]: next } };
    });
  const col = v.col(id);
  const marks = (want: CellState[]) =>
    v.matrixAll.rows.filter((f) => col && want.includes(cellState(col, f.ref)));
  const onsets = p?.onset.allowed ?? (["acute", "chronic", "acute_on_chronic"] as OnsetId[]);
  const unlikelyMnm = row.mustNotMiss && row.likelihood === "unlikely";
  const asks = v.asksFor(id);
  const level = props.inPlace ? "h4" : "h3";

  const chipList = (list: Finding[], state: "for" | "against" | "suggested") =>
    list.length ? (
      <ul className="flex flex-wrap gap-1.5">
        {list.map((f) => (
          <li key={f.ref}>
            <button
              type="button"
              disabled={!editable || !col}
              onClick={() => col && props.onCycle(col, f)}
              aria-label={`${f.text}: ${state === "suggested" ? "suggested" : state}. Select to change.`}
              className={cn(
                "text-caption focus-visible:shadow-focus inline-flex min-h-7 items-center gap-1 rounded-sm px-2 outline-none pointer-coarse:min-h-11",
                PRESS,
                state === "suggested"
                  ? "border-ink-400 border border-dashed"
                  : state === "for"
                    ? "bg-ink-100 dark:bg-ink-700"
                    : "bg-card ring-ink-300 ring-1 ring-inset",
              )}
            >
              <span className="font-mono">
                {state === "against"
                  ? "−"
                  : state === "for"
                    ? "+"
                    : col?.suggested.get(f.ref) === "against"
                      ? "−"
                      : "+"}
              </span>
              <FindingText item={f} news2={si.x.news2Latest} />
            </button>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-body-s text-muted-foreground">None.</p>
    );

  return (
    <div className="flex flex-col gap-5">
      {props.inPlace ? (
        <Button variant="ghost" size="sm" className="self-start" onClick={props.onDone}>
          <ChevronLeftIcon aria-hidden />
          Back to the note
        </Button>
      ) : null}
      <header className="flex flex-col gap-1">
        <span className="text-caption text-muted-foreground tracking-[0.06em] uppercase">
          {roleOf(row)}
        </span>
        {/* In the dialog its title already names it. */}
        {props.inPlace ? (
          <h3 className="text-heading-s text-foreground">{row.dx.display}</h3>
        ) : null}
        <span className="text-caption text-muted-foreground">{subLine(row, dx)}</span>
        <span className="flex flex-wrap gap-1.5 pt-1">
          {row.mustNotMiss ? (
            <StatusWord tone="caution">
              {row.likelihood === "unlikely" ? "Must not miss · marked unlikely" : "Must not miss"}
            </StatusWord>
          ) : null}
          {row.timeCritical ? (
            <span className="text-caption inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
              <ClockIcon aria-hidden className="size-3" />
              Time-critical
            </span>
          ) : null}
        </span>
      </header>

      {row.awaitingSignoff ? (
        <p className="text-body-s text-muted-foreground">Reasoning aids awaiting sign-off</p>
      ) : null}

      <Group level={level} id={`dx-ev-${id}`} title="Evidence">
        {props.lists ? (
          <>
            <span className="text-caption text-muted-foreground">Suggested</span>
            {chipList(marks(["suggested_for", "suggested_against"]), "suggested")}
            {col && [...col.suggested.keys()].some((r) => !col.accepted[r]) && editable ? (
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                onClick={() => props.onAccept(col)}
              >
                Accept suggested
              </Button>
            ) : null}
          </>
        ) : null}
        <span className="text-caption text-muted-foreground">For</span>
        {chipList(marks(["for"]), "for")}
        <span className="text-caption text-muted-foreground">Against</span>
        {chipList(marks(["against"]), "against")}
        {!props.lists && props.onMatrix ? (
          <Button size="sm" variant="ghost" className="self-start" onClick={props.onMatrix}>
            Change in the matrix
          </Button>
        ) : null}
      </Group>

      {asks.length ? (
        <NotAsked
          rows={asks}
          editable={editable}
          onHistory={props.onHistory}
          onGo={props.onGo}
          title="Not asked yet"
        />
      ) : null}

      <Group level={level} id={`dx-onset-${id}`} title="Onset">
        <Radios
          label="Onset"
          disabled={!editable}
          options={onsets.map((o) => ({ id: o, label: ONSET_WORD[o] }))}
          value={meta.onset}
          onPick={(o) => setMeta({ onset: o })}
        />
      </Group>

      {p && p.severity.kind !== "none" ? (
        <Group level={level} id={`dx-sev-${id}`} title="Severity">
          <Severity
            row={row}
            si={si}
            dx={dx}
            editable={editable}
            value={meta.severity}
            onPick={(s) => setMeta({ severity: s })}
          />
          <p className="text-caption text-muted-foreground">
            Your grading. MedSync does not grade automatically without a signed rule.
          </p>
        </Group>
      ) : null}

      {p?.tests_to_decide.length ? (
        <Group level={level} id={`dx-tests-${id}`} title="Tests that would help decide">
          <ul className="flex flex-col gap-1">
            {p.tests_to_decide.map((t) => {
              const name = dx?.tests[t];
              const planned = props.inPlan.has(t);
              return (
                <li key={t} className="flex min-h-8 items-center justify-between gap-3">
                  <span className="text-body-s text-foreground">
                    {name ?? t.replace(/^test\./, "").replace(/_/g, " ")}
                  </span>
                  {planned ? (
                    <span className="text-caption font-medium text-teal-700 dark:text-teal-300">
                      In plan
                    </span>
                  ) : !name || !props.orderable(t) ? (
                    <span className="text-caption text-muted-foreground">
                      Not on this hospital’s test menu
                    </span>
                  ) : editable && props.onAddToPlan ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => props.onAddToPlan!(t, row)}
                    >
                      Add to plan
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Group>
      ) : null}

      {unlikelyMnm ? (
        <ReasonField row={row} editable={editable} onImpression={onImpression} />
      ) : null}

      <Group level={level} id={`dx-reason-${id}`} title="Your reasoning">
        <textarea
          aria-label={`Your reasoning, ${row.dx.display}`}
          value={meta.reasoning ?? ""}
          disabled={!editable}
          rows={3}
          maxLength={10_000}
          onChange={(e) => setMeta({ reasoning: e.target.value || undefined })}
          className="border-input bg-card text-body-s text-foreground focus-visible:shadow-focus w-full rounded-sm border px-3 py-2 leading-relaxed outline-none"
        />
      </Group>

      <footer className="border-border flex flex-wrap items-center gap-2 border-t pt-4">
        {row.slot === "differential" && editable && props.onMakeLeading ? (
          <Button variant="secondary" onClick={() => props.onMakeLeading!(row)}>
            Make leading
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button onClick={props.onDone}>Done</Button>
      </footer>
    </div>
  );
}

function Severity({
  row,
  si,
  dx,
  editable,
  value,
  onPick,
}: {
  row: BoardRow;
  si: SiView;
  dx: DxData | null;
  editable: boolean;
  value: string | undefined;
  onPick: (s: string | undefined) => void;
}) {
  const s = row.profile!.severity;
  if (s.kind === "clinician")
    return (
      <Radios
        label="Severity"
        disabled={!editable}
        options={s.options.map((o) => ({ id: o, label: o }))}
        value={value}
        onPick={onPick}
      />
    );
  if (s.kind === "named_scale") {
    const scale = dx?.cat.scale(s.id);
    if (!scale || !si.live.scale(s.id))
      return <p className="text-body-s text-muted-foreground">Awaiting sign-off</p>;
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-caption text-muted-foreground">{scale.label}</span>
        <Radios
          label={scale.label}
          disabled={!editable}
          options={scale.options.map((o) => ({ id: o, label: o }))}
          value={value}
          onPick={onPick}
        />
      </div>
    );
  }
  if (s.kind === "classifier") {
    const r = si.x.results?.get(s.id) as { status?: string; text?: string } | undefined;
    if (r?.status !== "result" || !r.text)
      return (
        <p className="text-body-s text-muted-foreground">Not graded by the examination yet.</p>
      );
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-body-s text-foreground">{r.text}</span>
        {value === r.text ? (
          <span className="text-caption font-medium text-teal-700 dark:text-teal-300">
            Your grade
          </span>
        ) : editable ? (
          <Button size="sm" variant="secondary" onClick={() => onPick(r.text)}>
            Use as the grade
          </Button>
        ) : null}
      </div>
    );
  }
  return null;
}

/** "Why is it unlikely?" (SI5, D-DX-06): amber until it holds at least three words. */
export function ReasonField({
  row,
  editable,
  onImpression,
}: {
  row: BoardRow;
  editable: boolean;
  onImpression: (fn: (d: ImpressionDraft) => ImpressionDraft) => void;
}) {
  // The list and Details can both show it at once: one id each.
  const id = useId();
  const short = words(row.reason) < REASON_MIN_WORDS;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-body-s text-foreground inline-flex items-center gap-1.5">
        <ShieldAlertIcon
          aria-hidden
          className="dark:text-status-caution-fg size-3.5 text-amber-700"
        />
        Why is it unlikely? A must-not-miss needs a reason. It goes in the note.
      </label>
      <textarea
        id={id}
        value={row.reason}
        disabled={!editable}
        rows={2}
        maxLength={2_000}
        aria-invalid={short || undefined}
        onChange={(e) =>
          onImpression((d) => ({
            ...d,
            reasons: { ...d.reasons, [row.dx.logicalId]: e.target.value },
          }))
        }
        className={cn(
          "bg-card text-body-s text-foreground focus-visible:shadow-focus w-full rounded-sm border px-3 py-2 leading-relaxed outline-none",
          short ? "bg-status-caution-bg/40 border-amber-600" : "border-input",
        )}
      />
      {short ? (
        <span className="text-caption dark:text-status-caution-fg text-amber-800">
          At least three words.
        </span>
      ) : null}
    </div>
  );
}
