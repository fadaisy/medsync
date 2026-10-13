import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { fill, LAB3 } from "@/content/lab-phase-3";
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
} from "../../_components/nc-forms";
import { QcChip } from "../../_components/qc-chip";
import { QUALITY } from "../../_lib/copy";
import { ncLiveFor, requireQualityScope } from "../../_lib/scope";
import { RecordList } from "../../../_components/record-list";
import { dateWords, dayWords, timeWords } from "../../../_lib/days";

export const metadata: Metadata = { title: "Nonconformity · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const N = QUALITY.nc;
const L = QUALITY.lookBack;
const at = (d: Date) => `${dateWords(d)} ${timeWords(d)}`;
const card =
  "border-border bg-card shadow-card text-body-s flex flex-col gap-3 rounded-lg border p-4";
const link = "font-medium text-teal-700 underline-offset-4 hover:underline";

/**
 * One nonconformity (Lab Phase 3 §5.9, artboard 9; §5.3's look-back panel, artboard 3): what happened, the
 * actions (MedSync's automatic ones named), the look-back with the estimate labelled and a decision per result,
 * resumption (the lead, once the conditions are met) and closure (NC-4, the lead's signature).
 */
export default async function NonconformityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <Link href="/lab/quality/nonconformities" className={cn("text-body-s self-start", link)}>
        {N.title}
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-heading-m font-medium">
          <span className="font-mono">{nc.number}</span> · {nc.title}
        </h1>
        {!open ? (
          <StatusWord>{N.closed}</StatusWord>
        ) : halted ? (
          <QcChip tone="dark">{N.halted}</QcChip>
        ) : (
          <QcChip tone="amber">{N.openWord}</QcChip>
        )}
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="what" className={card}>
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

          <section aria-labelledby="actions" className={card}>
            <h2 id="actions" className="text-heading-s font-medium">
              {N.actions}
            </h2>
            <RecordList
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
            <section aria-labelledby="lookback" className={card}>
              <h2 id="lookback" className="text-heading-s font-medium">
                {L.title}
              </h2>
              {v.run ? (
                <p>{L.window(v.run.from ? at(v.run.from) : "the first run", at(v.run.at))}</p>
              ) : null}
              <p>
                {L.released}: <span className="font-mono tabular-nums">{v.lookBack.length}</span>
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
              <RecordList
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
                        <span className="flex flex-col">
                          <span>{p?.name ?? "Name withheld"}</span>
                          <span className="text-caption text-muted-foreground font-mono">
                            {p?.mrn ?? "MRN not found"}
                          </span>
                        </span>
                      );
                    },
                  },
                  {
                    id: "value",
                    header: L.columns[1]!,
                    cell: (i) => (
                      <span className="font-mono tabular-nums">{`${i.value} ${v.unit ?? ""}`}</span>
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
                            <Link href={`/lab/results/${i.orderId}`} className={link}>
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
            <section aria-labelledby="resume" className={card}>
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
                    <ResumeButton ncId={nc.id} disabled={!conditions.every(Boolean)} />
                  ) : null}
                </>
              )}
            </section>
          ) : null}
          <section aria-labelledby="close" className={card}>
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
