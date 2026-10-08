"use client";

import type { SiView } from "../si-model";
import type { DxData } from "../use-catalogue";
import type { ImpressionView, NamedSuggestion } from "./model";
import type { DxPick } from "@/components/emr/desk/pickers";
import type { DxTerm } from "@/components/emr/desk/search";
import type { DxOptions } from "@/components/emr/desk/sections";
import type { History } from "@/lib/clerking/answers";
import type { Association } from "@/lib/clerking/impression/associations";
import type { BoardRow, ImpressionDraft, Likelihood } from "@/lib/clerking/impression/board";
import type { Column } from "@/lib/clerking/impression/evidence";
import type { Finding, FindingRef } from "@/lib/clerking/impression/facts";
import type { SectionId } from "@/lib/clerking/status";
import type { ReactNode } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClockIcon,
  LayoutGridIcon,
  PlusIcon,
  ShieldAlertIcon,
  StarIcon,
  XIcon,
} from "lucide-react";

import { DiagnosisPicker } from "@/components/emr/desk/pickers";
import { PRESS } from "@/components/emr/orders/choice-chips";
import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { associationsOf, withLink } from "@/lib/clerking/impression/associations";
import {
  canMove,
  duplicateOf,
  move,
  normaliseTyped,
  pendingKey,
  withLikelihood,
} from "@/lib/clerking/impression/board";
import {
  acceptColumn,
  cellState,
  explainWithLeading,
  nextState,
  withMark,
} from "@/lib/clerking/impression/evidence";
import { SUGGESTION_CHIPS } from "@/lib/clerking/impression/suggest";
import { cn } from "@/lib/utils";
import { FindingText } from "../summary/summary-step";
import { AssociationsFold } from "./associations";
import { DiagnosisBrowseDialog } from "./browse-dialog";
import { ReasonField, subLine } from "./details";
import { EvidenceMatrix } from "./matrix";

/**
 * Step 09, Impression (PROMPT-CLERKING-SUMMARY-IMPRESSION §4, §5.3–5.4): the leading diagnosis (the
 * visit's primary), the differential in the clinician's order with Likely, Possible or Unlikely and
 * must-not-miss pinned until reasoned (SI5), the evidence matrix, decision-support suggestions the
 * clinician adds by hand (SI2), also this visit, and add with the duplicate guard (S-3). Diagnoses
 * are conditions written by the existing actions (SI4, SI6); order, likelihood, reasons, evidence
 * and meta live in the draft (§8).
 */

export type RemoveCode = "added_by_mistake" | "duplicate" | "ruled_out" | "other";
const REMOVE: { id: RemoveCode; label: string; text: boolean }[] = [
  { id: "added_by_mistake", label: "Added by mistake", text: false },
  { id: "duplicate", label: "Duplicate", text: false },
  { id: "ruled_out", label: "Ruled out", text: true },
  { id: "other", label: "Other", text: true },
];

export interface ImpressionHandlers {
  onDiagnosis?: (pick: DxPick, opts: DxOptions) => void;
  onLeading?: (row: BoardRow) => void;
  onToDifferential?: (row: BoardRow) => void;
  onDxStatus?: (row: BoardRow, to: "working" | "final") => void;
  onRemove?: (row: BoardRow, reason: { code: RemoveCode; text?: string }) => void;
  onAddToPlan?: (testId: string, row: BoardRow) => void;
  onProblemList?: (row: BoardRow) => void;
}

export interface ImpressionStepProps {
  si: SiView;
  v: ImpressionView;
  dx: DxData | null;
  dxLoading: boolean;
  editable: boolean;
  /** Chart actions allowed (visit open, not deceased). */
  act: boolean;
  canFinal: boolean;
  actor: string;
  busy: string | null;
  loaders: { terms: () => Promise<DxTerm[]>; searchTerms?: (q: string) => Promise<DxTerm[]> };
  on: ImpressionHandlers;
  onImpression: (fn: (d: ImpressionDraft) => ImpressionDraft) => void;
  onDeferral: (reason: string | null) => void;
  onHistory: (fn: (h: History) => History) => void;
  onGo: (step: SectionId, item?: string) => void;
  onDetails: (logicalId: string) => void;
  /** 834 px and up: the evidence matrix exists (D-SI-14). */
  wide: boolean;
  inPlan: (logicalId: string) => ReadonlySet<string>;
}

