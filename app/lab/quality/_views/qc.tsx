import type { PlanRow } from "@/lib/lab/qc-read";
import type { ReactNode } from "react";
import Link from "next/link";
import { and, eq } from "drizzle-orm";

import { buttonVariants } from "@/components/ui/button";
import { LABWS2 } from "@/content/lab-workspace-v2";
import { LABWS2_QUALITY } from "@/content/lab-workspace-v2-quality";
import { db } from "@/db";
import { labSignedConfigs } from "@/db/schema";
import { conceptDef } from "@/lib/facts/project/shared";
import { loadAnalysersInService, loadLabComponents } from "@/lib/lab/qc-plan-form-read";
import { loadKits, loadQcPlans } from "@/lib/lab/qc-read";
import { cn } from "@/lib/utils";
import { QList } from "../_components/q-list";
import { QcChip } from "../_components/qc-chip";
import { KitCheckDialog, KitRuleDialog, PolicyDialog, SignDraft } from "../_components/qc-forms";
import { QUALITY } from "../_lib/copy";
import { requireQualityScope } from "../_lib/scope";
import { qcWord } from "../_lib/status";
import { PickField } from "../../_components/v2/fields";
import { EmptyState, Panel } from "../../_components/v2/kit";
import { SecondaryLink } from "../../_components/v2/space";
import { dateWords, timeWords } from "../../_lib/days";
import { Frame } from "./frame";

const Q = QUALITY;
const W = LABWS2_QUALITY;
const at = (d: Date) => `${dateWords(d)} ${timeWords(d)}`;
const link = "font-medium text-primary underline-offset-4 hover:underline";
const humanise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
const card = "border-border bg-card shadow-card flex flex-col gap-3 rounded-lg border p-4";
type Kit = Awaited<ReturnType<typeof loadKits>>[number];
type KitRow = { k: Kit; l: Kit["lots"][number] | null };
type Meta = Map<string, { id: string; authoredBy: string; lead: string | null }>;

export const runHref = (deviceId: string, conceptId: string) =>
  `/lab/quality/qc/run?device=${deviceId}&concept=${encodeURIComponent(conceptId)}`;

/**
 * Quality control (Lab Phase 3 §5.2, §5.4): one load, three layouts. Flag off, the old page (Analysers and
 * Kits tabs). Lab Workspace v2 splits it (prompt 5.7): `plans` holds the plans, the drafts to sign, the policy
 * and the kit and stain rules; `runs` holds every QC item to run (analysers, then kit and stain lots).
 */
