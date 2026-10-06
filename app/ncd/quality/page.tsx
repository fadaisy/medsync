import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { can } from "@/lib/ncdreg/context";
import { AUDIT_FIELDS, auditSample, mergeRequests, queryList } from "@/lib/ncdreg/quality";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { fmtDate, Page, PageTitle } from "../_components/kit";
import { AuditSample } from "./_components/audit-sample";
import { MergePanel } from "./_components/merge-panel";
import { QueryList } from "./_components/query-list";

export const metadata: Metadata = { title: "Data quality" };

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/** G3, G4, A7: the query list, the monthly audit sample, and duplicate review with four-eyes merge. */
export default async function QualityPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; queries?: string }>;
}) {
  const { ctx } = await requireNcdScope();
  const dq = can(ctx, "data_quality", "audit_view");
  const merge = can(ctx, "merge_request", "merge_approve");
  if (!dq && !merge) notFound();
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : ctx.today.slice(0, 7);
  const qStatus = sp.queries === "closed" ? "closed" : "open";
  const [queries, sample, merges] = await Promise.all([
    dq ? queryList(ctx, qStatus) : null,
    dq ? auditSample(ctx, month) : null,
    merge || dq ? mergeRequests(ctx) : null,
  ]);
  return (
    <Page>
      <PageTitle
        place="quality"
        title="Data quality"
        subline={`Queries, the monthly audit sample and duplicate records · as at ${fmtDate(ctx.today)}`}
      />
      {queries ? (
        <QueryList
          status={qStatus}
          canResolve={can(ctx, "data_quality")}
          rows={queries.map((q) => ({
            id: q.id,
            personId: q.personId,
            ruleText: q.ruleText,
            status: q.status,
            note: q.resolutionNote,
            created: q.createdAt.toISOString().slice(0, 10),
            name: q.identity?.name ?? "Unknown",
            registryNumber: q.identity?.registryNumber ?? "",
          }))}
        />
      ) : null}
      {sample ? (
        <AuditSample
          month={month}
          monthLabel={monthLabel(month)}
          seed={sample.seed}
          canCheck={can(ctx, "data_quality")}
          fields={AUDIT_FIELDS.map((f) => ({ key: f.key, label: f.label }))}
          agreement={sample.agreement}
          rows={sample.rows.map((r) => ({
            id: r.id,
            personId: r.personId,
            visitDate: r.visitDate,
            name: r.identity?.name ?? "Unknown",
            registryNumber: r.identity?.registryNumber ?? "",
            fields: r.fieldAgreement ?? null,
          }))}
        />
      ) : null}
      {merges ? (
        <MergePanel
          userId={ctx.userId}
          canRequest={can(ctx, "merge_request", "merge_approve")}
          canApprove={can(ctx, "merge_approve")}
          rows={merges.map((m) => ({
            id: m.id,
            personId: m.personId,
            status: m.status,
            reason: m.reason,
            requestedBy: m.requestedBy,
            requestedAt: m.requestedAt.toISOString().slice(0, 10),
            survivor: m.survivor ? `${m.survivor.name} · ${m.survivor.registryNumber}` : "Unknown",
            loser: m.loser ? `${m.loser.name} · ${m.loser.registryNumber}` : "Unknown",
          }))}
        />
      ) : null}
    </Page>
  );
}
