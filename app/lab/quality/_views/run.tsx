import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";

import { buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { fill, LAB3 } from "@/content/lab-phase-3";
import { LABWS2_QUALITY } from "@/content/lab-workspace-v2-quality";
import { db } from "@/db";
import { labSignedConfigs, labStockItems, labStockLots } from "@/db/schema";
import { loadQcPlans, loadQcSeries } from "@/lib/lab/qc-read";
import { cn } from "@/lib/utils";
import { LjChart } from "../_components/lj-chart";
import { QcChip } from "../_components/qc-chip";
import { PlanDialog, RunForm, SetTarget, SignDraft } from "../_components/qc-forms";
import { QUALITY } from "../_lib/copy";
import { requireQualityScope } from "../_lib/scope";
import { qcWord } from "../_lib/status";
import { EmptyState, Panel } from "../../_components/v2/kit";
import { ViewHeader } from "../../_components/v2/view-header";
import { dateWords, timeWords } from "../../_lib/days";
import { runHref } from "./qc";

const Q = QUALITY;
const W = LABWS2_QUALITY;
const at = (d: Date) => `${dateWords(d)} ${timeWords(d)}`;
const card = "border-border bg-card shadow-card flex flex-col gap-3 rounded-lg border p-4";
const uuid = /^[0-9a-f-]{36}$/i;

/** Lab Workspace v2: "Record a QC run" with no item chosen lists every plan in force to pick from. */
async function ChooseRun({ hospitalId }: { hospitalId: string }) {
  const plans = await db.transaction((t) => loadQcPlans(t as never, hospitalId, new Date()));
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ViewHeader title={W.record} subline={W.runs.chooseWhy} />
      {plans.rows.length === 0 ? (
        <EmptyState title={W.runs.noPlans} why={W.today.qcEmptyWhy} />
      ) : (
        <Panel title={W.runs.choose}>
          <ul className="divide-border -mx-1 flex flex-col divide-y">
            {plans.rows.map((r) => {
              const w = qcWord({ ...r, rules: r.lastRun?.rules ?? [] });
              return (
                <li key={r.configId}>
                  <Link
                    href={runHref(r.deviceId, r.conceptId)}
                    className="hover:bg-muted focus-visible:shadow-focus rounded-tide-row flex min-h-11 flex-wrap items-center justify-between gap-2 px-2 py-2 outline-none"
                  >
                    <span className="flex flex-col">
                      <span className="text-body-s text-foreground font-medium">{r.analyte}</span>
                      <span className="text-caption text-muted-foreground">
                        {r.lastRun
                          ? `${r.device} · ${at(r.lastRun.at)}`
                          : `${r.device} · ${W.today.noRuns}`}
                      </span>
                    </span>
                    <QcChip tone={w.tone}>{w.word}</QcChip>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}

/**
 * One analyte on one analyser (Lab Phase 3 §5.2, artboard 2; QQ-*, QR-*): the Levey-Jennings chart for a level
 * over 20, 50 or 90 days, this run (the engine previews the decision; the server decides again), and the QC plan
 * card with "Set this lab's target" for the lead (QQ-3). The lead writes the plan here; the CSO countersigns.
 */
export async function QcRunView({
  v2,
  sp,
}: {
  v2: boolean;
  sp: { device?: string; concept?: string; level?: string; days?: string };
}) {
  const { scope, lead, staff } = await requireQualityScope();
  if (v2 && !sp.device && !sp.concept) return <ChooseRun hospitalId={scope.hospitalId} />;
  if (!sp.device || !uuid.test(sp.device) || !sp.concept || !/^obs\.[a-z0-9_]+$/.test(sp.concept))
    notFound();
  const days = Q.run.days.find((d) => String(d) === sp.days) ?? Q.run.days[0];
  const now = new Date();
  const s = await db.transaction((t) =>
    loadQcSeries(
      t as never,
      scope.hospitalId,
      { deviceId: sp.device!, conceptId: sp.concept!, days },
      now,
    ),
  );
  if (!s) notFound();
  const plan = s.plan;
  const levels = plan?.levels ?? [];
  const level = levels.find((l) => String(l.level) === sp.level) ?? levels[0];
  const href = (o: { level?: number; days?: number }) =>
    `/lab/quality/qc/run?device=${s.device.id}&concept=${encodeURIComponent(sp.concept!)}&level=${o.level ?? level?.level ?? 1}&days=${o.days ?? days}`;
  const points = level
    ? s.runs.flatMap((r) =>
        r.values
          .filter((v) => v.level === level.level)
          .map((v) => ({
            id: r.id,
            at: at(r.at),
            value: v.value,
            z: v.z,
            by: r.by,
            lot: r.lots[r.values.indexOf(v)] ?? "lot",
            rules: [
              ...new Set(
                r.breaks
                  .filter((b) => b.points.some((p) => p.runId === r.id && p.level === level.level))
                  .map((b) => b.rule),
              ),
            ],
          })),
      )
    : [];
  const lastLot = level
    ? s.runs.at(-1)?.values.find((v) => v.level === level.level)?.lotId
    : undefined;
  const target =
    (level && s.targets.find((t) => t.level === level.level && t.controlLotId === lastLot)) ??
    (level ? s.targets.find((t) => t.level === level.level) : undefined);
  const [controlLots, drafts] = lead
    ? await Promise.all([
        db
          .select({ id: labStockLots.id, lot: labStockLots.lot, itemId: labStockLots.itemId })
          .from(labStockLots)
          .innerJoin(labStockItems, eq(labStockItems.id, labStockLots.itemId))
          .where(
            and(
              eq(labStockLots.hospitalId, scope.hospitalId),
              eq(labStockItems.kind, "control"),
              inArray(labStockLots.state, ["accepted", "in_use", "received", "in_acceptance"]),
            ),
          ),
        s.draft
          ? db
              .select({
                authoredBy: labSignedConfigs.authoredBy,
                lead: labSignedConfigs.leadSignedBy,
                version: labSignedConfigs.version,
              })
              .from(labSignedConfigs)
              .where(eq(labSignedConfigs.id, s.draft.id))
          : Promise.resolve([]),
      ])
    : [[], []];
  const draft = drafts[0];
  const decimals = Math.max(
    1,
    ...s.runs.flatMap((r) => r.values.map((v) => (String(v.value).split(".")[1] ?? "").length)),
  );
  return (
    <div
      className={
        v2
          ? "flex min-w-0 flex-col gap-4"
          : "mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6"
      }
    >
      <Link
        href={v2 ? "/lab/quality?tab=runs" : "/lab/quality/qc"}
        className="text-body-s text-primary self-start font-medium underline-offset-4 hover:underline"
      >
        {v2 ? W.run.back : Q.qc.title}
      </Link>
      {v2 ? (
        <ViewHeader
          title={plan ? `${s.analyte} · ${plan.unit}` : s.analyte}
          right={<Pill tone="neutral">{s.device.model}</Pill>}
        />
      ) : (
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="text-heading-m font-medium">
            {s.analyte}
            {plan ? <span className="text-muted-foreground"> · {plan.unit}</span> : null}
          </h1>
          <Pill tone="neutral">{s.device.model}</Pill>
        </header>
      )}
      {levels.length ? (
        <nav aria-label="Level and period" className="flex flex-wrap gap-2">
          {levels.map((l) => (
            <Link
              key={l.level}
              href={href({ level: l.level })}
              aria-current={l.level === level?.level ? "page" : undefined}
              className={cn(
                buttonVariants({
                  variant: l.level === level?.level ? "soft" : "secondary",
                  size: "sm",
                }),
                "min-h-11 sm:min-h-8",
              )}
            >
              {l.label}
            </Link>
          ))}
          <span aria-hidden className="border-border mx-1 border-l" />
          {Q.run.days.map((d) => (
            <Link
              key={d}
              href={href({ days: d })}
              aria-current={d === days ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: d === days ? "soft" : "secondary", size: "sm" }),
                "min-h-11 sm:min-h-8",
              )}
            >
              {Q.run.daysWord(d)}
            </Link>
          ))}
        </nav>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {plan && level && target ? (
            <section
              aria-labelledby="chart"
              className={cn(card, v2 && "shadow-tide-card rounded-tide-card border-0")}
            >
              <h2 id="chart" className="text-heading-s font-medium">
                {Q.run.chartTitle(level.label, days)}
              </h2>
              <p className="text-body-s text-muted-foreground tabular-nums">
                {Q.run.targetLine(String(target.mean), String(target.sd), plan.unit, target.lot)}
              </p>
              <LjChart
                title={`${s.analyte}, ${level.label}, last ${days} days`}
                points={points}
                mean={target.mean}
                sd={target.sd}
                unit={plan.unit}
                decimals={decimals}
              />
            </section>
          ) : null}
          {plan && staff ? (
            <RunForm
              deviceId={s.device.id}
              conceptId={sp.concept}
              analyte={s.analyte}
              analyser={s.device.model}
              plan={plan}
              lotsByLevel={s.lotsByLevel}
              history={s.history}
            />
          ) : !plan ? (
            <p className="text-body-s">
              {Q.run.noPlan} {lead ? Q.run.noPlanLead : null}
            </p>
          ) : null}
        </div>
        <aside
          aria-labelledby="plan"
          className={cn(
            card,
            "text-body-s h-fit",
            v2 && "shadow-tide-card rounded-tide-card border-0",
          )}
        >
          <h2 id="plan" className="text-heading-s font-medium">
            {Q.plan.title}
          </h2>
          {plan ? (
            <>
              <dl className="flex flex-col gap-2">
                {(
                  [
                    [Q.plan.levels, plan.levels.map((l) => l.label).join(" · ")],
                    [
                      Q.plan.frequency,
                      Q.plan.frequencies[plan.frequency.kind]!.replace(
                        "n ",
                        `${plan.frequency.n ?? "n"} `,
                      ),
                    ],
                    [Q.plan.rejectOn, plan.rejectRules.join(", ")],
                    [Q.plan.warnOn, plan.warnRules.join(", ") || "—"],
                    [Q.plan.holdNotRun, plan.holdWhenNotRun ? "Yes" : "No"],
                    [Q.plan.onFailure, Q.plan.onFailureWords],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-caption text-muted-foreground">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-caption text-muted-foreground">{Q.plan.target}</dt>
                  {s.targets.map((t) => (
                    <dd key={`${t.level}-${t.controlLotId}`} className="flex flex-col gap-1 pb-2">
                      <span className="tabular-nums">{`${plan.levels.find((l) => l.level === t.level)?.label ?? t.level}: ${t.mean} ± ${t.sd} · ${t.lot}`}</span>
                      <span className="text-caption text-muted-foreground">
                        {t.source === "lab"
                          ? Q.plan.lab(
                              t.runs,
                              t.from ? dateWords(new Date(t.from)) : "?",
                              t.to ? dateWords(new Date(t.to)) : "?",
                            )
                          : Q.plan.maker}
                      </span>
                      {t.source === "maker_provisional" && lead ? (
                        !t.progress ? (
                          <span className="text-caption">{Q.plan.noPolicy}</span>
                        ) : t.progress.kind === "ready" ? (
                          <>
                            <span className="text-caption">
                              {Q.plan.targetReady(t.progress.runs, s.policy!.minDaysForTarget)}
                            </span>
                            <SetTarget
                              deviceId={s.device.id}
                              conceptId={sp.concept!}
                              level={t.level}
                              controlLotId={t.controlLotId}
                              label={
                                plan.levels.find((l) => l.level === t.level)?.label ??
                                `level ${t.level}`
                              }
                            />
                          </>
                        ) : (
                          <span className="text-caption">
                            {Q.plan.targetNotYet(
                              t.progress.runs,
                              t.progress.days,
                              s.policy!.minRunsForTarget,
                              s.policy!.minDaysForTarget,
                            )}
                          </span>
                        )
                      ) : null}
                    </dd>
                  ))}
                </div>
              </dl>
              {/* Outside the <dl>: a definition list holds only dt/dd groups (axe definition-list). */}
              {s.signedOn ? (
                <p className="text-caption text-muted-foreground">
                  {Q.plan.signedBy(dateWords(s.signedOn))}
                </p>
              ) : null}
            </>
          ) : null}
          {plan?.targets.some((t) => t.source === "maker_provisional") ? (
            <p className="text-caption text-muted-foreground">
              {fill(LAB3.provisionalTarget, {
                n: s.policy?.minRunsForTarget ?? "the signed minimum of",
              })}
            </p>
          ) : null}
          {lead ? (
            <>
              <PlanDialog
                deviceId={s.device.id}
                conceptId={sp.concept}
                initial={s.draft?.payload ?? s.payload}
                items={s.items}
                lots={controlLots}
              />
              {s.draft && draft ? (
                <div className="flex flex-col gap-2 border-t pt-3">
                  <p>{Q.plan.draftWaiting(draft.version)}</p>
                  {draft.lead ? (
                    <p className="text-muted-foreground">
                      Signed by the lead; waiting for the CSO.
                    </p>
                  ) : (
                    <SignDraft configId={s.draft.id} author={draft.authoredBy === scope.userId} />
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