export async function QcView({
  v2,
  tab,
}: {
  v2: boolean;
  tab: "plans" | "runs" | "analysers" | "kits";
}) {
  const { scope, lead, staff } = await requireQualityScope();
  const now = new Date();
  const h = scope.hospitalId;
  const [plans, kits, authored, analysers, components] = await db.transaction(async (t) => {
    const tx = t as never;
    return Promise.all([
      loadQcPlans(tx, h, now),
      loadKits(tx, h, scope.userId, now),
      t
        .select({
          id: labSignedConfigs.id,
          authoredBy: labSignedConfigs.authoredBy,
          lead: labSignedConfigs.leadSignedBy,
        })
        .from(labSignedConfigs)
        .where(and(eq(labSignedConfigs.hospitalId, h), eq(labSignedConfigs.status, "draft"))),
      !v2 && lead ? loadAnalysersInService(tx, h) : Promise.resolve([]),
      !v2 && lead ? loadLabComponents(tx, h, { quantityOnly: true }) : Promise.resolve([]),
    ]);
  });
  const meta: Meta = new Map(authored.map((a) => [a.id, a]));
  const me = scope.userId;

  const planRows = (
    <QList<PlanRow>
      caption={Q.qc.tabs.analysers}
      rows={plans.rows}
      rowKey={(r) => r.configId}
      empty={v2 ? W.today.qcEmpty : Q.today.none}
      why={v2 ? W.today.qcEmptyWhy : undefined}
      columns={[
        {
          id: "what",
          header: Q.today.columns[0]!,
          cell: (r) => (
            <Link href={runHref(r.deviceId, r.conceptId)} className={link}>
              {r.analyte}
            </Link>
          ),
        },
        { id: "where", header: Q.today.columns[1]!, cell: (r) => r.device },
        {
          id: "last",
          header: Q.today.columns[2]!,
          cell: (r) => (r.lastRun ? at(r.lastRun.at) : "—"),
        },
        {
          id: "status",
          header: Q.today.columns[3]!,
          cell: (r) => {
            const w = qcWord({ ...r, rules: r.lastRun?.rules ?? [] });
            return <QcChip tone={w.tone}>{w.word}</QcChip>;
          },
        },
      ]}
    />
  );

  const draftList =
    lead && plans.drafts.length ? (
      <Wrap v2={v2} title={Q.qc.drafts} id="drafts">
        <ul className="flex flex-col gap-3">
          {plans.drafts.map((d) => {
            const m = meta.get(d.id);
            return (
              <li key={d.id} className="text-body-s flex flex-col gap-1">
                <span>{`${d.analyte} on ${d.device}`}</span>
                {m?.lead ? (
                  <span className="text-muted-foreground">{W.plans.leadSigned}</span>
                ) : (
                  <SignDraft configId={d.id} author={m?.authoredBy === me} />
                )}
              </li>
            );
          })}
        </ul>
      </Wrap>
    ) : null;
  const drafts =
    v2 || !draftList ? (
      draftList
    ) : (
      <section aria-labelledby="drafts" className={card}>
        {draftList}
      </section>
    );

  const policy = (
    <Wrap v2={v2} title={Q.qc.policy} id="policy">
      <p className="text-body-s text-muted-foreground">{Q.qc.policyLede}</p>
      {plans.policy ? (
        <p className="text-body-s">
          {`${plans.policy.minRunsForTarget} accepted runs over ${plans.policy.minDaysForTarget} days · ${plans.policy.sources.join("; ")}`}
        </p>
      ) : v2 ? (
        <EmptyState compact title={Q.qc.policyNone} why={LABWS2.qc.policyNotSigned} />
      ) : (
        <p className="text-body-s">{Q.qc.policyNone}</p>
      )}
      {lead ? <PolicyDialog initial={plans.policyDraft?.payload ?? plans.policy} /> : null}
      {lead && plans.policyDraft && !meta.get(plans.policyDraft.id)?.lead ? (
        <SignDraft
          configId={plans.policyDraft.id}
          author={meta.get(plans.policyDraft.id)?.authoredBy === me}
        />
      ) : null}
    </Wrap>
  );

  const kitLots = (withRules: boolean) => (
    <QList<KitRow>
      caption={Q.qc.tabs.kits}
      rows={kits.flatMap((k): KitRow[] =>
        k.lots.length ? k.lots.map((l) => ({ k, l })) : [{ k, l: null }],
      )}
      rowKey={(r) => r.l?.id ?? r.k.id}
      empty={Q.kits.none}
      columns={[
        {
          id: "kit",
          header: Q.kits.columns[0]!,
          cell: ({ k, l }) => (
            <span className="flex flex-col gap-1">
              <span>{l ? `${k.name} · ${l.lot}` : k.name}</span>
              {l?.useBy ? (
                <span className="text-caption text-muted-foreground">use by {l.useBy}</span>
              ) : null}
              {withRules ? <KitRule k={k} lead={lead} meta={meta} me={me} /> : null}
            </span>
          ),
        },
        {
          id: "why",
          header: Q.kits.columns[1]!,
          cell: ({ k, l }) => <DueWhen k={k} due={l?.due ?? []} />,
        },
        {
          id: "controls",
          header: Q.kits.columns[2]!,
          cell: ({ k }) => k.rule?.controls.map((c) => c.name).join(", ") ?? "—",
        },
        {
          id: "last",
          header: Q.kits.columns[3]!,
          cell: ({ l }) =>
            l?.last ? `${at(l.last.at)} · ${l.last.outcome === "pass" ? "passed" : "failed"}` : "—",
        },
        {
          id: "status",
          header: Q.kits.columns[4]!,
          cell: (r) => <KitStatus {...r} staff={staff} />,
        },
      ]}
    />
  );

  if (v2 && tab === "plans")
    return (
      <Frame
        v2
        hospital={scope.hospitalName}
        title={W.plans.title}
        right={
          lead ? (
            <SecondaryLink href="/lab/quality/plans/new">{W.plans.newPlan}</SecondaryLink>
          ) : null
        }
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel title={Q.qc.tabs.analysers}>{planRows}</Panel>
            <Panel title={W.plans.kitRules}>
              <QList<Kit>
                caption={W.plans.kitRules}
                rows={kits}
                rowKey={(k) => k.id}
                empty={Q.kits.none}
                columns={[
                  { id: "kit", header: W.plans.kitRuleColumns[0]!, cell: (k) => k.name },
                  {
                    id: "due",
                    header: W.plans.kitRuleColumns[1]!,
                    cell: (k) => <DueWhen k={k} due={k.rule?.triggers.map((t) => t.kind) ?? []} />,
                  },
                  {
                    id: "controls",
                    header: W.plans.kitRuleColumns[2]!,
                    cell: (k) => k.rule?.controls.map((c) => c.name).join(", ") ?? "—",
                  },
                  {
                    id: "rule",
                    header: W.plans.kitRuleColumns[3]!,
                    cell: (k) => <KitRule k={k} lead={lead} meta={meta} me={me} />,
                  },
                ]}
              />
            </Panel>
          </div>
          <div className="flex flex-col gap-4">
            {drafts}
            {policy}
          </div>
        </div>
      </Frame>
    );

  if (v2)
    return (
      <Frame v2 hospital={scope.hospitalName} title={W.runs.title}>
        <Panel title={Q.qc.tabs.analysers}>{planRows}</Panel>
        <Panel title={W.runs.kits} note={Q.kits.caution}>
          {kitLots(false)}
        </Panel>
      </Frame>
    );

  // Flag off: the old page, swept (no concept id typed, only analysers in service).
  const kitsTab = tab === "kits";
  return (
    <Frame v2={false} hospital={scope.hospitalName} title={Q.qc.title}>
      <nav aria-label="Quality control" className="flex gap-2">
        {(["analysers", "kits"] as const).map((k) => (
          <Link
            key={k}
            href={k === "kits" ? "/lab/quality/qc?tab=kits" : "/lab/quality/qc"}
            aria-current={(k === "kits") === kitsTab ? "page" : undefined}
            className={cn(
              buttonVariants({
                variant: (k === "kits") === kitsTab ? "soft" : "secondary",
                size: "sm",
              }),
              "min-h-11 sm:min-h-8",
            )}
          >
            {k === "kits"
              ? `${Q.qc.tabs.kits} ${kits.length}`
              : `${Q.qc.tabs.analysers} ${plans.rows.length}`}
          </Link>
        ))}
      </nav>
      {kitsTab ? (
        <>
          {kitLots(true)}
          <p className="text-caption text-muted-foreground">{Q.kits.caution}</p>
        </>
      ) : (
        <>
          {planRows}
          {lead ? (
            <section aria-labelledby="new-plan" className={card}>
              <h2 id="new-plan" className="text-heading-s font-medium">
                {Q.qc.newPlan}
              </h2>
              {analysers.length ? (
                // A plain GET form: the run page holds the plan editor.
                <form
                  action="/lab/quality/qc/run"
                  className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <label className="text-body-s flex flex-col gap-1">
                    <span className="text-muted-foreground">{Q.qc.analyser}</span>
                    <select
                      name="device"
                      required
                      className="border-input bg-card text-body-s min-h-11 rounded-sm border px-2 sm:min-h-9"
                    >
                      {analysers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.section ? `${d.model} · ${d.section}` : d.model}
                        </option>
                      ))}
                    </select>
                  </label>
                  <PickField
                    label={Q.qc.analyte}
                    name="concept"
                    required
                    forceList
                    options={components.map((c) => ({
                      value: c.conceptId,
                      label: c.name,
                      detail: [c.unit, c.section].filter(Boolean).join(" · ") || undefined,
                    }))}
                  />
                  <button type="submit" className={cn(buttonVariants(), "min-h-11 sm:min-h-9")}>
                    {Q.qc.open}
                  </button>
                </form>
              ) : (
                <EmptyState compact title={W.newPlan.noAnalyser} why={W.newPlan.noAnalyserWhy} />
              )}
            </section>
          ) : null}
          {drafts}
          <section aria-labelledby="policy" className={card}>
            {policy}
          </section>
        </>
      )}
    </Frame>
  );
}

