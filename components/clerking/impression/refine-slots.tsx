"use client";

import type { SiView } from "../si-model";
import type { DxData } from "../use-catalogue";
import type { ImpressionHandlers, ImpressionStepProps, RefineTo } from "./impression-step";
import type { DxTerm } from "@/components/emr/desk/search";
import type { BoardRow, ImpressionDraft } from "@/lib/clerking/impression/board";
import type { Edge } from "@/lib/clerking/impression/relations";
import type { ReactNode } from "react";
import { useId, useMemo, useState } from "react";

import { DiagnosisPicker } from "@/components/emr/desk/pickers";
import { Button } from "@/components/ui/button";
import { isPlaceholder, placeholderOffers } from "@/lib/clerking/impression/refine";
import { subtypesOf } from "@/lib/clerking/impression/relations-catalogue";
import { riskRef, riskWords } from "@/lib/clerking/impression/risk-line";
import { refinementOf } from "../si-model";
import { ImpressionStep } from "./impression-step";
import { DecidingLine, decidingTests, RefineDialog, StageLine } from "./refinement";
import { LinkButton } from "./relations-ui";

/**
 * Step 09's refinement (dx-relations Phase 4, ADR 0220), through the step's card seams: the stage
 * beside each name (D-REL-14), "Refine or replace…" among the actions (D-REL-05, REF-01: the
 * clinician picks, the desk never does), and under each card what it was refined from, the tests
 * that will decide its type, a placeholder's one-action offer (D-REL-15) and the risk-factor line
 * with "Include in note" (D-REL-04). Every write goes through the desk's handlers.
 */
