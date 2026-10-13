import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";

import { PageHeader } from "@/components/medsync/page-header";
import { buttonVariants } from "@/components/ui/button";
import { LAB } from "@/content/lab";
import { db } from "@/db";
import { labSignedConfigs } from "@/db/schema";
import { conceptDef } from "@/lib/facts/project/shared";
import { loadKits, loadQcPlans } from "@/lib/lab/qc-read";
import { cn } from "@/lib/utils";
import { QcChip } from "../_components/qc-chip";
import { KitCheckDialog, KitRuleDialog, PolicyDialog, SignDraft } from "../_components/qc-forms";
import { QUALITY } from "../_lib/copy";
import { requireQualityScope } from "../_lib/scope";
import { qcWord } from "../_lib/status";
import { RecordList } from "../../_components/record-list";
import { dateWords, timeWords } from "../../_lib/days";

export const metadata: Metadata = { title: "Quality control · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const Q = QUALITY;
const at = (d: Date) => `${dateWords(d)} ${timeWords(d)}`;
const link = "font-medium text-teal-700 underline-offset-4 hover:underline";
const humanise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
type Kit = Awaited<ReturnType<typeof loadKits>>[number];
type KitRow = { k: Kit; l: Kit["lots"][number] | null };
const card = "border-border bg-card shadow-card flex flex-col gap-3 rounded-lg border p-4";

/**
 * Quality control (Lab Phase 3 §5.2, §5.4; artboards 2 and 4; labQc): analysers (each plan's status, the run
 * page, plans and the policy to sign) and kits and stains (why each lot is due, record its controls). Bedside
 * devices are Step 8's tab.
 */
export default async function QualityControlPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { scope, lead, staff } = await requireQualityScope();
  const tab = (await searchParams).tab === "kits" ? "kits" : "analysers";
  const now = new Date();
  const h = scope.hospitalId;
  const [plans, kits, authored] = await db.transaction(async (t) => {
    const tx = t as never;
    return Promise.all([
      loadQcPlans(tx, h, now),
      loadKits(tx, h, scope.userId, now),
      db
        .select({
          id: labSignedConfigs.id,
          authoredBy: labSignedConfigs.authoredBy,
          lead: labSignedConfigs.leadSignedBy,
        })
        .from(labSignedConfigs)
        .where(and(eq(labSignedConfigs.hospitalId, h), eq(labSignedConfigs.status, "draft"))),
    ]);
  });
  const draftMeta = new Map(authored.map((a) => [a.id, a]));
  const tabs = (
    <nav aria-label="Quality control" className="flex gap-2">
      {(["analysers", "kits"] as const).map((k) => (
        <Link
          key={k}
          href={k === "kits" ? "/lab/quality/qc?tab=kits" : "/lab/quality/qc"}
          aria-current={tab === k ? "page" : undefined}
          className={cn(
            buttonVariants({ variant: tab === k ? "soft" : "secondary", size: "sm" }),
            "min-h-11 sm:min-h-8",
          )}
        >
          {k === "kits"
            ? `${Q.qc.tabs.kits} ${kits.length}`
            : `${Q.qc.tabs.analysers} ${plans.rows.length}`}
        </Link>
      ))}
    </nav>
  );
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={`${scope.hospitalName} · ${LAB.place}`} placeInTopBar title={Q.qc.title} />
      {tabs}
      {tab === "analysers" ? (
        <>
          <RecordList
            caption={Q.qc.tabs.analysers}
            rows={plans.rows}
            rowKey={(r) => r.configId}
            empty={Q.today.none}
            columns={[
              {
                id: "what",
                header: Q.today.columns[0]!,
                cell: (r) => (
                  <Link
                    href={`/lab/quality/qc/run?device=${r.deviceId}&concept=${encodeURIComponent(r.conceptId)}`}
                    className={link}
                  >
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
          {lead ? (
            <section aria-labelledby="new-plan" className={card}>
              <h2 id="new-plan" className="text-heading-s font-medium">
                {Q.qc.newPlan}
              </h2>
              {/* A plain GET form: the run page holds the plan editor. */}
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
                    {plans.analysers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.model}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-body-s flex flex-col gap-1">
                  <span className="text-muted-foreground">{Q.qc.analyte}</span>
                  <input
                    name="concept"
                    required
                    pattern="obs\.[a-z0-9_]+"
                    placeholder="obs.potassium"
                    className="border-input bg-card text-body-s min-h-11 rounded-sm border px-2 font-mono sm:min-h-9"
                  />
                </label>
                <button type="submit" className={cn(buttonVariants(), "min-h-11 sm:min-h-9")}>
                  {Q.qc.open}
                </button>
              </form>
            </section>
          ) : null}
          {lead && plans.drafts.length ? (
            <section aria-labelledby="drafts" className={card}>
              <h2 id="drafts" className="text-heading-s font-medium">
                {Q.qc.drafts}
              </h2>
              <ul className="flex flex-col gap-3">
                {plans.drafts.map((d) => {
                  const m = draftMeta.get(d.id);
                  return (
                    <li key={d.id} className="text-body-s flex flex-col gap-1">
                      <span>{`${d.analyte} on ${d.device}`}</span>
                      {m?.lead ? (
                        <span className="text-muted-foreground">
                          Signed by the lead; waiting for the CSO.
                        </span>
                      ) : (
                        <SignDraft configId={d.id} author={m?.authoredBy === scope.userId} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          <section aria-labelledby="policy" className={card}>
            <h2 id="policy" className="text-heading-s font-medium">
              {Q.qc.policy}
            </h2>
            <p className="text-body-s text-muted-foreground">{Q.qc.policyLede}</p>
            <p className="text-body-s">
              {plans.policy
                ? `${plans.policy.minRunsForTarget} accepted runs over ${plans.policy.minDaysForTarget} days · ${plans.policy.sources.join("; ")}`
                : Q.qc.policyNone}
            </p>
            {lead ? <PolicyDialog initial={plans.policyDraft?.payload ?? plans.policy} /> : null}
            {lead && plans.policyDraft && !draftMeta.get(plans.policyDraft.id)?.lead ? (
              <SignDraft
                configId={plans.policyDraft.id}
                author={draftMeta.get(plans.policyDraft.id)?.authoredBy === scope.userId}
              />
            ) : null}
          </section>
        </>
      ) : (
        <>
          <RecordList<KitRow>
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
                    {lead ? (
                      <KitRuleDialog
                        itemId={k.id}
                        name={k.name}
                        initial={k.draft?.payload ?? k.rule}
                      />
                    ) : null}
                    {lead && k.draft ? (
                      <SignDraft
                        configId={k.draft.id}
                        author={draftMeta.get(k.draft.id)?.authoredBy === scope.userId}
                      />
                    ) : null}
                  </span>
                ),
              },
              {
                id: "why",
                header: Q.kits.columns[1]!,
                cell: ({ k, l }) =>
                  !k.rule ? (
                    <QcChip tone="amber">{Q.kits.noRule}</QcChip>
                  ) : (
                    (l?.due ?? [])
                      .map((d) =>
                        d === "schedule"
                          ? `Weekly, ${Q.kits.weekdays[(k.rule!.triggers.find((t) => t.kind === "schedule")?.weekday ?? 1) - 1]}`
                          : Q.kits.triggers[d],
                      )
                      .join(" · ") || "—"
                  ),
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
                  l?.last
                    ? `${at(l.last.at)} · ${l.last.outcome === "pass" ? "passed" : "failed"}`
                    : "—",
              },
              {
                id: "status",
                header: Q.kits.columns[4]!,
                cell: ({ k, l }) => {
                  if (!l || !k.rule) return "—";
                  const S = Q.status;
                  const chip =
                    l.state === "quarantined" ? (
                      <QcChip tone="dark">{S.quarantined}</QcChip>
                    ) : l.due.length === 0 ? (
                      <QcChip tone="passed">{S.passed}</QcChip>
                    ) : l.state === "received" || l.state === "in_acceptance" ? (
                      <QcChip tone="amber">{S.lotNotUsable}</QcChip>
                    ) : (
                      <QcChip tone={l.blocks ? "amber" : "dashed"}>
                        {l.blocks ? S.dueFirst : S.dueToday}
                      </QcChip>
                    );
                  const answers = [
                    ...new Set([
                      ...k.conceptIds.flatMap((c) => conceptDef(c)?.answers ?? []),
                      ...k.rule.controls.flatMap((c) =>
                        "code" in c.expected ? [c.expected.code] : [],
                      ),
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
                },
              },
            ]}
          />
          <p className="text-caption text-muted-foreground">{Q.kits.caution}</p>
        </>
      )}
    </div>
  );
}