/** A titled block: a Panel inside v2, a plain heading on the old page (whose card wraps it). */
function Wrap({
  v2,
  title,
  id,
  children,
}: {
  v2: boolean;
  title: string;
  id: string;
  children: ReactNode;
}) {
  if (v2)
    return (
      <Panel title={title} labelledBy={id} className="scroll-mt-24" as="section">
        {children}
      </Panel>
    );
  return (
    <>
      <h2 id={id} className="text-heading-s font-medium">
        {title}
      </h2>
      {children}
    </>
  );
}

function DueWhen({ k, due }: { k: Kit; due: readonly string[] }) {
  if (!k.rule) return <QcChip tone="amber">{Q.kits.noRule}</QcChip>;
  return (
    <>
      {due
        .map((d) =>
          d === "schedule"
            ? `Weekly, ${Q.kits.weekdays[(k.rule!.triggers.find((t) => t.kind === "schedule")?.weekday ?? 1) - 1]}`
            : Q.kits.triggers[d],
        )
        .join(" · ") || "—"}
    </>
  );
}

function KitRule({ k, lead, meta, me }: { k: Kit; lead: boolean; meta: Meta; me: string }) {
  if (!lead)
    return k.rule ? null : (
      <span className="text-caption text-muted-foreground">{W.plans.kitNoRule}</span>
    );
  return (
    <span className="flex flex-col gap-1">
      <KitRuleDialog itemId={k.id} name={k.name} initial={k.draft?.payload ?? k.rule} />
      {k.draft ? (
        <SignDraft configId={k.draft.id} author={meta.get(k.draft.id)?.authoredBy === me} />
      ) : null}
    </span>
  );
}

