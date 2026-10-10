"use client";

import type { SiView } from "../si-model";
import type { DxData } from "../use-catalogue";
import type { ImpressionView, NamedSuggestion } from "./model";
import type { RelateChoice, RelateRequest } from "./relations-ui";
import type { DxPick } from "@/components/emr/desk/pickers";
import type { DxTerm } from "@/components/emr/desk/search";
import type { DxOptions } from "@/components/emr/desk/sections";
import type { History } from "@/lib/clerking/answers";
import type { Association } from "@/lib/clerking/impression/associations";
import type { BoardRow, ImpressionDraft, Likelihood } from "@/lib/clerking/impression/board";
import type { Column } from "@/lib/clerking/impression/evidence";
import type { Finding, FindingRef } from "@/lib/clerking/impression/facts";
import type {
  Card,
  DragSource,
  DropContext,
  DropTarget,
  Edge,
  Known,
} from "@/lib/clerking/impression/relations";
import type { DueLabel } from "@/lib/clerking/impression/relations-catalogue";
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
import { associationsOf } from "@/lib/clerking/impression/associations";
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
import {
  descendants,
  dropOutcome,
  isFlagged,
  knownWords,
  places,
  proposeRelations,
  refusal,
  relWord,
  withFlagOn,
} from "@/lib/clerking/impression/relations";
import { precipitantName } from "@/lib/clerking/impression/relations-catalogue";
import { SUGGESTION_CHIPS } from "@/lib/clerking/impression/suggest";
import { cn } from "@/lib/utils";
import { FindingText } from "../summary/summary-step";
import {
  AddFindingsHere,
  AssociatedContainer,
  AssociationCandidates,
  CollapseButton,
  Supports,
} from "./associations";
import { dropKey, sameTarget, useBoardDrag } from "./board-drag";
import { DiagnosisBrowseDialog } from "./browse-dialog";
import { ReasonField, subLine } from "./details";
import { EvidenceMatrix } from "./matrix";
import {
  BackgroundRow,
  DemoteDialog,
  Grip,
  LinkButton,
  RelateDialog,
  RelationLine,
} from "./relations-ui";

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

/** A relation write's outcome, when the handler reports one (the desk's chart actions do). */
export type RelationResult = void | Promise<unknown>;

export interface ImpressionHandlers {
  onDiagnosis?: (pick: DxPick, opts: DxOptions) => void;
  /** `retireLinks`: the old leading goes to the differential and its links are retired (Gate B). */
  onLeading?: (row: BoardRow, opts?: { retireLinks?: boolean }) => void;
  onToDifferential?: (row: BoardRow, opts?: { retireLinks?: boolean }) => void;
  /** Relations (dx-relations Phase 3, migration 0096). */
  onRelate?: (c: RelateChoice & { origin?: "backfill_confirmed" }) => RelationResult;
  onUnlink?: (e: Edge, reason: "unlinked" | "undone") => RelationResult;
  onMoveRelation?: (e: Edge, position: number) => RelationResult;
  onRelabel?: (e: Edge, label: DueLabel, qualifiers: string[]) => RelationResult;
  onActiveThisVisit?: (k: Known, rank: "primary" | "secondary") => RelationResult;
  /** "Add a linked diagnosis": on the visit (if not already) and linked, in one write. */
  onAddLinked?: (parent: BoardRow, a: Association) => RelationResult;
  onDxStatus?: (row: BoardRow, to: "working" | "final") => void;
  onRemove?: (row: BoardRow, reason: { code: RemoveCode; text?: string }) => void;
  onAddToPlan?: (testId: string, row: BoardRow) => void;
  onProblemList?: (row: BoardRow) => void;
  /** Refine (D-REL-05): the same diagnosis, a narrower term; `decidedBy`: the deciding results'
   *  chart ids. Replace: ruled out with the reason, the other one recorded in its place. */
  onRefine?: (row: BoardRow, to: RefineTo, decidedBy: string[]) => RelationResult;
  onReplace?: (row: BoardRow, to: RefineTo, reason: string) => RelationResult;
}