const LIKELIHOOD: { id: Likelihood; label: string; key: string }[] = [
  { id: "likely", label: "Likely", key: "l" },
  { id: "possible", label: "Possible", key: "p" },
  { id: "unlikely", label: "Unlikely", key: "u" },
];

function Seg<V extends string>({
  label,
  options,
  value,
  onPick,
  disabled,
}: {
  label: string;
  options: readonly { id: V; label: string; disabled?: boolean }[];
  value: V | null | undefined;
  onPick: (v: V) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="bg-muted inline-flex shrink-0 flex-wrap gap-0.5 rounded-md p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          disabled={disabled || o.disabled}
          onClick={() => onPick(o.id)}
          className={cn(
            "text-caption focus-visible:shadow-focus min-h-7 rounded-sm px-2.5 outline-none disabled:opacity-50 pointer-coarse:min-h-11",
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

const ADD_AS = (hasLeading: boolean) => [
  { id: "leading" as const, label: "Leading", disabled: hasLeading },
  { id: "differential" as const, label: "Differential" },
  { id: "also" as const, label: "Also this visit" },
];
type AddAsSlot = ReturnType<typeof ADD_AS>[number]["id"];

/** "Add as", on the step and in "Show all". A phone takes the three choices as a select (§5.6). */
function AddAs({
  value,
  hasLeading,
  onPick,
}: {
  value: AddAsSlot;
  hasLeading: boolean;
  onPick: (v: AddAsSlot) => void;
}) {
  return (
    <>
      <div className="max-sm:hidden">
        <Seg label="Add as" options={ADD_AS(hasLeading)} value={value} onPick={onPick} />
      </div>
      <label className="text-caption text-muted-foreground flex flex-col gap-1 sm:hidden">
        Add as
        <select
          value={value}
          onChange={(e) => onPick(e.target.value as AddAsSlot)}
          className="border-input bg-card text-body-s text-foreground focus-visible:shadow-focus min-h-11 rounded-sm border px-2 outline-none"
        >
          {ADD_AS(hasLeading).map((o) => (
            <option key={o.id} value={o.id} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function MnmPill({ unlikely }: { unlikely?: boolean }) {
  return (
    <span className="text-caption bg-status-caution-bg dark:text-status-caution-fg inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium text-amber-800">
      <ShieldAlertIcon aria-hidden className="size-3 shrink-0" />
      {unlikely ? "Must not miss · marked unlikely" : "Must not miss"}
    </span>
  );
}

function Section({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={id} className="text-label text-foreground">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/* ─── Remove with a reason (D-SI-13) ────────────────────────────── */

function RemoveForm({
  row,
  onRemove,
  onCancel,
}: {
  row: BoardRow;
  onRemove: ImpressionHandlers["onRemove"];
  onCancel: () => void;
}) {
  const [code, setCode] = useState<RemoveCode | null>(null);
  const [text, setText] = useState("");
  const need = REMOVE.find((r) => r.id === code)?.text ?? false;
  const ok = !!code && (!need || text.trim().length > 2);
  const tid = useId();
  return (
    <div className="border-border bg-muted/40 flex flex-col gap-2 rounded-md border px-3 py-2.5">
      <Seg label={`Why remove ${row.dx.display}?`} options={REMOVE} value={code} onPick={setCode} />
      {need ? (
        <>
          <label htmlFor={tid} className="text-caption text-muted-foreground">
            {code === "ruled_out" ? "How was it ruled out?" : "The reason"}
          </label>
          <input
            id={tid}
            value={text}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
            className="border-input bg-card text-body-s focus-visible:shadow-focus min-h-9 rounded-sm border px-2.5 outline-none"
          />
        </>
      ) : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={!ok}
          onClick={() => code && onRemove?.(row, { code, text: text.trim() || undefined })}
        >
          Remove, entered in error
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ─── Status: Working or Final (SI7) ────────────────────────────── */

function StatusControl({
  row,
  canFinal,
  editable,
  onDxStatus,
}: {
  row: BoardRow;
  canFinal: boolean;
  editable: boolean;
  onDxStatus: ImpressionHandlers["onDxStatus"];
}) {
  const final = row.dx.verification === "confirmed" || row.dx.cosignPending;
  return (
    <Seg
      label={`Status of ${row.dx.display}`}
      disabled={!editable || !onDxStatus}
      options={[
        { id: "working" as const, label: "Working" },
        {
          id: "final" as const,
          label: canFinal ? "Final" : "Final (senior)",
          disabled: row.dx.cosignPending,
        },
      ]}
      value={final ? "final" : "working"}
      onPick={(to) => to !== (final ? "final" : "working") && onDxStatus?.(row, to)}
    />
  );
}

/* ─── The step ──────────────────────────────────────────────────── */

export function ImpressionStep(props: ImpressionStepProps) {
  const { si, v, dx, editable, act } = props;
  const b = si.board;
  const lead = b.leading;
  const [removing, setRemoving] = useState<string | null>(null);
  // A diagnosis this clinician added at this visit comes off in one tap as "Added by mistake"
  // (ADR 0217); any other still asks why (D-SI-13). Both are entered in error, never deleted.
  const startRemove = (row: BoardRow) =>
    row.dx.addedHere
      ? props.on.onRemove?.(row, { code: "added_by_mistake" })
      : setRemoving(row.dx.logicalId);
  const removeTitle = (row: BoardRow) =>
    row.dx.addedHere ? "Added by mistake: remove" : "Remove with a reason";
  const [view, setView] = useState<"list" | "matrix">("list");
  const [allRows, setAllRows] = useState(false);
  const [more, setMore] = useState(false);
  const [deferText, setDeferText] = useState("");
  const [addAs, setAddAs] = useState<AddAsSlot | null>(null);
  const [browse, setBrowse] = useState(false);
  const slot = addAs ?? (lead ? "differential" : "leading");
  const stamp = () => ({ by: props.actor, at: new Date().toISOString() });
  const matrixOn = view === "matrix" && props.wide && !!dx;
  const canWrite = editable && act;
  const deferId = useId();

  const termByDx = useMemo(() => {
    const m = new Map<string, string>();
    for (const [uuid, id] of Object.entries(dx?.termIds ?? {})) m.set(id, uuid);
    return m;
  }, [dx]);

  const onCycle = (col: Column, f: Finding) =>
    props.onImpression((d) =>
      withMark(d, col.row.dx.logicalId, f.ref, nextState(cellState(col, f.ref)), stamp()),
    );
  const onAccept = (col: Column) => props.onImpression((d) => acceptColumn(d, col, stamp()));
  const setLik = (row: BoardRow, l: Likelihood) =>
    props.onImpression((d) => withLikelihood(d, row.dx.logicalId, l));

  /** A term or typed words from the search or "Show all", added as "Add as" shows. */
  const addPicked = (pick: DxPick) => {
    props.on.onDiagnosis?.(pick, {
      verification: slot === "differential" ? "differential" : "provisional",
      primary: slot === "leading",
      addToProblemList: null,
    });
    setAddAs(null);
  };

  /* Associations (owner, 2026-10-08): complications and conditions that go with a diagnosis. */
  const assocOf = (row: BoardRow): Association[] =>
    dx
      ? associationsOf(
          { dxId: row.dx.dxId, logicalId: row.dx.logicalId },
          { x: si.x, dx, live: si.live, viewer: si.viewer, board: b, draft: si.impression },
        )
      : [];
  const addAssociation = (row: BoardRow, a: Association) => {
    props.onImpression((d) => withLink(d, row.dx.logicalId, a.dxId));
    if (a.onVisit) return;
    const uuid = termByDx.get(a.dxId);
    const n = dx?.names[a.dxId];
    const pick: DxPick =
      n?.coded && uuid
        ? {
            term: {
              id: uuid,
              display: a.display,
              synonyms: [],
              icd11: null,
              verified: false,
              chronic: false,
              symptomLevel: false,
              restricted: n.restricted,
              notifiable: false,
            },
          }
        : { typed: a.display };
    if (duplicateOf(si.recorded, "term" in pick ? { termId: pick.term.id } : pick)) return;
    props.on.onDiagnosis?.(pick, {
      verification: "provisional",
      primary: false,
      addToProblemList: null,
    });
  };
  const assocFold = (row: BoardRow) => (
    <AssociationsFold
      parent={row.dx.display}
      items={assocOf(row)}
      findingText={(ref) => v.findings.get(ref as FindingRef)?.text ?? null}
      testName={(id) => dx?.tests[id] ?? id.replace(/^test\./, "").replace(/_/g, " ")}
      canWrite={canWrite && !!props.on.onDiagnosis}
      onAdd={(a) => addAssociation(row, a)}
    />
  );

  const addSuggestion = (g: NamedSuggestion) => {
    const asLeading = g.forLeading && !lead;
    const uuid = termByDx.get(g.dxId);
    const pick: DxPick =
      g.coded && uuid
        ? {
            term: {
              id: uuid,
              display: g.display,
              synonyms: [],
              icd11: null,
              verified: false,
              chronic: false,
              symptomLevel: g.forLeading,
              restricted: g.restricted,
              notifiable: false,
            },
          }
        : { typed: g.display };
    if (duplicateOf(si.recorded, "term" in pick ? { termId: pick.term.id } : pick)) return;
    // Added from the box as Possible (§5.3); the likelihood waits in the draft for its condition.
    if (!asLeading)
      props.onImpression((d) => ({
        ...d,
        likelihood: {
          ...d.likelihood,
          [pendingKey({ termId: "term" in pick ? pick.term.id : null, display: g.display })]:
            "possible",
        },
      }));
    props.on.onDiagnosis?.(pick, {
      verification: asLeading ? "provisional" : "differential",
      primary: asLeading,
      addToProblemList: null,
    });
  };

  // Keys on this step (§5.7), outside text fields and dialogs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      if (e.ctrlKey || e.metaKey) return;
      if (e.key === "/" && !e.altKey) {
        const input = document.getElementById("impression-add") as HTMLInputElement | null;
        if (input) {
          e.preventDefault();
          e.stopImmediatePropagation();
          input.focus();
        }
        return;
      }
      if (e.key === "m" && !e.altKey && props.wide && dx) {
        e.preventDefault();
        setView((x) => (x === "list" ? "matrix" : "list"));
        return;
      }
      const rowEl = t?.closest<HTMLElement>("[data-dx-row]");
      const row = rowEl
        ? b.differential.find((r) => r.dx.logicalId === rowEl.dataset.dxRow)
        : undefined;
      if (!row) return;
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && canWrite) {
        const next = move(b, row.dx.logicalId, e.key === "ArrowUp" ? -1 : 1);
        if (next) {
          e.preventDefault();
          props.onImpression((d) => ({ ...d, order: next }));
        }
        return;
      }
      if (e.altKey) return;
      const l = LIKELIHOOD.find((x) => x.key === e.key);
      if (l && canWrite) {
        e.preventDefault();
        setLik(row, l.id);
      } else if (e.key === "d") {
        e.preventDefault();
        props.onDetails(row.dx.logicalId);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const leadCol = lead ? v.col(lead.dx.logicalId) : undefined;
  const supports = lead
    ? Object.entries(si.impression.evidence[lead.dx.logicalId] ?? {})
        .filter(([, a]) => a.w === "for")
        .map(([ref]) => v.findings.get(ref))
        .filter((f): f is Finding => !!f)
    : [];
  const leadMeta = lead ? (si.impression.meta[lead.dx.logicalId] ?? {}) : {};
  const leadTests = lead ? props.inPlan(lead.dx.logicalId).size : 0;
  const shown = more ? v.suggestions : v.suggestions.slice(0, SUGGESTION_CHIPS);

  return (
    <div className="flex flex-col gap-7">
      {props.dxLoading ? (
        <p role="status" className="text-body-s text-muted-foreground">
          Loading reasoning aids…
        </p>
      ) : null}

      {/* Leading (§4 Impression, 2) */}
      <section
        aria-labelledby="impression-leading"
        className="border-border rounded-lg border px-4 py-4"
      >
        {lead ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span
                id="impression-leading"
                className="text-caption inline-flex items-center gap-1.5 font-medium tracking-[0.06em] text-teal-700 uppercase dark:text-teal-300"
              >
                <StarIcon aria-hidden className="size-3.5 fill-current" />
                Leading · primary for this visit
              </span>
              <StatusControl
                row={lead}
                canFinal={props.canFinal}
                editable={canWrite}
                onDxStatus={props.on.onDxStatus}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <h3 className="text-heading-s text-foreground">{lead.dx.display}</h3>
              <span className="text-caption text-muted-foreground">{subLine(lead, dx)}</span>
            </div>
            {lead.dx.cosignPending ? (
              <StatusWord tone="caution">Final · awaiting senior co-signature</StatusWord>
            ) : null}
            {lead.awaitingSignoff ? (
              <p className="text-caption text-muted-foreground">Reasoning aids awaiting sign-off</p>
            ) : null}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-caption text-muted-foreground">Supports it</span>
                {supports.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {supports.map((f) => (
                      <li key={f.ref}>
                        <span className="bg-ink-100 dark:bg-ink-700 text-caption inline-flex min-h-7 items-center gap-1 rounded-sm pr-0.5 pl-2">
                          <span className="font-mono">+</span>
                          <FindingText item={f} news2={si.x.news2Latest} />
                          {canWrite ? (
                            <button
                              type="button"
                              aria-label={`Remove ${f.text} from the support`}
                              onClick={() =>
                                props.onImpression((d) =>
                                  withMark(d, lead.dx.logicalId, f.ref, "blank", stamp()),
                                )
                              }
                              className="hover:bg-card focus-visible:shadow-focus inline-flex size-6 items-center justify-center rounded-xs outline-none pointer-coarse:size-11"
                            >
                              <XIcon aria-hidden className="size-3" />
                            </button>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-body-s text-muted-foreground">
                    {leadCol && leadCol.suggested.size
                      ? "Nothing accepted yet. Open the matrix or Details to accept."
                      : "Nothing accepted yet."}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5" aria-live="polite">
                <span className="text-caption text-muted-foreground">
                  Not yet explained by any diagnosis
                </span>
                {v.unexplained.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {v.unexplained.map((f) => (
                      <li key={f.ref}>
                        <button
                          type="button"
                          disabled={!canWrite}
                          onClick={() =>
                            props.onImpression((d) =>
                              v
                                .sameAs(f.ref)
                                .reduce((acc, ref) => explainWithLeading(acc, b, ref, stamp()), d),
                            )
                          }
                          aria-label={`${f.text}: link it to ${lead.dx.display}`}
                          className={cn(
                            "text-caption border-border hover:bg-muted focus-visible:shadow-focus inline-flex min-h-7 items-center gap-1 rounded-sm border border-dashed px-2 outline-none pointer-coarse:min-h-11",
                            PRESS,
                          )}
                        >
                          <FindingText item={f} news2={si.x.news2Latest} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-body-s text-muted-foreground">
                    Everything recorded is explained by a diagnosis.
                  </p>
                )}
              </div>
            </div>
            <p
              aria-live="polite"
              className="text-caption text-muted-foreground flex flex-wrap gap-x-2"
            >
              {[
                leadMeta.onset ? leadMeta.onset.replace(/_/g, " ") : null,
                leadMeta.severity ? `${leadMeta.severity} (your grading)` : null,
                `${leadTests} ${leadTests === 1 ? "test" : "tests"} in plan`,
                v.missingReasons
                  ? `${v.missingReasons} must-not-miss ${v.missingReasons === 1 ? "needs" : "need"} a reason`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="flex flex-wrap gap-2">
              {canWrite && props.on.onToDifferential ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => props.on.onToDifferential!(lead)}
                >
                  Move to differential
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => props.onDetails(lead.dx.logicalId)}>
                Details
              </Button>
              {canWrite && props.on.onRemove ? (
                <Button
                  size="sm"
                  variant="ghost"
                  title={removeTitle(lead)}
                  onClick={() => startRemove(lead)}
                >
                  Remove
                </Button>
              ) : null}
            </div>
            {assocFold(lead)}
            {removing === lead.dx.logicalId ? (
              <RemoveForm
                row={lead}
                onRemove={(r, why) => {
                  setRemoving(null);
                  props.on.onRemove?.(r, why);
                }}
                onCancel={() => setRemoving(null)}
              />
            ) : null}
          </div>
        ) : b.deferred ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                id="impression-leading"
                className="text-caption text-muted-foreground tracking-[0.06em] uppercase"
              >
                Diagnosis deferred
              </span>
              <p className="text-body-s text-foreground">
                {b.deferred.reason || "No reason given"}
              </p>
            </div>
            {editable ? (
              <Button size="sm" variant="secondary" onClick={() => props.onDeferral(null)}>
                Undo
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <span id="impression-leading" className="text-label text-foreground">
              No leading diagnosis yet
            </span>
            <p className="text-body-s text-muted-foreground">
              Add the diagnosis you would treat for now below, or pick it from what the findings
              suggest. If it is too early to name one, defer it with the reason.
            </p>
            {editable ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex min-w-[220px] flex-1 flex-col gap-1">
                  <label htmlFor={deferId} className="text-caption text-muted-foreground">
                    Defer the diagnosis, with the reason
                  </label>
                  <input
                    id={deferId}
                    value={deferText}
                    maxLength={500}
                    onChange={(e) => setDeferText(e.target.value)}
                    placeholder="e.g. awaiting the blood film"
                    className="border-input bg-card text-body-s focus-visible:shadow-focus min-h-9 rounded-sm border px-2.5 outline-none pointer-coarse:min-h-11"
                  />
                </div>
                <Button
                  variant="secondary"
                  disabled={deferText.trim().length < 3}
                  onClick={() => props.onDeferral(deferText.trim())}
                >
                  Defer
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* Differential (§5.3, §5.4) */}
      <Section
        id="impression-differential"
        title={`Differential (${b.differential.length})`}
        aside={
          <Seg
            label="Differential view"
            options={[
              { id: "list" as const, label: "List" },
              { id: "matrix" as const, label: "Evidence matrix", disabled: !dx || !props.wide },
            ]}
            value={matrixOn ? "matrix" : "list"}
            onPick={setView}
          />
        }
      >
        {matrixOn ? (
          <EvidenceMatrix
            si={si}
            v={v}
            all={allRows}
            onAll={setAllRows}
            editable={canWrite}
            onCycle={onCycle}
            onAccept={onAccept}
            onDetails={props.onDetails}
          />
        ) : b.differential.length ? (
          <>
            <p className="text-caption text-muted-foreground">
              Must-not-miss stay on top until you mark them unlikely, with a reason.
            </p>
            <ol className="divide-border flex flex-col divide-y">
              {b.differential.map((row) => {
                const c = v.counts(row);
                const up = canMove(b, row.dx.logicalId, -1);
                const down = canMove(b, row.dx.logicalId, 1);
                const moveTo = (dir: -1 | 1) => {
                  const next = move(b, row.dx.logicalId, dir);
                  if (next) props.onImpression((d) => ({ ...d, order: next }));
                };
                return (
                  <li
                    key={row.dx.logicalId}
                    data-dx-row={row.dx.logicalId}
                    className="flex flex-col gap-2 py-3"
                  >
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                      <span className="flex shrink-0 flex-col">
                        <button
                          type="button"
                          aria-label={`Move ${row.dx.display} up`}
                          aria-keyshortcuts="Alt+ArrowUp"
                          disabled={!canWrite || !up}
                          onClick={() => moveTo(-1)}
                          className="hover:bg-muted focus-visible:shadow-focus inline-flex size-6 items-center justify-center rounded-xs outline-none disabled:opacity-30 pointer-coarse:size-11"
                        >
                          <ArrowUpIcon aria-hidden className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${row.dx.display} down`}
                          aria-keyshortcuts="Alt+ArrowDown"
                          disabled={!canWrite || !down}
                          onClick={() => moveTo(1)}
                          className="hover:bg-muted focus-visible:shadow-focus inline-flex size-6 items-center justify-center rounded-xs outline-none disabled:opacity-30 pointer-coarse:size-11"
                        >
                          <ArrowDownIcon aria-hidden className="size-3.5" />
                        </button>
                      </span>
                      <span className="text-caption text-muted-foreground w-6 shrink-0 pt-1 font-mono tabular-nums">{`#${row.position}`}</span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-body-m text-foreground font-medium">
                            {row.dx.display}
                          </span>
                          {row.mustNotMiss ? (
                            <MnmPill unlikely={row.likelihood === "unlikely"} />
                          ) : null}
                          {row.timeCritical ? (
                            <span className="text-caption text-muted-foreground inline-flex items-center gap-1">
                              <ClockIcon aria-hidden className="size-3" />
                              Time-critical
                            </span>
                          ) : null}
                          <span className="text-caption text-muted-foreground font-mono tabular-nums">{`${c.for} for · ${c.against} against`}</span>
                        </span>
                        <span className="text-caption text-muted-foreground">
                          {row.awaitingSignoff ? "Reasoning aids awaiting sign-off" : v.basis(row)}
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Seg
                          label={`Likelihood of ${row.dx.display}`}
                          disabled={!canWrite}
                          options={LIKELIHOOD}
                          value={row.likelihood}
                          onPick={(l) => setLik(row, l)}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pl-[3.75rem]">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-keyshortcuts="d"
                        onClick={() => props.onDetails(row.dx.logicalId)}
                      >
                        Details
                      </Button>
                      {canWrite && props.on.onLeading ? (
                        <Button size="sm" variant="ghost" onClick={() => props.on.onLeading!(row)}>
                          Make leading
                        </Button>
                      ) : null}
                      {canWrite && props.on.onRemove ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          title={removeTitle(row)}
                          onClick={() => startRemove(row)}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                    {row.mustNotMiss && row.likelihood === "unlikely" ? (
                      <div className="pl-[3.75rem]">
                        <ReasonField
                          row={row}
                          editable={canWrite}
                          onImpression={props.onImpression}
                        />
                      </div>
                    ) : null}
                    <div className="pl-[3.75rem]">{assocFold(row)}</div>
                    {removing === row.dx.logicalId ? (
                      <div className="pl-[3.75rem]">
                        <RemoveForm
                          row={row}
                          onRemove={(r, why) => {
                            setRemoving(null);
                            props.on.onRemove?.(r, why);
                          }}
                          onCancel={() => setRemoving(null)}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <p className="text-body-s text-muted-foreground">No differential yet.</p>
        )}
      </Section>

      {/* Also considered with these findings (§5.3, D-SI-12) */}
      {v.suggestions.length ? (
        <section
          aria-labelledby="impression-suggestions"
          className="border-border flex flex-col gap-2 rounded-md border border-dashed px-4 py-3"
        >
          <h3 id="impression-suggestions" className="text-body-s text-foreground">
            Also considered with these findings.{" "}
            <span className="text-muted-foreground">
              Decision support: add only what you would consider.
            </span>
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {shown.map((g) => (
              <li key={g.dxId}>
                <button
                  type="button"
                  disabled={!canWrite || !props.on.onDiagnosis || props.busy === "dx"}
                  title={g.why.join("; ")}
                  aria-describedby={`sugg-why-${g.dxId}`}
                  onClick={() => addSuggestion(g)}
                  className={cn(
                    "text-body-s border-border bg-card hover:bg-muted focus-visible:shadow-focus inline-flex min-h-8 items-center gap-1 rounded-sm border px-2.5 outline-none disabled:opacity-50 pointer-coarse:min-h-11",
                    PRESS,
                  )}
                >
                  <PlusIcon aria-hidden className="size-3.5" />
                  {g.display}
                  {g.mustNotMiss ? (
                    <ShieldAlertIcon
                      aria-label="Must not miss"
                      className="dark:text-status-caution-fg size-3 text-amber-700"
                    />
                  ) : null}
                </button>
                <span id={`sugg-why-${g.dxId}`} className="sr-only">
                  {`${g.forLeading && !lead ? "Adds as the leading diagnosis. " : ""}Suggested by: ${g.why.join("; ")}`}
                </span>
              </li>
            ))}
          </ul>
          {v.suggestions.length > SUGGESTION_CHIPS ? (
            <Button
              size="sm"
              variant="ghost"
              className="self-start"
              onClick={() => setMore((x) => !x)}
            >
              {more ? "Show fewer" : `Show ${v.suggestions.length - SUGGESTION_CHIPS} more`}
            </Button>
          ) : null}
        </section>
      ) : null}

      {/* Also this visit */}
      {b.also.length ? (
        <Section id="impression-also" title="Also this visit">
          <ul className="divide-border flex flex-col divide-y">
            {b.also.map((row) => (
              <li key={row.dx.logicalId} className="flex flex-col gap-2 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body-m text-foreground font-medium">
                      {row.dx.display}
                    </span>
                    <span className="text-caption text-muted-foreground">{subLine(row, dx)}</span>
                  </div>
                  {row.dx.cosignPending ? (
                    <StatusWord tone="caution">Final · awaiting senior co-signature</StatusWord>
                  ) : null}
                  <StatusControl
                    row={row}
                    canFinal={props.canFinal}
                    editable={canWrite}
                    onDxStatus={props.on.onDxStatus}
                  />
                  {row.dx.onProblemList ? (
                    <span className="text-caption text-muted-foreground">On problem list</span>
                  ) : canWrite && props.on.onProblemList && !row.dx.typed ? (
                    <Button size="sm" variant="ghost" onClick={() => props.on.onProblemList!(row)}>
                      Add to problem list
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => props.onDetails(row.dx.logicalId)}
                  >
                    Details
                  </Button>
                  {canWrite && props.on.onRemove ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${row.dx.display}`}
                      title={removeTitle(row)}
                      onClick={() => startRemove(row)}
                    >
                      <XIcon aria-hidden />
                    </Button>
                  ) : null}
                </div>
                {assocFold(row)}
                {removing === row.dx.logicalId ? (
                  <RemoveForm
                    row={row}
                    onRemove={(r, why) => {
                      setRemoving(null);
                      props.on.onRemove?.(r, why);
                    }}
                    onCancel={() => setRemoving(null)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Add a diagnosis (§5.3), from the search or from "Show all" */}
      {canWrite && props.on.onDiagnosis ? (
        <Section id="impression-add-heading" title="Add a diagnosis">
          <AddAs value={slot} hasLeading={!!lead} onPick={setAddAs} />
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <DiagnosisPicker
                id="impression-add"
                label="Diagnosis"
                load={props.loaders.terms}
                search={props.loaders.searchTerms}
                disabled={props.busy === "dx"}
                typedRow
                already={(t) => !!duplicateOf(si.recorded, { termId: t.id })}
                alreadyTyped={(w) =>
                  si.recorded.some((d) => normaliseTyped(d.display) === normaliseTyped(w))
                }
                onPick={addPicked}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-haspopup="dialog"
              className="min-h-9 shrink-0 pointer-coarse:min-h-11"
              onClick={() => setBrowse(true)}
            >
              <LayoutGridIcon aria-hidden />
              Show all<span className="sr-only"> diagnoses</span>
            </Button>
          </div>
          <DiagnosisBrowseDialog
            open={browse}
            onOpenChange={setBrowse}
            load={props.loaders.terms}
            dx={dx}
            addAs={<AddAs value={slot} hasLeading={!!lead} onPick={setAddAs} />}
            already={(t) => !!duplicateOf(si.recorded, { termId: t.id })}
            disabled={props.busy === "dx"}
            onPick={(term) => addPicked({ term })}
          />
        </Section>
      ) : null}
    </div>
  );
}
