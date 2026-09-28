"use client";

import type { SiView } from "../si-model";
import type { History, YesNo } from "@/lib/clerking/answers";
import type { AskRow } from "@/lib/clerking/impression/ask";
import type { StepTag } from "@/lib/clerking/impression/facts";
import type { SectionId } from "@/lib/clerking/status";
import type { Column, Sentence, SummaryItem } from "@/lib/clerking/summary/compose";
import type { SummaryDraft } from "@/lib/clerking/summary/review";
import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ClockIcon,
  LockIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { EmrDialog } from "@/components/emr/emr-dialog";
import { PRESS } from "@/components/emr/orders/choice-chips";
import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { answerAsk } from "@/lib/clerking/impression/ask";
import { hashString, markReviewed } from "@/lib/clerking/summary/review";
import { cn } from "@/lib/utils";
import { YesNoRow } from "../controls";

/**
 * Step 08, Summary (PROMPT-CLERKING-SUMMARY-IMPRESSION §4, §5.1–5.2): the one-liner, the paragraph
 * composed from the record by fixed rules with its step tags and inspector, "In my words", what
 * goes in, "Not asked yet", what is not recorded, and an explicit review that any change
 * invalidates (SI1, SI8). Hook-light and pure over `SiView`; every write goes to its owner (SI4).
 */

export const TAG_STEP: Record<StepTag, SectionId> = {
  "01": "complaint",
  "03": "systems",
  "04": "pmh",
  "05": "fh",
  "06": "social",
  "07": "exam",
};
const STEP_NAME: Record<StepTag, string> = {
  "01": "Complaint",
  "03": "Systems",
  "04": "Past history",
  "05": "Family",
  "06": "Social",
  "07": "Examination",
};

/** The only red on this step: a vital reading that scores 3 in NEWS2 (Law 8, as on the rail). */
const SCORE3_TEXT = "text-red-700 dark:text-status-critical-fg";
const AMBER_TEXT = "text-amber-800 dark:text-status-caution-fg";

const NEWS2_PARAM: Record<string, string> = {
  "vs:vs.temp": "temperature",
  "vs:vs.pulse": "pulse",
  "vs:vs.bp": "systolic_bp",
  "vs:vs.rr": "respiratory_rate",
  "vs:vs.spo2": "spo2",
};

/* ─── The status pill (header) ──────────────────────────────────── */

export function SummaryStatusPill({ si, time }: { si: SiView; time: (iso: string) => string }) {
  if (si.review === "changed") return <StatusWord tone="caution">Changed since review</StatusWord>;
  const Icon = si.review === "reviewed" ? CheckIcon : ClockIcon;
  return (
    <span
      aria-live="polite"
      className="text-caption inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 font-medium text-gray-700"
      title={
        si.review === "reviewed" && si.summaryDraft.review
          ? `Reviewed at ${time(si.summaryDraft.review.at)}`
          : undefined
      }
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      {si.review === "reviewed" ? "Reviewed by you" : "Composed, not reviewed"}
    </span>
  );
}

/* ─── Small parts ───────────────────────────────────────────────── */

function Tag({
  tag,
  pressed,
  onPress,
  controls,
}: {
  tag: StepTag;
  pressed?: boolean;
  onPress?: () => void;
  controls?: string;
}) {
  if (!onPress)
    return (
      <span
        className="text-caption text-muted-foreground font-mono tabular-nums"
        title={STEP_NAME[tag]}
      >
        {tag}
      </span>
    );
  return (
    <button
      type="button"
      aria-expanded={pressed}
      aria-controls={controls}
      aria-label={`From ${tag} ${STEP_NAME[tag]}`}
      onClick={onPress}
      className={cn(
        "text-caption focus-visible:shadow-focus mx-0.5 inline-flex min-h-6 items-center rounded-xs border px-1 align-baseline font-mono tabular-nums outline-none pointer-coarse:min-h-11",
        PRESS,
        pressed
          ? "border-teal-600 bg-teal-50 text-teal-800"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {tag}
    </button>
  );
}

function Label({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="text-label text-foreground">
      {children}
    </h3>
  );
}

/** A finding's text; a vital outside the NEWS2 zero band is bold with its arrow (red only when the
 *  reading scores 3, as on the rail). Shared by the Summary and the Impression's matrix. */
export function FindingText({
  item,
  news2,
}: {
  item: Pick<SummaryItem, "text" | "out" | "ref">;
  news2: SiView["x"]["news2Latest"];
}) {
  if (!item.out) return <>{item.text}</>;
  const points = news2?.parameters.find((p) => p.parameter === NEWS2_PARAM[item.ref])?.points ?? 0;
  const Arrow = item.out === "low" ? ArrowDownIcon : ArrowUpIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-semibold",
        points === 3 ? SCORE3_TEXT : AMBER_TEXT,
      )}
    >
      {item.text}
      <Arrow aria-hidden className="size-3 shrink-0" />
      <span className="sr-only">{item.out === "low" ? "low" : "high"}</span>
    </span>
  );
}