function KitStatus({ k, l, staff }: KitRow & { staff: boolean }) {
  if (!l || !k.rule) return <>—</>;
  const S = Q.status;
  const chip =
    l.state === "quarantined" ? (
      <QcChip tone="dark">{S.quarantined}</QcChip>
    ) : l.due.length === 0 ? (
      <QcChip tone="passed">{S.passed}</QcChip>
    ) : l.state === "received" || l.state === "in_acceptance" ? (
      <QcChip tone="amber">{S.lotNotUsable}</QcChip>
    ) : (
      <QcChip tone={l.blocks ? "amber" : "dashed"}>{l.blocks ? S.dueFirst : S.dueToday}</QcChip>
    );
  const answers = [
    ...new Set([
      ...k.conceptIds.flatMap((c) => conceptDef(c)?.answers ?? []),
      ...k.rule.controls.flatMap((c) => ("code" in c.expected ? [c.expected.code] : [])),
      "invalid",
    ]),
  ].map((code) => ({ code, label: humanise(code) }));
  return (
    <span className="flex flex-col gap-2">
      {chip}
      {staff && l.state !== "quarantined" ? (
        <KitCheckDialog
          lot={{ id: l.id, lot: l.lot, name: k.name }}
          rule={k.rule}
          due={l.due}
          answers={answers}
        />
      ) : null}
    </span>
  );
}