/** A catalogue diagnosis (`dx.*`) or what the search picked. */
export type RefineTo = { dxId: string } | DxPick;

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
  /** Seams for refinement (Phase 4): a stage beside each diagnosis's name, menu items
   *  ("Refine or replace…") among each card's actions, and lines under each card (refined from,
   *  the deciding tests, a placeholder's offer, the risk-factor line). */
  cardSlots?: {
    stage?: (row: BoardRow) => ReactNode;
    menu?: (row: BoardRow) => ReactNode;
    below?: (row: BoardRow) => ReactNode;
  };
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
  // The whole leading card folds to its name (owner, 2026-10-09).
  const [leadOpen, setLeadOpen] = useState(true);
  // Which diagnosis the bucket ("Not yet explained") gives findings to: null is the leading.
  const [bucketTo, setBucketTo] = useState<string | null>(null);
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

  /* ─── Relations (dx-relations-design §2, §4; ADR 0220) ─────────── */
  const on = props.on;
  const edges = si.relations as Edge[];
  const pl = useMemo(() => places(b, edges, si.background), [b, edges, si.background]);
  const known = si.background;
  const knownDx = (k: Known) => (k.termId ? (dx?.termIds[k.termId] ?? null) : null);
  const nameOf = (id: string) =>
    pl.cardOf.get(id)?.row.dx.display ??
    b.differential.find((r) => r.dx.logicalId === id)?.dx.display ??
    known.find((k) => k.logicalId === id)?.display ??
    "it";
  const dropCtx: DropContext = { places: pl, board: b, edges, known, knownDx };
  const linked = [...pl.cardOf.values()].filter((c) => !!c.via);
  const canRelate = canWrite && !!on.onRelate;

  // The polite live region: every outcome and refusal, in words (§4.3).
  const [msg, setMsg] = useState<string | null>(null);
  const say = (words: string) => setMsg(words);
  /** Await a handler; a refusal from the server is said as a plain message. */
  const report = async (r: RelationResult, ok: string) => {
    const out = (await r) as { ok?: boolean; error?: string } | undefined;
    if (out && out.ok === false)
      say(
        (out.error ?? "").startsWith("Relation refused")
          ? out.error!
          : `Relation refused: ${out.error ?? "it was not saved"}`,
      );
    else say(ok);
  };

  // The last relation change, shown inline on its card with Undo while the note is a draft (§4.3).
  const [last, setLast] = useState<{
    cardId: string;
    text: string;
    /** Which relation it was, matched against the record as it now stands. */
    match: (e: Edge) => boolean;
    undo: (e: Edge | undefined) => void;
  } | null>(null);
  const findEdge =
    (c: Pick<Edge, "conditionId" | "relatedConditionId" | "relationType">) => (e: Edge) =>
      e.relationType === c.relationType &&
      ((e.conditionId === c.conditionId && e.relatedConditionId === c.relatedConditionId) ||
        (c.relationType === "associated_with" &&
          e.conditionId === c.relatedConditionId &&
          e.relatedConditionId === c.conditionId));
  /** The last change's relation in the record as it now stands (after the refresh). */
  const lastEdge = last ? edges.find(last.match) : undefined;
  const phrase = (e: Pick<Edge, "relationType" | "label" | "qualifiers">, other: string) =>
    `${relWord(e)} ${other}${
      e.qualifiers.length
        ? `; precipitated by ${e.qualifiers.map((q) => precipitantName(q).toLowerCase()).join(" and by ")}`
        : ""
    }`;

  const doRelate = (c: RelateChoice) => {
    setRelate(null);
    const words = `${nameOf(c.conditionId)} linked to ${nameOf(c.relatedConditionId)}, as ${relWord(c)}. Undo available.`;
    void report(on.onRelate?.(c), words);
    setLast({
      cardId: c.conditionId,
      text: `Linked as: ${phrase(c, nameOf(c.relatedConditionId))}`,
      match: findEdge(c),
      undo: (e) => e && void report(on.onUnlink?.(e, "undone"), "Link undone."),
    });
  };
  const doUnlink = (e: Edge) => {
    const lower = pl.cardOf.get(e.conditionId)?.via === e ? e.conditionId : e.relatedConditionId;
    const other = lower === e.conditionId ? e.relatedConditionId : e.conditionId;
    void report(
      on.onUnlink?.(e, "unlinked"),
      `${nameOf(lower)} unlinked from ${nameOf(other)}. Undo available.`,
    );
    setLast({
      cardId: lower,
      text: `Unlinked from ${nameOf(other)}`,
      match: () => false,
      undo: () =>
        void report(
          on.onRelate?.({
            conditionId: e.conditionId,
            relatedConditionId: e.relatedConditionId,
            relationType: e.relationType as "due_to" | "associated_with",
            label: e.label,
            qualifiers: e.qualifiers,
            catalogueRef: null,
          }),
          "Unlink undone.",
        ),
    });
  };
  const doRelabel = (e: Edge, label: DueLabel, qualifiers: string[]) => {
    setRelate(null);
    void report(
      on.onRelabel?.(e, label, qualifiers),
      `Link changed to ${relWord({ relationType: "due_to", label })}.`,
    );
    setLast({
      cardId: e.conditionId,
      text: `Linked as: ${phrase({ relationType: "due_to", label, qualifiers }, nameOf(e.relatedConditionId))}`,
      match: (x) => x.logicalId === e.logicalId,
      undo: (now) =>
        now && void report(on.onRelabel?.(now, e.label!, e.qualifiers), "Change undone."),
    });
  };
  /** Renumber a parent's linked list in the order given (the note follows it, D-REL-12). */
  const reorder = (order: Edge[]) => {
    order.forEach((e, n) => {
      if (e.position !== n + 1) void report(on.onMoveRelation?.(e, n + 1), "Moved.");
    });
  };
  const moveChild = (card: Card, by: -1 | 1) => {
    const parent = card.parentId ? pl.cardOf.get(card.parentId) : undefined;
    if (!parent || !card.via) return;
    const order = parent.children.map((k) => k.via!);
    const i = order.indexOf(card.via);
    const j = i + by;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    reorder(order);
  };

  const [relate, setRelate] = useState<RelateRequest | null>(null);
  /** Close the chooser; focus returns to the card it came from (§4.2). */
  const closeRelate = () => {
    const id = relate?.src.id;
    setRelate(null);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-grip="${id ? dropKey({ kind: "dx", id }) : ""}"]`)
        ?.focus(),
    );
  };
  const end = (id: string) => ({
    id,
    name: nameOf(id),
    dxId: pl.cardOf.get(id)?.row.dx.dxId ?? null,
  });
  const relateTargets = (srcId: string) => [
    ...[...pl.cardOf.values()]
      .filter((c) => c.row.dx.logicalId !== srcId)
      .map((c) => ({
        ...end(c.row.dx.logicalId),
        refused: refusal(dropCtx, srcId, c.row.dx.logicalId, nameOf),
      })),
    ...known.map((k) => ({
      id: k.logicalId,
      name: k.earlier ? `${k.display} (${k.earlier.words})` : k.display,
      dxId: knownDx(k),
      known: true,
      refused: refusal(dropCtx, srcId, k.logicalId, nameOf),
    })),
  ];
  const activate = (k: Known, rank: "primary" | "secondary") =>
    void report(on.onActiveThisVisit?.(k, rank), `${k.display} is active this visit.`);

  /* Drag and drop (§4.1): what a drop means, and the keyboard's targets. */
  const describe = (src: DragSource, t: DropTarget): string => {
    const o = dropOutcome(dropCtx, src, t);
    const tn = "id" in t ? nameOf(t.id) : "";
    switch (o.kind) {
      case "refuse":
        return o.message;
      case "none":
        return "Nothing to do here.";
      case "unlink":
        return `Drop to unlink ${nameOf(src.id)}: it becomes co-existing.`;
      case "reorder":
        return `Drop to move ${nameOf(src.id)} to this place.`;
      case "active":
        return `Drop to make ${o.known.display} active this visit.`;
      case "relate":
        return o.apply
          ? `Drop to link under ${tn}, as ${relWord(o.apply)}.`
          : `Drop to link to ${tn}: you choose how.`;
    }
  };
  const onDrop = (src: DragSource, t: DropTarget) => {
    const o = dropOutcome(dropCtx, src, t);
    if (o.kind === "refuse") return say(o.message);
    if (o.kind === "none") return say("Nothing changed.");
    if (o.kind === "unlink") return doUnlink(o.edge);
    if (o.kind === "reorder") {
      reorder(o.order);
      return say(`${nameOf(src.id)} moved.`);
    }
    if (o.kind === "active") return activate(o.known, o.rank);
    if (o.apply)
      return doRelate({
        conditionId: o.conditionId,
        relatedConditionId: o.relatedConditionId,
        relationType: o.apply.type,
        label: o.apply.label,
        qualifiers: [],
        catalogueRef: o.apply.ref,
      });
    const tk = known.find((k) => k.logicalId === o.relatedConditionId);
    setRelate({
      src: end(o.conditionId),
      tgt: tk
        ? { id: tk.logicalId, name: tk.display, dxId: knownDx(tk), known: true }
        : end(o.relatedConditionId),
    });
  };
  const dragTargets = (src: DragSource): DropTarget[] => {
    if (src.kind === "known")
      return [
        lead ? { kind: "dx", id: lead.dx.logicalId } : { kind: "leading" },
        { kind: "coexisting" },
      ];
    const cards = [...pl.cardOf.keys()].filter((id) => id !== src.id);
    return [
      ...cards.map((id) => ({ kind: "dx", id }) as DropTarget),
      ...(pl.cardOf.get(src.id)?.via ? [{ kind: "coexisting" } as DropTarget] : []),
      ...known
        .filter((k) => !k.earlier) // an earlier visit's diagnosis: "Relate to…" only
        .map((k) => ({ kind: "known", id: k.logicalId }) as DropTarget),
    ];
  };
  const helpId = useId();
  const drag = useBoardDrag({
    enabled: canRelate,
    helpId,
    targets: dragTargets,
    describe,
    onDrop,
    announce: say,
  });
  /** The words on a target while a card is over it ("Drop to link under Malaria"). */
  const overWords = (t: DropTarget) =>
    drag.src && sameTarget(drag.over, t) ? describe(drag.src, t) : null;
  const overLine = (t: DropTarget) => {
    const w = overWords(t);
    return w ? <span className="text-caption text-teal-text">{w}</span> : null;
  };
  const gripFor = (row: BoardRow) =>
    canRelate ? (
      <Grip {...drag.grip({ kind: "dx", id: row.dx.logicalId }, row.dx.display)} />
    ) : null;

  /* Demotion to the differential (Gate B): a confirm naming the links to be retired. */
  const [demote, setDemote] = useState<{ name: string; links: string[]; go: () => void } | null>(
    null,
  );
  const linksOf = (id: string) =>
    edges.filter(
      (e) =>
        (e.relationType === "due_to" || e.relationType === "associated_with") &&
        (e.conditionId === id || e.relatedConditionId === id),
    );
  const linkText = (e: Edge) =>
    `${nameOf(e.conditionId)}, ${relWord(e)} ${nameOf(e.relatedConditionId)}`;
  const toDifferential = (row: BoardRow) => {
    const ls = linksOf(row.dx.logicalId);
    if (!ls.length) return on.onToDifferential?.(row);
    setDemote({
      name: row.dx.display,
      links: ls.map(linkText),
      go: () => on.onToDifferential?.(row, { retireLinks: true }),
    });
  };
  /** A differential promoted: the leading goes to the differential (links confirmed); a
   *  co-existing one swaps with the leading and both stay working. */
  const makeLeading = (row: BoardRow) => {
    const ls = lead && row.slot === "differential" ? linksOf(lead.dx.logicalId) : [];
    if (!ls.length || !lead) return on.onLeading?.(row);
    setDemote({
      name: lead.dx.display,
      links: ls.map(linkText),
      go: () => on.onLeading?.(row, { retireLinks: true }),
    });
  };

  /* "Cause removed: review" (DXV-13): acknowledged in the draft before signing. */
  const reviewed = new Set(si.impression.reviewed ?? []);
  const causeMarker = (row: BoardRow) =>
    si.causeRemoved
      .filter((c) => c.conditionId === row.dx.logicalId && !reviewed.has(c.logicalId))
      .map((c) => (
        <span key={c.logicalId} className="flex flex-wrap items-center gap-2">
          <StatusWord tone="caution">Cause removed: review</StatusWord>
          <span className="text-caption text-muted-foreground">
            {`Its cause, ${c.causeDisplay}, was ${c.reason === "refuted" ? "ruled out" : "entered in error"}; the link was retired.`}
          </span>
          {editable ? (
            <LinkButton
              onClick={() =>
                props.onImpression((d) => ({
                  ...d,
                  reviewed: [...new Set([...(d.reviewed ?? []), c.logicalId])],
                }))
              }
            >
              Reviewed
            </LinkButton>
          ) : null}
        </span>
      ));

  /** A card's relations in words (clauses shown on it, §2.3), the inline last change, the marker. */
  const relationBlock = (card: Card) => {
    const row = card.row;
    const lines = [
      ...card.clauses.map((c) => (
        <RelationLine
          key={c.edge.id}
          text={
            c.fromCondition
              ? `${phrase(
                  c.edge,
                  c.known
                    ? knownWords(
                        known.find((k) => k.logicalId === c.otherId) ?? { display: c.other },
                        (x) => x,
                      )
                    : c.other,
                ).replace(/^./, (x) => x.toUpperCase())}`
              : `${c.other}, ${relWord(c.edge)} this`
          }
        >
          {canRelate && on.onRelabel && c.fromCondition && c.edge.relationType === "due_to" ? (
            <LinkButton
              onClick={() =>
                setRelate({
                  src: end(row.dx.logicalId),
                  tgt: { id: c.otherId, name: c.other, dxId: null, known: c.known },
                  edit: c.edge,
                })
              }
            >
              Change
            </LinkButton>
          ) : null}
          {canRelate && on.onUnlink ? (
            <LinkButton
              aria-label={`Unlink ${row.dx.display} and ${c.other}`}
              onClick={() => doUnlink(c.edge)}
            >
              Unlink
            </LinkButton>
          ) : null}
        </RelationLine>
      )),
      ...(card.episodeOf
        ? [
            <RelationLine
              key="episode"
              text={`Known condition, on record since ${card.episodeOf.since.slice(0, 4)}: active this visit`}
            />,
          ]
        : []),
      ...(last?.cardId === row.dx.logicalId
        ? [
            <RelationLine key="last" text={last.text}>
              {canRelate && on.onRelabel && lastEdge?.relationType === "due_to" ? (
                <LinkButton
                  onClick={() => {
                    const e = lastEdge!;
                    setRelate({
                      src: end(e.conditionId),
                      tgt: {
                        ...end(e.relatedConditionId),
                        known: !pl.cardOf.has(e.relatedConditionId),
                      },
                      edit: e,
                    });
                  }}
                >
                  Change
                </LinkButton>
              ) : null}
              {editable ? (
                <LinkButton
                  onClick={() => {
                    last.undo(lastEdge);
                    setLast(null);
                  }}
                >
                  Undo
                </LinkButton>
              ) : null}
            </RelationLine>,
          ]
        : []),
      ...causeMarker(row),
    ];
    return lines.length ? <div className="flex flex-col gap-1">{lines}</div> : null;
  };

  /** Relate to… (keyboard and touch, §4.3), the Phase 4 menu items, for every card. */
  const cardMenu = (row: BoardRow) => (
    <>
      {canRelate ? (
        <Button
          size="sm"
          variant="ghost"
          aria-haspopup="dialog"
          onClick={() => setRelate({ src: end(row.dx.logicalId) })}
        >
          Relate to…
        </Button>
      ) : null}
      {props.cardSlots?.menu?.(row)}
    </>
  );

  /* "Add a linked diagnosis" (§2.4): complications, effects it causes and what goes with it. */
  const assocOf = (row: BoardRow): Association[] =>
    dx
      ? associationsOf(
          { dxId: row.dx.dxId, logicalId: row.dx.logicalId },
          { x: si.x, dx, live: si.live, viewer: si.viewer, board: b, relations: edges },
        )
      : [];
  const leadAssoc = lead ? assocOf(lead) : [];
  const supportsOf = (row: BoardRow) =>
    Object.entries(si.impression.evidence[row.dx.logicalId] ?? {})
      .filter(([, m]) => m.w === "for")
      .map(([ref]) => v.findings.get(ref as FindingRef))
      .filter((f): f is Finding => !!f);
  /** A parent's linked diagnoses, depth first, as the container lists them. */
  const chosenOf = (parent: Card) =>
    descendants(parent).map((card) => {
      const sibs = card.parentId ? (pl.cardOf.get(card.parentId)?.children ?? []) : [];
      const at = sibs.indexOf(card);
      return {
        row: card.row,
        words: `${relWord(card.via!)} ${nameOf(card.parentId!)}`,
        supports: supportsOf(card.row),
        flagged: isFlagged(si.impression, card.row),
        depth: card.depth - parent.depth,
        first: at <= 0,
        last: at === sibs.length - 1,
      };
    });
  // "Not yet explained" gives findings to any diagnosis on the board (owner, 2026-10-10). A
  // differential explains nothing, so its findings stay in the list: one can support several.
  const bucketRows = lead
    ? [lead, ...linked.map((c) => c.row), ...pl.coexisting.map((c) => c.row), ...b.differential]
    : [];
  const target = bucketRows.find((r) => r !== lead && r.dx.logicalId === bucketTo) ?? null;
  const targetIsDifferential = !!target && b.differential.includes(target);
  const isFor = (row: BoardRow, ref: FindingRef) =>
    si.impression.evidence[row.dx.logicalId]?.[ref]?.w === "for";
  const toggleBucket = (row: BoardRow) =>
    setBucketTo(target?.dx.logicalId === row.dx.logicalId ? null : row.dx.logicalId);
  const testName = (id: string) => dx?.tests[id] ?? id.replace(/^test\./, "").replace(/_/g, " ");

  /* D-REL-17: the earlier format's links (meta.with), offered once as relations to confirm. */
  const proposals = useMemo(
    () =>
      si.impression.backfill
        ? []
        : proposeRelations(
            si.impression.meta,
            si.recorded.map((d) => ({
              logicalId: d.logicalId,
              dxId: d.dxId,
              verification: d.verification,
            })),
            new Set(edges.map((e) => `${e.relationType}|${e.conditionId}|${e.relatedConditionId}`)),
          ),
    [si.impression, si.recorded, edges],
  );
  const proposalText = (p: (typeof proposals)[number]) =>
    p.kind === "ask"
      ? `${dx?.names[p.childDxId]?.display ?? p.childDxId} with ${nameOf(p.parentLogicalId)}: choose how with "Relate to…"`
      : `${nameOf(p.conditionId)}, ${relWord({ relationType: p.kind, label: p.label })} ${nameOf(p.relatedConditionId)}`;
  const backfillDone = () => props.onImpression((d) => ({ ...d, backfill: "done" }));
  const confirmBackfill = () => {
    for (const p of proposals)
      if (p.kind !== "ask")
        void report(
          on.onRelate?.({
            conditionId: p.conditionId,
            relatedConditionId: p.relatedConditionId,
            relationType: p.kind,
            label: p.label,
            qualifiers: [],
            catalogueRef: p.catalogueRef,
            origin: "backfill_confirmed",
          }),
          "Links confirmed.",
        );
    backfillDone();
  };

  /** Under a linked card: its own link's controls, then its relations. */
  const linkedBelow = (card: Card) => {
    const via = card.via!;
    return (
      <div className="flex flex-col gap-1">
        {canRelate ? (
          <span className="flex flex-wrap gap-x-3">
            {on.onRelabel && via.relationType === "due_to" ? (
              <LinkButton
                onClick={() =>
                  setRelate({
                    src: end(via.conditionId),
                    tgt: end(via.relatedConditionId),
                    edit: via,
                  })
                }
              >
                {`Change: ${relWord(via)}`}
              </LinkButton>
            ) : null}
            {on.onUnlink ? (
              <LinkButton
                aria-label={`Unlink ${card.row.dx.display}`}
                onClick={() => doUnlink(via)}
              >
                Unlink
              </LinkButton>
            ) : null}
          </span>
        ) : null}
        {relationBlock(card)}
        {props.cardSlots?.below?.(card.row)}
        {overLine({ kind: "dx", id: card.row.dx.logicalId })}
      </div>
    );
  };
  /** Status, Details, Remove and Relate to… for a linked card. */
  const linkedActions = (row: BoardRow) => (
    <>
      <StatusControl
        row={row}
        canFinal={props.canFinal}
        editable={canWrite}
        onDxStatus={props.on.onDxStatus}
      />
      <Button size="sm" variant="ghost" onClick={() => props.onDetails(row.dx.logicalId)}>
        Details
      </Button>
      {canWrite && props.on.onRemove ? (
        <Button size="sm" variant="ghost" title={removeTitle(row)} onClick={() => startRemove(row)}>
          Remove
        </Button>
      ) : null}
      {cardMenu(row)}
    </>
  );

  /** Make a known condition active this visit by its button: co-existing, or leading if none. */
  const activeByButton = (k: Known) => activate(k, lead ? "secondary" : "primary");

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

      <p aria-live="polite" role="status" className="text-body-s text-foreground empty:hidden">
        {msg}
      </p>
      <p id={helpId} className="sr-only">
        Press Space to lift a diagnosis, the arrow keys to choose where it goes, Enter to drop it
        and Escape to cancel. Or use its Relate to… button.
      </p>
      {proposals.length && canRelate ? (
        <section
          aria-labelledby="impression-backfill"
          className="border-border flex flex-col gap-2 rounded-md border border-dashed px-4 py-3"
        >
          <h3 id="impression-backfill" className="text-body-s text-foreground">
            Links from this draft&rsquo;s earlier format
          </h3>
          <ul className="text-body-s text-foreground flex list-disc flex-col gap-0.5 pl-5">
            {proposals.map((p, n) => (
              <li key={n}>{proposalText(p)}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={confirmBackfill}>
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={backfillDone}>
              Dismiss
            </Button>
          </div>
        </section>
      ) : null}

      {/* Leading (§4 Impression, 2) */}
      <section
        aria-labelledby="impression-leading"
        {...drag.target(lead ? { kind: "dx", id: lead.dx.logicalId } : { kind: "leading" })}
        className="border-border rounded-lg border px-4 py-4 data-[over=true]:ring-2 data-[over=true]:ring-teal-600"
      >
        {lead ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1">
                <CollapseButton
                  open={leadOpen}
                  name={lead.dx.display}
                  onToggle={() => setLeadOpen(!leadOpen)}
                />
                <span
                  id="impression-leading"
                  className="text-caption inline-flex items-center gap-1.5 font-medium tracking-[0.06em] text-teal-700 uppercase dark:text-teal-300"
                >
                  <StarIcon aria-hidden className="size-3.5 fill-current" />
                  Leading · primary for this visit
                </span>
              </span>
              <StatusControl
                row={lead}
                canFinal={props.canFinal}
                editable={canWrite}
                onDxStatus={props.on.onDxStatus}
              />
            </div>
            <div data-card="" className="flex items-start gap-2 data-[dragging=true]:opacity-60">
              {gripFor(lead)}
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <h3 className="text-heading-s text-foreground">{lead.dx.display}</h3>
                  {props.cardSlots?.stage?.(lead)}
                </span>
                <span className="text-caption text-muted-foreground">{subLine(lead, dx)}</span>
                {leadOpen && pl.leading ? relationBlock(pl.leading) : null}
                {leadOpen ? props.cardSlots?.below?.(lead) : null}
                {overLine({ kind: "dx", id: lead.dx.logicalId })}
              </div>
            </div>
            {lead.dx.cosignPending ? (
              <StatusWord tone="caution">Final · awaiting senior co-signature</StatusWord>
            ) : null}
            {lead.awaitingSignoff ? (
              <p className="text-caption text-muted-foreground">Reasoning aids awaiting sign-off</p>
            ) : null}
            {leadOpen ? (
              <>
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
                    {pl.leading ? (
                      <AssociatedContainer
                        parent={lead.dx.display}
                        chosen={chosenOf(pl.leading)}
                        candidates={leadAssoc.filter((a) => !a.linked)}
                        canWrite={canWrite}
                        finding={(f) => <FindingText item={f} news2={si.x.news2Latest} />}
                        active={target?.dx.logicalId ?? null}
                        onActivate={(row) => setBucketTo(row?.dx.logicalId ?? null)}
                        onUnsupport={(row, f) =>
                          props.onImpression((d) =>
                            withMark(d, row.dx.logicalId, f.ref, "blank", stamp()),
                          )
                        }
                        onMove={(row, by) => moveChild(pl.cardOf.get(row.dx.logicalId)!, by)}
                        onFlag={(row) => props.onImpression((d) => withFlagOn(d, row))}
                        grip={gripFor}
                        stage={props.cardSlots?.stage}
                        card={(row) => ({
                          ...drag.target({ kind: "dx", id: row.dx.logicalId }),
                        })}
                        below={(row) => linkedBelow(pl.cardOf.get(row.dx.logicalId)!)}
                        actions={linkedActions}
                      />
                    ) : null}
                    {linked.map(({ row }) =>
                      removing === row.dx.logicalId ? (
                        <RemoveForm
                          key={row.dx.logicalId}
                          row={row}
                          onRemove={(r, why) => {
                            setRemoving(null);
                            props.on.onRemove?.(r, why);
                          }}
                          onCancel={() => setRemoving(null)}
                        />
                      ) : null,
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5" aria-live="polite">
                    <span className="text-caption text-muted-foreground">
                      Not yet explained by any diagnosis
                    </span>
                    {bucketRows.length > 1 && canWrite ? (
                      <Seg
                        label="Add findings to"
                        options={bucketRows.map((r) => ({
                          id: r.dx.logicalId,
                          label: b.differential.includes(r)
                            ? `${r.dx.display} (differential)`
                            : r.dx.display,
                        }))}
                        value={target?.dx.logicalId ?? lead.dx.logicalId}
                        onPick={(id) => setBucketTo(id === lead.dx.logicalId ? null : id)}
                      />
                    ) : null}
                    {v.unexplained.length ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {v.unexplained.map((f) => (
                          <li key={f.ref}>
                            <button
                              type="button"
                              disabled={!canWrite}
                              // A differential's finding stays here: tapping it again takes it back.
                              aria-pressed={
                                targetIsDifferential ? isFor(target!, f.ref) : undefined
                              }
                              onClick={() => {
                                const off = targetIsDifferential && isFor(target!, f.ref);
                                props.onImpression((d) =>
                                  v
                                    .sameAs(f.ref)
                                    .reduce(
                                      (acc, ref) =>
                                        target
                                          ? withMark(
                                              acc,
                                              target.dx.logicalId,
                                              ref,
                                              off ? "blank" : "for",
                                              stamp(),
                                            )
                                          : explainWithLeading(acc, b, ref, stamp()),
                                      d,
                                    ),
                                );
                              }}
                              aria-label={`${f.text}: link it to ${(target ?? lead).dx.display}`}
                              className={cn(
                                "text-caption border-border hover:bg-muted focus-visible:shadow-focus inline-flex min-h-7 items-center gap-1 rounded-sm border border-dashed px-2 outline-none pointer-coarse:min-h-11",
                                "aria-pressed:bg-iris-tint aria-pressed:border-iris-edge aria-pressed:border-solid",
                                PRESS,
                              )}
                            >
                              {targetIsDifferential && isFor(target!, f.ref) ? (
                                <span className="font-mono">+</span>
                              ) : null}
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
                    <Button size="sm" variant="secondary" onClick={() => toDifferential(lead)}>
                      Move to differential
                    </Button>
                  ) : null}
                  {cardMenu(lead)}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => props.onDetails(lead.dx.logicalId)}
                  >
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
              </>
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
            {overLine({ kind: "leading" })}
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

      {/* Add a linked diagnosis (§2.4): its own section, the whole width */}
      {lead ? (
        <AssociationCandidates
          parent={lead.dx.display}
          items={leadAssoc.filter((a) => !a.linked)}
          findingText={(ref) => v.findings.get(ref as FindingRef)?.text ?? null}
          testName={testName}
          canWrite={canWrite && !!on.onAddLinked}
          onAdd={(a) =>
            void report(
              on.onAddLinked?.(lead, a),
              `${a.display} added, linked to ${lead.dx.display}.`,
            )
          }
        />
      ) : null}

      {/* Also this visit: co-existing (R4) — the header takes an unlinked card (§4.1) */}
      {pl.coexisting.length || linked.length || drag.src?.kind === "known" ? (
        <section aria-labelledby="impression-also" className="flex flex-col gap-3">
          <div
            {...drag.target({ kind: "coexisting" })}
            className="flex flex-wrap items-center gap-3 rounded-md data-[over=true]:ring-2 data-[over=true]:ring-teal-600"
          >
            <h3 id="impression-also" className="text-label text-foreground">
              Also this visit: co-existing
            </h3>
            {overLine({ kind: "coexisting" })}
          </div>
          {pl.coexisting.length ? (
            <ul className="divide-border flex flex-col divide-y">
              {pl.coexisting.map((card) => {
                const row = card.row;
                return (
                  <li
                    key={row.dx.logicalId}
                    data-card=""
                    {...drag.target({ kind: "dx", id: row.dx.logicalId })}
                    className={cn(
                      "flex flex-col gap-2 rounded-md py-2.5 data-[dragging=true]:opacity-60 data-[over=true]:ring-2 data-[over=true]:ring-teal-600",
                      target?.dx.logicalId === row.dx.logicalId &&
                        "bg-iris-tint ring-iris-edge px-2 ring-1",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      {gripFor(row)}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-body-m text-foreground font-medium">
                            {row.dx.display}
                          </span>
                          {props.cardSlots?.stage?.(row)}
                        </span>
                        <span className="text-caption text-muted-foreground">
                          {subLine(row, dx)}
                        </span>
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
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => props.on.onProblemList!(row)}
                        >
                          Add to problem list
                        </Button>
                      ) : null}
                      {canWrite && on.onLeading ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Swap with the leading diagnosis: both stay working"
                          onClick={() => makeLeading(row)}
                        >
                          Make leading
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => props.onDetails(row.dx.logicalId)}
                      >
                        Details
                      </Button>
                      {cardMenu(row)}
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
                    {relationBlock(card)}
                    {props.cardSlots?.below?.(row)}
                    {lead ? (
                      <>
                        <Supports
                          row={row}
                          supports={supportsOf(row)}
                          canWrite={canWrite}
                          finding={(f) => <FindingText item={f} news2={si.x.news2Latest} />}
                          onUnsupport={(r, f) =>
                            props.onImpression((d) =>
                              withMark(d, r.dx.logicalId, f.ref, "blank", stamp()),
                            )
                          }
                        />
                        {canWrite ? (
                          <AddFindingsHere
                            on={target?.dx.logicalId === row.dx.logicalId}
                            onToggle={() => toggleBucket(row)}
                          />
                        ) : null}
                      </>
                    ) : null}
                    {overLine({ kind: "dx", id: row.dx.logicalId })}
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
                    {card.children.length ? (
                      <AssociatedContainer
                        parent={row.dx.display}
                        chosen={chosenOf(card)}
                        candidates={[]}
                        canWrite={canWrite}
                        finding={(f) => <FindingText item={f} news2={si.x.news2Latest} />}
                        active={target?.dx.logicalId ?? null}
                        onActivate={(r) => setBucketTo(r?.dx.logicalId ?? null)}
                        onUnsupport={(r, f) =>
                          props.onImpression((d) =>
                            withMark(d, r.dx.logicalId, f.ref, "blank", stamp()),
                          )
                        }
                        onMove={(r, by) => moveChild(pl.cardOf.get(r.dx.logicalId)!, by)}
                        onFlag={(r) => props.onImpression((d) => withFlagOn(d, r))}
                        grip={gripFor}
                        stage={props.cardSlots?.stage}
                        card={(r) => ({ ...drag.target({ kind: "dx", id: r.dx.logicalId }) })}
                        below={(r) => linkedBelow(pl.cardOf.get(r.dx.logicalId)!)}
                        actions={linkedActions}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-caption text-muted-foreground">
              Drop a linked diagnosis here to unlink it.
            </p>
          )}
        </section>
      ) : null}

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
                    {...drag.target({ kind: "dx", id: row.dx.logicalId })}
                    className={cn(
                      "flex flex-col gap-2 rounded-md py-3 data-[over=true]:ring-2 data-[over=true]:ring-teal-600",
                      target?.dx.logicalId === row.dx.logicalId &&
                        "bg-iris-tint ring-iris-edge ring-1",
                    )}
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
                        {overLine({ kind: "dx", id: row.dx.logicalId })}
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
                        <Button size="sm" variant="ghost" onClick={() => makeLeading(row)}>
                          Make leading
                        </Button>
                      ) : null}
                      {canWrite && lead ? (
                        <AddFindingsHere
                          on={target?.dx.logicalId === row.dx.logicalId}
                          onToggle={() => toggleBucket(row)}
                        />
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

      {/* Background: known conditions (R5): read-only chips, drop targets, "Active this visit" */}
      <BackgroundRow
        items={pl.background.filter((x) => !x.item.earlier)}
        canWrite={canRelate}
        drag={{
          grip: (k) => drag.grip({ kind: "known", id: k.logicalId }, k.display),
          target: (k) => drag.target({ kind: "known", id: k.logicalId }),
        }}
        overWords={(k) => overWords({ kind: "known", id: k.logicalId })}
        onActive={on.onActiveThisVisit ? activeByButton : null}
      />

      <RelateDialog
        req={relate}
        targets={relate && !relate.tgt ? relateTargets(relate.src.id) : []}
        onClose={closeRelate}
        onLink={(c) => {
          if (relate?.edit) doRelabel(relate.edit, c.label!, c.qualifiers);
          else doRelate(c);
          closeRelate();
        }}
      />
      <DemoteDialog
        ask={demote}
        onCancel={() => setDemote(null)}
        onConfirm={() => {
          demote?.go();
          setDemote(null);
        }}
      />

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