/** One tickbox row; the allergy row is locked in ("always in"). */
function IncludeRow({
  item,
  news2,
  editable,
  onToggle,
  tag = true,
}: {
  item: SummaryItem;
  news2: SiView["x"]["news2Latest"];
  editable: boolean;
  onToggle: (item: SummaryItem) => void;
  tag?: boolean;
}) {
  const id = useId();
  return (
    <li className="flex min-h-8 items-start gap-2 py-0.5 pointer-coarse:min-h-11">
      <input
        id={id}
        type="checkbox"
        checked={item.included}
        disabled={!editable || item.locked}
        onChange={() => onToggle(item)}
        className="focus-visible:shadow-focus mt-1 size-4 shrink-0 accent-teal-700 outline-none"
      />
      <label htmlFor={id} className="text-body-s text-foreground min-w-0 flex-1">
        <FindingText item={item} news2={news2} />
        {item.cls ? (
          <LockIcon aria-label="Restricted" className="text-muted-foreground ml-1 inline size-3" />
        ) : null}
        {item.locked ? (
          <span className="text-caption text-muted-foreground ml-2">always in</span>
        ) : null}
      </label>
      {tag ? <Tag tag={item.step} /> : null}
    </li>
  );
}

/* ─── The step ──────────────────────────────────────────────────── */

export interface SummaryStepProps {
  si: SiView;
  editable: boolean;
  /** Who is signed in (the review's author). */
  actor: string;
  time: (iso: string) => string;
  /** The diagnosis catalogue is still loading ("Not asked yet" waits for it). */
  dxLoading?: boolean;
  onSummary: (fn: (d: SummaryDraft) => SummaryDraft) => void;
  onHistory: (fn: (h: History) => History) => void;
  /** Open the owner step (and, for the examination, the item). */
  onGo: (step: SectionId, item?: string) => void;
}

const COLUMNS: { id: Column; label: string }[] = [
  { id: "history", label: "History and background" },
  { id: "exam", label: "Examination" },
  { id: "negatives", label: "Pertinent negatives" },
];