export function useRefinement(i: {
  si: SiView;
  dx: DxData | null;
  orders: readonly { id: string; testId?: string | null; open: boolean; statusText: string }[];
  gestationWeeks: number | null;
  on: ImpressionHandlers;
  canWrite: boolean;
  onImpression: (fn: (d: ImpressionDraft) => ImpressionDraft) => void;
  loaders: { terms: () => Promise<DxTerm[]>; searchTerms?: (q: string) => Promise<DxTerm[]> };
}): {
  cardSlots: Record<"stage" | "menu" | "below", (row: BoardRow) => ReactNode>;
  dialog: ReactNode;
} {
  const { si, dx, on, canWrite } = i;
  const r = useMemo(() => refinementOf(si, i.gestationWeeks, dx), [si, i.gestationWeeks, dx]);
  const [open, setOpen] = useState<BoardRow | null>(null);
  const pickId = useId();
  const name = (id: string) => dx?.names[id]?.display ?? id;
  const meta = (id: string) => si.impression.meta[id] ?? {};
  const setMeta = (id: string, m: Partial<ImpressionDraft["meta"][string]>) =>
    i.onImpression((d) => ({ ...d, meta: { ...d.meta, [id]: { ...d.meta[id], ...m } } }));

  // The deciding tests at this visit: the order's test, back from its uuid to `test.*`.
  const testOf = useMemo(
    () => new Map(Object.entries(dx?.testIds ?? {}).map(([id, uuid]) => [uuid, id])),
    [dx],
  );
  const orders = i.orders.map((o) => ({
    ...o,
    testId: o.testId ? (testOf.get(o.testId) ?? null) : null,
  }));
  const testName = (id: string) => dx?.tests[id] ?? id.replace(/^test\./, "").replace(/_/g, " ");

  /** A valvular cause suppresses the LVEF classes (DXV-07): no subtypes are offered. */
  const parentOf = (row: BoardRow) => {
    const p = row.dx.dxId ? subtypesOf(row.dx.dxId) : null;
    const w = p?.suppressed_when as { related_by?: string; to_any?: string[] } | undefined;
    const hit =
      w &&
      si.relations.some(
        (e) =>
          e.relationType === w.related_by &&
          e.conditionId === row.dx.logicalId &&
          w.to_any?.includes(r.pl.cardOf.get(e.relatedConditionId)?.row.dx.dxId ?? ""),
      );
    return p && hit ? { ...p, subtypes: [] } : p;
  };
  const deciding = (row: BoardRow) => {
    const p = parentOf(row);
    return p?.subtypes.length ? decidingTests(p, { testName, orders }) : [];
  };
  /** The resulted orders of the deciding tests (REF-01: shown, never judged), as chart ids. */
  const decidedBy = (row: BoardRow) => {
    const ids = new Set(deciding(row).map((t) => t.id));
    return orders
      .filter(
        (o) =>
          o.testId && ids.has(o.testId) && !o.open && !/^(cancelled|rejected)/i.test(o.statusText),
      )
      .map((o) => `encounter_orders:${o.id}`);
  };
  const placeholder = (row: BoardRow) =>
    isPlaceholder(row.dx.dxId) || dx?.cat.profile(row.dx.dxId ?? "")?.kind === "symptom_level";
  const refinable = (row: BoardRow) => {
    const p = parentOf(row);
    return !!p?.subtypes.length || !!p?.alternatives_if_ruled_out?.length || placeholder(row);
  };

  const offers = placeholderOffers(r.pl, name, (id) => !!meta(id).keep);
  const refine = (row: BoardRow, to: RefineTo) => {
    setOpen(null);
    void on.onRefine?.(row, to, decidedBy(row));
  };

  /** Include the risk-factor line: a `risk_factor_for` per condition named; off retires them. */
  const includeRisk = (row: BoardRow, include: boolean) => {
    const id = row.dx.logicalId;
    const line = r.risk.get(id);
    setMeta(id, { risk: include });
    const stored = si.relations.filter(
      (e) => e.relationType === "risk_factor_for" && e.relatedConditionId === id,
    ) as Edge[];
    if (!include) return stored.forEach((e) => void on.onUnlink?.(e, "unlinked"));
    for (const f of line?.factors ?? [])
      if (f.logicalId && !stored.some((e) => e.conditionId === f.logicalId))
        void on.onRelate?.({
          conditionId: f.logicalId,
          relatedConditionId: id,
          relationType: "risk_factor_for",
          label: null,
          qualifiers: [],
          catalogueRef: riskRef(f.dxId, row.dx.dxId ?? ""),
        });
  };

  const cardSlots = {
    stage: (row: BoardRow) => <StageLine stage={r.stages.get(row.dx.logicalId) ?? null} />,
    menu: (row: BoardRow) =>
      canWrite && on.onRefine && refinable(row) ? (
        <Button size="sm" variant="ghost" aria-haspopup="dialog" onClick={() => setOpen(row)}>
          Refine or replace…
        </Button>
      ) : null,
    below: (row: BoardRow) => {
      const id = row.dx.logicalId;
      const from = row.dx.refinedFrom;
      const offer = offers.find((o) => o.row.dx.logicalId === id);
      const line = r.risk.get(id);
      const tests = deciding(row); // NSTE-ACS, refined from ACS, still awaits troponin
      if (!from && !tests.length && !offer && !line) return null;
      return (
        <div className="flex flex-col gap-1">
          {from ? (
            <p className="text-caption text-muted-foreground">
              {`Refined from ${from.display}${from.decided.length ? ` after ${from.decided.join(" and ")}` : ""}`}
            </p>
          ) : null}
          <DecidingLine tests={tests} />
          {offer ? (
            <p className="text-caption text-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                {offer.explainedBy
                  ? `${offer.into.display} is also on this visit and explains it.`
                  : "A cause is linked, so the cause need not stay unknown."}
              </span>
              {canWrite && (offer.explainedBy ? on.onRemove : on.onRefine) ? (
                <>
                  <LinkButton
                    onClick={() =>
                      offer.explainedBy
                        ? on.onRemove?.(row, {
                            code: "duplicate",
                            text: `Refined into ${offer.into.display}, already on this visit`,
                          })
                        : refine(row, { dxId: offer.into.dxId })
                    }
                  >
                    {`Refine '${row.dx.display}' into ${offer.into.display}`}
                  </LinkButton>
                  <LinkButton onClick={() => setMeta(id, { keep: true })}>Keep it</LinkButton>
                </>
              ) : null}
            </p>
          ) : null}
          {line ? (
            <RiskLineRow
              text={riskWords(line)}
              included={!!meta(id).risk}
              canWrite={canWrite && !!on.onRelate}
              onToggle={(v) => includeRisk(row, v)}
            />
          ) : null}
        </div>
      );
    },
  };

  const parent = open ? parentOf(open) : null;
  const dialog = (
    <RefineDialog
      open={!!open}
      onOpenChange={(o) => !o && setOpen(null)}
      display={open?.dx.display ?? ""}
      parent={parent}
      names={dx?.names ?? {}}
      deciding={open ? deciding(open) : []}
      onRefine={(dxId) => open && refine(open, { dxId })}
      onReplace={(dxId, reason) => {
        if (!open) return;
        setOpen(null);
        void on.onReplace?.(open, { dxId }, reason);
      }}
      search={
        open && placeholder(open) ? (
          <DiagnosisPicker
            id={pickId}
            label="Search for the diagnosis"
            load={i.loaders.terms}
            search={i.loaders.searchTerms}
            onPick={(pick) => refine(open, pick)}
          />
        ) : undefined
      }
    />
  );
  return { cardSlots, dialog };
}

/** Step 09 with refinement in its card seams. */
export function RefinedImpressionStep({
  orders,
  gestationWeeks,
  ...props
}: ImpressionStepProps & {
  orders: Parameters<typeof useRefinement>[0]["orders"];
  gestationWeeks: number | null;
}) {
  const { cardSlots, dialog } = useRefinement({
    si: props.si,
    dx: props.dx,
    orders,
    gestationWeeks,
    on: props.on,
    canWrite: props.editable && props.act,
    onImpression: props.onImpression,
    loaders: props.loaders,
  });
  return (
    <>
      <ImpressionStep {...props} cardSlots={cardSlots} />
      {dialog}
    </>
  );
}

/** "Risk factors on record: …" with "Include in note" (D-REL-04). */
function RiskLineRow({
  text,
  included,
  canWrite,
  onToggle,
}: {
  text: string;
  included: boolean;
  canWrite: boolean;
  onToggle: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
      <span className="text-caption text-foreground min-w-0 flex-1">{text}</span>
      <span className="flex min-h-8 items-center gap-1.5 pointer-coarse:min-h-11">
        <input
          id={id}
          type="checkbox"
          checked={included}
          disabled={!canWrite}
          onChange={(e) => onToggle(e.target.checked)}
          className="focus-visible:shadow-focus size-4 shrink-0 accent-teal-700 outline-none"
        />
        <label htmlFor={id} className="text-caption text-muted-foreground">
          Include in note
        </label>
      </span>
    </div>
  );
}
