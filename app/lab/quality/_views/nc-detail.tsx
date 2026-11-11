import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { Ident, TwoIds } from "@/components/tide/work/kit";
import { fill, LAB3 } from "@/content/lab-phase-3";
import { LABWS2_QUALITY } from "@/content/lab-workspace-v2-quality";
import { db } from "@/db";
import { identitiesFor } from "@/lib/emr/read/results";
import { loadNc } from "@/lib/lab/qc-read";
import { analyteName } from "@/lib/lab/qc-store";
import { cn } from "@/lib/utils";
import {
  ActionState,
  AddActionDialog,
  CloseForm,
  DecideItem,
  ResumeButton,
} from "../_components/nc-forms";
import { QList } from "../_components/q-list";
import { QcChip } from "../_components/qc-chip";
import { QUALITY } from "../_lib/copy";
import { ncLiveFor, requireQualityScope } from "../_lib/scope";
import { ViewHeader } from "../../_components/v2/view-header";
import { dateWords, dayWords, timeWords } from "../../_lib/days";

const N = QUALITY.nc;
const L = QUALITY.lookBack;
const W = LABWS2_QUALITY.nc;
const W2 = LABWS2_QUALITY.sweep;
const at = (d: Date) => `${dateWords(d)} ${timeWords(d)}`;
const card =
  "border-border bg-card shadow-card text-body-s flex flex-col gap-3 rounded-lg border p-4";
const link = "font-medium text-primary underline-offset-4 hover:underline";

/**
 * One nonconformity (Lab Phase 3 §5.9, artboard 9; §5.3's look-back panel, artboard 3): what happened, the
 * actions (MedSync's automatic ones named), the look-back with the estimate labelled and a decision per result,
 * resumption (the lead, once the conditions are met) and closure (NC-4, the lead's signature).
 */