export function SummaryStep({
  si,
  editable,
  actor,
  time,
  dxLoading,
  onSummary,
  onHistory,
  onGo,
}: SummaryStepProps) {
  const d = si.summaryDraft;
  const v = si.summary;
  const [inspect, setInspect] = useState<{ sentence: Sentence["id"]; tag: StepTag } | null>(null);
  const [compare, setCompare] = useState(false);
  const inspectorId = useId();
  const syndromeId = useId();

  const toggle = (item: SummaryItem) =>
    onSummary((cur) => {
      const include = { ...(cur.include ?? {}) };
      const next = !item.included;
      if (next === item.byDefault) delete include[item.ref];
      else include[item.ref] = next;
      return { ...cur, include: Object.keys(include).length ? include : undefined };
    });
  const review = () =>
    onSummary((cur) => markReviewed(cur, si.snapshot, { by: actor, at: new Date().toISOString() }));

  // "r" marks as reviewed on this step (§5.7): outside text fields, with no dialog open.
  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "r" || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      if (document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      review();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const tags = [...new Set(v.sentences.flatMap((s) => s.tags))].sort();
  const words = d.mode === "words";
  const inspected = inspect ? v.sentences.find((s) => s.id === inspect.sentence) : null;
  const inspectedItems = inspected
    ? v.items.filter((i) => inspected.refs.includes(i.ref) && i.step === inspect!.tag)
    : [];

  return (
    <div className="flex flex-col gap-6">
      {si.review === "changed" && d.review ? (
        <section
          aria-labelledby="summary-changes"
          className="bg-status-caution-bg/60 flex flex-col gap-2 rounded-md px-4 py-3"
        >
          <h3
            id="summary-changes"
            className="text-label dark:text-status-caution-fg inline-flex items-center gap-1.5 text-amber-900"
          >
            <TriangleAlertIcon aria-hidden className="size-3.5" />
            {`Changed since your review at ${time(d.review.at)}`}
          </h3>
          <ul className="flex flex-col gap-1">
            {si.changes.map((c, n) => (
              <li key={n} className="text-body-s text-foreground flex gap-2">
                <span className="text-caption text-muted-foreground w-16 shrink-0 pt-0.5">
                  {c.kind === "added" ? "Added" : c.kind === "left_out" ? "Left out" : "Edited"}
                </span>
                <span className="min-w-0">{c.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* One-liner (§5.1) */}
      <section aria-labelledby="summary-one-liner" className="flex flex-col gap-2">
        <Label id="summary-one-liner">One-liner</Label>
        <div className="flex flex-wrap items-center gap-2">
          <OneChip label="Who" missing={!v.oneLiner.who}>
            {v.oneLiner.who ?? "Age and sex not recorded"}
          </OneChip>
          <OneChip label="Onset" missing={!v.oneLiner.onset}>
            {v.oneLiner.onset
              ? `${v.oneLiner.onset.band.charAt(0).toUpperCase()}${v.oneLiner.onset.band.slice(1)} · ${v.oneLiner.onset.words}`
              : "Not recorded"}
          </OneChip>
          {v.oneLiner.course ? (
            <OneChip label="Course">{v.oneLiner.course}</OneChip>
          ) : (
            <button
              type="button"
              onClick={() => onGo("complaint")}
              className={cn(
                "text-body-s border-border focus-visible:shadow-focus inline-flex min-h-8 items-center gap-1.5 rounded-sm border border-dashed px-2.5 outline-none pointer-coarse:min-h-11",
                PRESS,
              )}
            >
              <span className="text-muted-foreground">Course</span>
              <span className="text-foreground">Not recorded</span>
              <span className="sr-only">: record it on the complaint</span>
            </button>
          )}
        </div>
        <label htmlFor={syndromeId} className="text-caption text-muted-foreground">
          Syndrome
        </label>
        <input
          id={syndromeId}
          value={d.syndrome ?? ""}
          maxLength={120}
          disabled={!editable}
          placeholder="In your words, e.g. hypothermia with bradycardia"
          onChange={(e) => onSummary((cur) => ({ ...cur, syndrome: e.target.value || undefined }))}
          className="bg-card text-body-s text-foreground focus-visible:shadow-focus min-h-9 w-full rounded-sm border border-teal-600/50 px-2.5 outline-none pointer-coarse:min-h-11"
        />
        <p className="text-caption text-muted-foreground">
          The syndrome is always your words. MedSync never names a syndrome or a diagnosis for you.
        </p>
      </section>

      {/* Mode and the paragraph (§5.1) */}
      <section aria-labelledby="summary-paragraph" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Label id="summary-paragraph">Paragraph</Label>
            <div
              role="radiogroup"
              aria-label="Summary mode"
              className="bg-muted inline-flex rounded-md p-0.5"
            >
              {(
                [
                  ["composed", "Composed"],
                  ["words", "In my words"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={d.mode === id}
                  disabled={!editable}
                  onClick={() =>
                    onSummary((cur) =>
                      id === "words"
                        ? {
                            ...cur,
                            mode: "words",
                            // The first switch copies the composed text; later switches keep yours.
                            words: cur.words ?? v.text,
                            wordsBase: cur.words ? cur.wordsBase : hashString(v.text),
                          }
                        : { ...cur, mode: "composed" },
                    )
                  }
                  className={cn(
                    "text-caption focus-visible:shadow-focus min-h-7 rounded-sm px-2.5 outline-none pointer-coarse:min-h-11",
                    d.mode === id
                      ? "bg-card text-teal-800 shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <span className="text-caption text-muted-foreground">
            {`From steps ${tags.join(" ")} · updates as you change them`}
          </span>
        </div>

        {words ? (
          <div className="flex flex-col gap-2">
            <div className="bg-status-caution-bg/60 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md px-3 py-2">
              <TriangleAlertIcon aria-hidden className={cn("size-3.5 shrink-0", AMBER_TEXT)} />
              <p className="text-body-s text-foreground min-w-0 flex-1">
                {d.legacy
                  ? "Written in the previous format. Your words go into the note."
                  : "Your words go into the note. Later changes in the steps will not update them."}
                {si.composedMoved ? (
                  <>
                    {" "}
                    The composed summary has changed since you wrote this.{" "}
                    <button
                      type="button"
                      onClick={() => setCompare(true)}
                      className="focus-visible:shadow-focus rounded-xs font-medium text-teal-700 outline-none hover:underline"
                    >
                      Compare
                    </button>
                  </>
                ) : null}
              </p>
              {editable ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onSummary((cur) => ({ ...cur, mode: "composed" }))}
                >
                  {d.legacy ? "Continue in the composed format" : "Back to composed"}
                </Button>
              ) : null}
            </div>
            <textarea
              aria-label="Summary, in your words"
              value={d.words ?? ""}
              disabled={!editable}
              maxLength={20_000}
              rows={Math.min(14, Math.max(4, Math.ceil((d.words ?? "").length / 90)))}
              onChange={(e) => onSummary((cur) => ({ ...cur, words: e.target.value }))}
              className="border-input bg-card text-body-s text-foreground focus-visible:shadow-focus w-full rounded-sm border px-3 py-2 leading-relaxed outline-none"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-body-m text-foreground leading-relaxed">
              {v.sentences.map((s) => (
                <span
                  key={s.id}
                  className={cn(
                    "rounded-xs",
                    inspect?.sentence === s.id && "bg-muted ring-border ring-1",
                  )}
                >
                  {s.text}
                  {s.tags.map((t) => (
                    <Tag
                      key={t}
                      tag={t}
                      controls={inspectorId}
                      pressed={inspect?.sentence === s.id && inspect.tag === t}
                      onPress={() =>
                        setInspect((cur) =>
                          cur?.sentence === s.id && cur.tag === t
                            ? null
                            : { sentence: s.id, tag: t },
                        )
                      }
                    />
                  ))}{" "}
                </span>
              ))}
            </p>
            <span className="text-caption text-muted-foreground font-mono tabular-nums">{`${v.wordCount} words`}</span>
            {inspect && inspected ? (
              <div
                id={inspectorId}
                className="border-border bg-muted/40 flex flex-col gap-2 rounded-md border px-3 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-label text-foreground">{`From ${inspect.tag} ${STEP_NAME[inspect.tag]}`}</span>
                  <Button size="sm" variant="secondary" onClick={() => onGo(TAG_STEP[inspect.tag])}>
                    {`Open ${STEP_NAME[inspect.tag]}`}
                  </Button>
                </div>
                {inspectedItems.length ? (
                  <ul className="flex flex-col">
                    {inspectedItems.map((i) => (
                      <IncludeRow
                        key={i.ref}
                        item={i}
                        news2={si.x.news2Latest}
                        editable={editable}
                        onToggle={toggle}
                        tag={false}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-body-s text-muted-foreground">
                    Composed from the record by fixed rules; nothing here to tick in or out.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* What goes in (§5.1) */}
      <section aria-labelledby="summary-in" className="flex flex-col gap-3">
        <Label id="summary-in">What goes in</Label>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {COLUMNS.map((c) => {
            const list = v.items.filter((i) => i.column === c.id);
            const n = list.filter((i) => i.included).length;
            return (
              <div
                key={c.id}
                className="flex min-w-0 flex-col gap-1.5"
                role="group"
                aria-labelledby={`summary-col-${c.id}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    id={`summary-col-${c.id}`}
                    className="text-caption text-muted-foreground tracking-[0.06em] uppercase"
                  >
                    {c.label}
                  </span>
                  <span className="text-caption text-muted-foreground font-mono tabular-nums">{`${n} of ${list.length}`}</span>
                </div>
                {list.length ? (
                  <ul className="flex flex-col">
                    {list.map((i) => (
                      <IncludeRow
                        key={i.ref}
                        item={i}
                        news2={si.x.news2Latest}
                        editable={editable}
                        onToggle={toggle}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-body-s text-muted-foreground">Nothing recorded.</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Not asked yet (§5.2) */}
      {dxLoading ? (
        <p role="status" className="text-body-s text-muted-foreground">
          Loading reasoning aids…
        </p>
      ) : si.asks.length ? (
        <NotAsked rows={si.asks} editable={editable} onHistory={onHistory} onGo={onGo} />
      ) : null}

      {/* Not recorded, so not stated (§4.9) */}
      {v.gaps.length ? (
        <section aria-labelledby="summary-gaps" className="flex flex-col gap-2">
          <Label id="summary-gaps">Not recorded, so not stated</Label>
          <ul className="flex flex-wrap gap-2">
            {v.gaps.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => onGo(TAG_STEP[g.step])}
                  className={cn(
                    "text-body-s border-border focus-visible:shadow-focus inline-flex min-h-8 items-center gap-1.5 rounded-sm border border-dashed px-2.5 outline-none pointer-coarse:min-h-11",
                    PRESS,
                  )}
                >
                  {g.label}
                  <span className="text-caption text-muted-foreground font-mono tabular-nums">
                    {g.step}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Review (SI8) */}
      <div className="border-border flex flex-wrap items-center gap-3 border-t pt-4">
        {editable ? (
          <>
            <Button
              variant="ghost"
              onClick={() => onSummary((cur) => ({ ...cur, mode: "composed", include: undefined }))}
              disabled={d.mode === "composed" && !d.include}
            >
              Reset to composed
            </Button>
            <span className="flex-1" />
            <span aria-live="polite" className="text-caption text-muted-foreground">
              {si.review === "reviewed" && d.review
                ? `Reviewed by you at ${time(d.review.at)}. Any change asks for review again.`
                : null}
            </span>
            {si.review !== "reviewed" ? (
              <Button className={PRESS} onClick={review} aria-keyshortcuts="r">
                {si.review === "changed" ? "Review again" : "Mark as reviewed"}
              </Button>
            ) : null}
          </>
        ) : d.review ? (
          <span className="text-caption text-muted-foreground">{`Reviewed at ${time(d.review.at)}.`}</span>
        ) : null}
      </div>

      <EmrDialog
        open={compare}
        onOpenChange={setCompare}
        title="Compare"
        description="Nothing merges on its own: copy what you want into your words."
        width="wide"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-muted-foreground tracking-[0.06em] uppercase">
              Composed now
            </span>
            <p className="text-body-s text-foreground leading-relaxed">{v.text}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-muted-foreground tracking-[0.06em] uppercase">
              Your words
            </span>
            <p className="text-body-s text-foreground leading-relaxed whitespace-pre-wrap">
              {d.words}
            </p>
          </div>
        </div>
      </EmrDialog>
    </div>
  );
}

function OneChip({
  label,
  missing,
  children,
}: {
  label: string;
  missing?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "text-body-s inline-flex min-h-8 items-center gap-1.5 rounded-sm border px-2.5",
        missing ? "border-border border-dashed" : "border-border bg-card",
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{children}</span>
    </span>
  );
}

/** "Not asked yet, relevant to your differential" (§5.2): answered in place and written to the
 *  history step; examination targets open the examination (D-SI-11, D-SI-17). */
export function NotAsked({
  rows,
  editable,
  onHistory,
  onGo,
  title = "Not asked yet, relevant to your differential",
}: {
  rows: readonly AskRow[];
  editable: boolean;
  onHistory: (fn: (h: History) => History) => void;
  onGo: (step: SectionId, item?: string) => void;
  title?: string;
}) {
  const answer = (r: AskRow, a: YesNo | string) => onHistory((h) => answerAsk(h, r.target, a));
  return (
    <section aria-labelledby="summary-not-asked" className="flex flex-col gap-2">
      <Label id="summary-not-asked">{title}</Label>
      <p className="text-caption text-muted-foreground">
        It goes into the history step and the summary. Examination items open the examination.
      </p>
      <ul className="divide-border flex flex-col divide-y">
        {rows.map((r) => {
          const label = `${r.label} · for ${r.for.join(", ")}`;
          const tag = <Tag tag={r.step} />;
          if (r.mode === "yesno" || r.mode === "symptom_first")
            return (
              <li key={r.key}>
                <YesNoRow
                  label={label}
                  value={undefined}
                  disabled={!editable}
                  onAnswer={(a) => answer(r, a)}
                >
                  {tag}
                </YesNoRow>
              </li>
            );
          if (r.mode === "options")
            return (
              <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1.5">
                <span className="text-body-s text-foreground min-w-0 flex-1">{label}</span>
                <span role="group" aria-label={r.label} className="flex flex-wrap gap-1">
                  {r.options!.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      disabled={!editable}
                      onClick={() => answer(r, o.id)}
                      className={cn(
                        "text-caption border-border hover:bg-muted focus-visible:shadow-focus min-h-7 rounded-sm border px-2 outline-none pointer-coarse:min-h-11",
                        PRESS,
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </span>
                {tag}
              </li>
            );
          const item = r.target.kind === "exam_item" ? r.target.id : undefined;
          return (
            <li key={r.key} className="flex min-h-[34px] items-center gap-3 py-1">
              <span className="text-body-s text-foreground min-w-0 flex-1">{label}</span>
              {tag}
              <Button size="sm" variant="secondary" onClick={() => onGo(TAG_STEP[r.step], item)}>
                {r.step === "07" ? "Examine" : `Open ${STEP_NAME[r.step]}`}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
