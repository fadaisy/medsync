"use client";

import type { ReportKind } from "@/db/schema/pharmacy-rework-records";
import type { EpiRow, EpiWasteRow, Issue, LossRow, MedRow, ReportState } from "@/lib/pharmacy/reports/derive";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { LabButton } from "@/components/tide/work/button";
import { Pill } from "@/components/tide/work/kit";
import { DialogTitle } from "@/components/ui/dialog";
import { RC } from "@/content/pharmacy-rework-records";
import { reportGate, wastagePct } from "@/lib/pharmacy/reports/derive";
import { cn } from "@/lib/utils";
import { checkReportAction, submitReportAction } from "../actions";

const R = RC.reports;

export type ReportBody =
  | { kind: "hmis_meds"; rows: MedRow[] }
  | { kind: "cd_return"; rows: MedRow[]; cases: Record<string, number> }
  | { kind: "hmis_epi"; rows: { inUse: boolean; antigens: EpiRow[]; waste: EpiWasteRow[] } }
  | { kind: "losses"; rows: LossRow[] };

export interface ReportCard {
  kind: ReportKind;
  state: ReportState;
  due: string;
  issues: Issue[];
  remarks: Record<string, string>;
  checkedBy: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  body: ReportBody;
}

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala" });

export function issueWords(i: Issue): string {
  const w = i.what;
  switch (w.k) {
    case "outOfStock":
      return R.issues.outOfStock(w.med, w.days);
    case "openCase":
      return R.issues.openCase(w.med, w.n);
    case "noWitness":
      return R.issues.noWitness(w.n);
    case "epiWaste":
      return R.issues.epiWaste(w.vaccine, w.pct);
    case "epiMissing":
      return R.issues.epiMissing;
    case "casesOpen":
      return R.issues.casesOpen(w.n);
  }
}

const chip = (on: boolean) =>
  cn(
    "min-h-11 rounded-full px-4 text-[13.5px] sm:min-h-9",
    on ? "bg-tide-navy-900 text-tide-on-band font-semibold" : "bg-card shadow-tide-card",
  );

/**
 * Records › Reports (PRD §6.6, prototype productivity.js `ReportsView`/`ReportDialog`; Scenario 12): four cards for the
 * month; the dialog shows the figures, the issues and remark chips. Anyone checks; the in-charge submits, and the figures
 * are saved as they were.
 */