export async function NcDetailView({ v2, id }: { v2: boolean; id: string }) {
  const { scope, lead, staff } = await requireQualityScope(ncLiveFor);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const v = await db.transaction((t) => loadNc(t as never, scope.hospitalId, id));
  if (!v) notFound();
  const { nc } = v;
  const ids = await identitiesFor(
    scope,
    v.lookBack.map((i) => i.patientUserId),
    "lab_lookback",
  );
  const open = nc.state === "open";
  const halted = nc.testingHalted && !nc.resumedAt;
  const analyte = nc.subjectConceptId ? analyteName(nc.subjectConceptId) : "";
  const conditions = [v.passingRun === true, v.progress.complete];
  const state = !open ? (
    <StatusWord>{N.closed}</StatusWord>
  ) : halted ? (
    <QcChip tone="dark">{N.halted}</QcChip>
  ) : (
    <QcChip tone="dashed">{N.openWord}</QcChip>
  );
  const back = (
    <Link
      href={v2 ? "/lab/quality?tab=nc" : "/lab/quality/nonconformities"}
      className={cn("text-body-s self-start", link)}
    >
      {W.back}
    </Link>
  );
  return (
    <div
      className={
        v2
          ? "flex min-w-0 flex-col gap-4"
          : "mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6"
      }
    >
      {back}
      {v2 ? (
        <ViewHeader title={`${nc.number} · ${nc.title}`} right={state} />
      ) : (
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="text-heading-m font-medium">
            <Ident>{nc.number}</Ident> · {nc.title}
          </h1>
          {state}
        </header>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <section
            aria-labelledby="what"
            className={cn(card, v2 && "shadow-tide-card rounded-tide-card border-0")}
          >
            <h2 id="what" className="text-heading-s font-medium">
              {N.whatHappened}
            </h2>
            <dl className="grid gap-2 sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted-foreground">{N.source}</dt>
              <dd>
                {N.sources[nc.source] ?? nc.source}
                {v.run ? ` · run ${at(v.run.at)} (${v.run.rules.join(", ")})` : ""}
              </dd>
              <dt className="text-muted-foreground">{N.whatHappened}</dt>
              <dd>{nc.whatHappened}</dd>
              <dt className="text-muted-foreground">{N.risk}</dt>
              <dd>{nc.riskText ?? N.noRisk}</dd>
              <dt className="text-muted-foreground">{N.owner}</dt>
              <dd>{v.owner ?? "No laboratory lead named"}</dd>
            </dl>
          </section>

          <section
            aria-labelledby="actions"
            className={cn(card, v2 && "shadow-tide-card rounded-tide-card border-0")}
          >
            <h2 id="actions" className="text-heading-s font-medium">
              {N.actions}
            </h2>
            <QList
              caption={N.actions}
              rows={v.actions}
              rowKey={(a) => a.id}
              empty="No actions yet."
              columns={[
                { id: "what", header: N.actionColumns[0]!, cell: (a) => a.what },
                { id: "who", header: N.actionColumns[1]!, cell: (a) => a.who },
                { id: "by", header: N.actionColumns[2]!, cell: (a) => dayWords(a.by) },
                {
                  id: "state",
                  header: N.actionColumns[3]!,
                  cell: (a) => (
                    <span className="flex flex-col gap-2">
                      {a.state === "open" ? (
                        <QcChip tone="dashed">{N.states.open!}</QcChip>
                      ) : (
                        <StatusWord>{`${N.states[a.state]}${a.cancelReason ? `: ${a.cancelReason}` : ""}`}</StatusWord>
                      )}
                      {open && staff && a.state === "open" ? (
                        <ActionState ncId={nc.id} actionId={a.id} what={a.what} />
                      ) : null}
                    </span>
                  ),
                },
              ]}
            />
            {open && staff ? <AddActionDialog ncId={nc.id} /> : null}
          </section>

          {v.lookBack.length || v.run ? (
            <section
              aria-labelledby="lookback"
              className={cn(card, v2 && "shadow-tide-card rounded-tide-card border-0")}
            >
              <h2 id="lookback" className="text-heading-s font-medium">
                {L.title}
              </h2>
              {v.run ? (
                <p>{L.window(v.run.from ? at(v.run.from) : "the first run", at(v.run.at))}</p>
              ) : null}
              <p>
                {L.released}:{" "}
                <span className="font-semibold tabular-nums">{v.lookBack.length}</span>
              </p>
              {v.bias ? (
                <p>
                  {fill(LAB3.lookBackEstimate, {
                    n: v.bias.level,
                    bias: Math.abs(v.bias.value).toFixed(2),
                    unit: v.unit ?? "",
                    "high or low": v.bias.value >= 0 ? L.high : L.low,
                  })}
                </p>
              ) : null}
              <p className="text-caption text-muted-foreground">{LAB3.lookBackSort}</p>
              <QList
                caption={L.title}
                rows={v.lookBack}
                rowKey={(i) => i.id}
                empty={L.none}
                columns={[
                  {
                    id: "patient",
                    header: L.columns[0]!,
                    cell: (i) => {
                      const p = ids.get(i.patientUserId);
                      return (
                        <TwoIds name={p?.name ?? "Name withheld"} mrn={p?.mrn ?? "MRN not found"} />
                      );
                    },
                  },
                  {
                    id: "value",
                    header: L.columns[1]!,
                    cell: (i) => (
                      <span className="tabular-nums">{`${i.value} ${v.unit ?? ""}`}</span>
                    ),
                  },
                  { id: "released", header: L.columns[2]!, cell: (i) => at(i.releasedAt) },
                  {
                    id: "sort",
                    header: L.columns[3]!,
                    cell: (i) =>
                      i.sort === "unchanged" ? (
                        L.sorts.unchanged
                      ) : (
                        <QcChip tone="amber">{L.sorts[i.sort]!}</QcChip>
                      ),
                  },
                  {
                    id: "decision",
                    header: L.columns[4]!,
                    cell: (i) =>
                      i.decision ? (
                        <StatusWord>{L.decisions[i.decision]!}</StatusWord>
                      ) : open && staff ? (
                        <span className="flex flex-col gap-1">
                          <DecideItem
                            itemId={i.id}
                            label={`${ids.get(i.patientUserId)?.mrn ?? ""} ${i.value}`}
                          />
                          {i.orderId ? (
                            <Link
                              href={v2 ? `/lab/bench/${i.orderId}` : `/lab/results/${i.orderId}`}
                              className={link}
                            >
                              {L.amendFirst}
                            </Link>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      ),
                  },
                ]}
              />
              <p className="font-medium">{L.progress(v.progress.decided, v.progress.total)}</p>
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-5">
          {nc.testingHalted ? (
            <section
              aria-labelledby="resume"
              className={cn(card, v2 && "shadow-tide-card rounded-tide-card border-0")}
            >
              <h2 id="resume" className="text-heading-s font-medium">
                {N.resume}
              </h2>
              <ul className="flex flex-col gap-2">
                {N.conditions.map((c, i) => (
                  <li key={c} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{c}</span>
                    {conditions[i] ? (
                      <QcChip tone="passed">{N.met}</QcChip>
                    ) : (
                      <QcChip tone="dashed">{N.notMet}</QcChip>
                    )}
                  </li>
                ))}
              </ul>
              {nc.resumedAt ? (
                <StatusWord>{`${N.resumed} ${at(nc.resumedAt)}`}</StatusWord>
              ) : (
                <>
                  <p>{N.resumeWords(analyte.toLowerCase())}</p>
                  {lead ? (
                    <ResumeButton
                      ncId={nc.id}
                      disabledReason={conditions.every(Boolean) ? null : W2.resumeUnmet}
                    />
                  ) : null}
                </>
              )}
            </section>
          ) : null}
          <section
            aria-labelledby="close"
            className={cn(card, v2 && "shadow-tide-card rounded-tide-card border-0")}
          >
            <h2 id="close" className="text-heading-s font-medium">
              {N.close}
            </h2>
            {open ? (
              lead ? (
                <CloseForm ncId={nc.id} />
              ) : (
                <p className="text-muted-foreground">{N.closeNote}</p>
              )
            ) : (
              <p>
                {`${N.causes[nc.causeCategory ?? ""] ?? nc.causeCategory} · ${nc.effectivenessPlan ?? ""} · ${N.closed} ${nc.closedAt ? at(nc.closedAt) : ""}`}
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