export function ReportsView({
  month,
  period,
  facility,
  cards,
  inCharge,
}: {
  month: string;
  period: string;
  facility: string;
  cards: ReportCard[];
  inCharge: boolean;
}) {
  const [open, setOpen] = useState<ReportKind | null>(null);
  const card = cards.find((c) => c.kind === open) ?? null;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((c) => {
          const g = reportGate(c.issues, c.remarks, c.state, inCharge);
          return (
            <button
              key={c.kind}
              type="button"
              onClick={() => setOpen(c.kind)}
              className="bg-card shadow-tide-card rounded-tide-card hover:bg-ink-50 focus-visible:shadow-focus flex min-h-11 flex-col gap-1.5 p-4 text-left outline-none"
            >
              <span className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-heading-s">{R.names[c.kind]}</span>
                <Pill tone="neutral" glyph={null}>
                  {R.state[c.state]}
                </Pill>
              </span>
              <span className="text-caption text-ink-700">{R.card(period, c.due)}</span>
              <span className="text-caption text-muted-foreground">{R.toLine(R.to[c.kind], R.who[c.kind])}</span>
              <span className="text-caption text-ink-800 font-medium">
                {c.state === "submitted"
                  ? R.foot.submitted(c.submittedAt ? when.format(new Date(c.submittedAt)) : "", c.submittedBy ?? "")
                  : g.blocked
                    ? R.blocks(g.blocked)
                    : g.remarksLeft && c.state === "draft"
                      ? R.remarksLeft(g.remarksLeft)
                      : R.ready}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-caption text-muted-foreground max-w-prose">{R.listHint}</p>
      {card ? (
        <ReportDialog
          key={card.kind}
          card={card}
          month={month}
          period={period}
          facility={facility}
          inCharge={inCharge}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

function ReportDialog({
  card,
  month,
  period,
  facility,
  inCharge,
  onClose,
}: {
  card: ReportCard;
  month: string;
  period: string;
  facility: string;
  inCharge: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [remarks, setRemarks] = useState<Record<string, string>>(card.remarks);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const g = reportGate(card.issues, remarks, card.state, inCharge);
  const choices = card.kind === "hmis_epi" ? R.remarks.epi : R.remarks.meds;
  const frozen = card.state !== "draft";

  const run = (f: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await f();
      if (!r.ok) return setError(r.error ?? RC.refused.failed);
      router.refresh();
      onClose();
    });

  return (
    <EditorDialog open onOpenChange={(o) => !o && onClose()} width="wide">
      <div className="flex flex-col gap-1 px-6 pt-5">
        <DialogTitle>{R.names[card.kind]}</DialogTitle>
        <p className="text-body-s text-ink-600">
          {R.head.facility}: {facility} · {R.head.period}: {period} · {R.head.prepared}: {R.who[card.kind]} · {R.head.due}:{" "}
          {card.due}
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
        {card.state === "submitted" ? <p className="text-caption text-ink-700">{R.frozen}</p> : null}
        {card.issues.length === 0 ? (
          <p className="text-body-s text-ink-700">{R.noIssues}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {card.issues.map((i, n) => (
              <li key={i.key ?? n} className="bg-muted/60 rounded-tide-tile flex flex-col gap-2 px-3 py-2">
                <span className="text-body-s flex flex-wrap items-center gap-2">
                  <Pill tone={i.sev === "info" ? "neutral" : "caution"}>{R.sev[i.sev]}</Pill>
                  {issueWords(i)}
                </span>
                {i.key ? (
                  <span className="flex flex-wrap gap-1.5">
                    {choices.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={remarks[i.key!] === c}
                        disabled={frozen}
                        onClick={() => setRemarks({ ...remarks, [i.key!]: c })}
                        className={chip(remarks[i.key!] === c)}
                      >
                        {c}
                      </button>
                    ))}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <Body body={card.body} />
        <p className="text-caption text-muted-foreground max-w-prose">{R.hint}</p>
        {error ? (
          <p role="alert" className="text-body-s text-ink-900 font-semibold">
            {error}
          </p>
        ) : null}
      </div>
      <div className="border-border flex flex-wrap items-center justify-end gap-2 border-t px-6 py-3">
        <span className="text-caption text-ink-700 mr-auto">
          {card.state === "submitted"
            ? R.foot.submitted(card.submittedAt ? when.format(new Date(card.submittedAt)) : "", card.submittedBy ?? "")
            : card.state === "checked"
              ? R.foot.checked(card.checkedBy ?? "")
              : R.foot.draft}
        </span>
        <LabButton variant="text" onClick={() => window.print()}>
          {R.print}
        </LabButton>
        {card.state === "draft" ? (
          <LabButton
            busy={pending}
            disabledReason={g.remarksLeft ? R.foot.remarks(g.remarksLeft) : undefined}
            onClick={() => run(() => checkReportAction({ kind: card.kind, month, remarks }))}
          >
            {R.check}
          </LabButton>
        ) : card.state === "checked" ? (
          <LabButton
            busy={pending}
            disabledReason={!inCharge ? R.inChargeSubmits : g.blocked ? R.foot.blocked : undefined}
            onClick={() => run(() => submitReportAction({ kind: card.kind, month }))}
          >
            {R.submit}
          </LabButton>
        ) : (
          <LabButton variant="secondary" onClick={onClose}>
            {R.close}
          </LabButton>
        )}
      </div>
    </EditorDialog>
  );
}

const th = "py-1.5 pr-3 font-medium";
const num = "py-1.5 pr-3 text-right tabular-nums";

function Table({ head, rows }: { head: { k: string; label: string; right?: boolean }[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-body-s w-full min-w-[32rem]">
        <thead className="text-muted-foreground text-left">
          <tr>
            {head.map((h) => (
              <th key={h.k} scope="col" className={cn(th, h.right && "text-right")}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={head[j]?.right ? num : "py-1.5 pr-3"}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const mos = (r: MedRow) => (r.amc > 0 ? (r.closing / r.amc).toFixed(1) : "–");

function Body({ body }: { body: ReportBody }) {
  if (body.kind === "hmis_meds") {
    const c = R.cols.meds;
    return (
      <Table
        head={[
          { k: "item", label: c.item },
          { k: "unit", label: c.unit },
          { k: "opening", label: c.opening, right: true },
          { k: "received", label: c.received, right: true },
          { k: "consumed", label: c.consumed, right: true },
          { k: "closing", label: c.closing, right: true },
          { k: "out", label: c.out, right: true },
          { k: "mos", label: c.mos, right: true },
        ]}
        rows={body.rows.map((r) => [r.name, r.unit, r.opening, r.received, r.consumed, r.closing, r.daysOut, mos(r)])}
      />
    );
  }
  if (body.kind === "cd_return") {
    const c = R.cols.cd;
    return (
      <Table
        head={[
          { k: "med", label: c.med },
          { k: "opening", label: c.opening, right: true },
          { k: "received", label: c.received, right: true },
          { k: "given", label: c.given, right: true },
          { k: "lost", label: c.lost, right: true },
          { k: "closing", label: c.closing, right: true },
          { k: "cases", label: c.cases, right: true },
        ]}
        rows={body.rows.map((r) => [r.name, r.opening, r.received, r.consumed, r.lost, r.closing, body.cases[r.productId] ?? 0])}
      />
    );
  }
  if (body.kind === "hmis_epi") {
    const c = R.cols.epi;
    if (!body.rows.inUse) return null;
    return (
      <div className="flex flex-col gap-3">
        <Table
          head={[
            { k: "antigen", label: c.antigen },
            { k: "given", label: c.given, right: true },
          ]}
          rows={body.rows.antigens.map((a) => [a.antigen, a.given])}
        />
        <Table
          head={[
            { k: "vaccine", label: c.vaccine },
            { k: "given", label: c.given, right: true },
            { k: "wasted", label: c.wasted, right: true },
            { k: "pct", label: c.pct, right: true },
          ]}
          rows={body.rows.waste.map((w) => [w.vaccine, w.given, w.wasted, `${wastagePct(w)}%`])}
        />
      </div>
    );
  }
  const c = R.cols.loss;
  const total = body.rows.reduce((a, r) => a + r.value, 0);
  return (
    <Table
      head={[
        { k: "cause", label: c.cause },
        { k: "lines", label: c.lines, right: true },
        { k: "value", label: c.value, right: true },
      ]}
      rows={[
        ...body.rows.map((r) => [RC.losses.causes[r.cause as keyof typeof RC.losses.causes] ?? r.cause, r.lines, RC.ugx(r.value)]),
        [c.total, body.rows.reduce((a, r) => a + r.lines, 0), RC.ugx(total)],
      ]}
    />
  );
}
