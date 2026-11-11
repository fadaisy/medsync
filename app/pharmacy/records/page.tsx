import type { ReportBody, ReportCard } from "./_components/reports-view";
import type { ReportKind } from "@/db/schema/pharmacy-rework-records";

import { FilterChips } from "@/components/tide/work/space";
import { RC, RULES } from "@/content/pharmacy-rework-records";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { appDb, loadAudit, recordsHead } from "@/lib/pharmacy/audit/read";
import { tabOf } from "@/lib/pharmacy/ia";
import { monthOf } from "@/lib/pharmacy/losses/derive";
import { loadLosses } from "@/lib/pharmacy/losses/read";
import { REPORT_KINDS, reportIssues, reportRows } from "@/lib/pharmacy/reports/derive";
import { loadReports } from "@/lib/pharmacy/reports/read";
import { loadStocktakeReports } from "@/lib/pharmacy/store/read";
import { PageTabs } from "../_components/page-tabs";
import { pharmacyScope } from "../_lib/v2";
import { AuditView } from "./_components/audit-view";
import { LossesView } from "./_components/losses-view";
import { ReportsView } from "./_components/reports-view";
import { SheetsView } from "./_components/sheets-view";
import { StocktakeReports } from "./_components/stocktake-reports";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
const PERIODS = ["1", "7", "30", "0"] as const;

const monthLong = (ym: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${ym}-01T00:00:00Z`),
  );
const shift = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const dueOn = (ym: string, day: number) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${shift(ym, 1)}-${String(day).padStart(2, "0")}T00:00:00Z`),
  );

/**
 * Records (rework PRD §6.6): Audit trail, Losses (UGX), Paper sheets and Reports. Only the active tab's data is loaded;
 * the shell owns the heading.
 */
export default async function RecordsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = tabOf("records", sp.tab);
  const actor = await requirePharmacyActor();
  const { inCharge, toEnter } = await recordsHead(actor.hospitalId, actor.userId);

  let body;
  if (tab === "audit") {
    const per = PERIODS.find((p) => p === one(sp.per)) ?? "7";
    const events = await loadAudit(actor.hospitalId, Number(per));
    body = (
      <div className="flex flex-col gap-3">
        <FilterChips
          label={RC.audit.periodsLabel}
          current={per}
          chips={PERIODS.map((p) => ({
            key: p,
            label: RC.audit.periods[p]!,
            href: `/pharmacy/records?tab=audit&per=${p}`,
          }))}
        />
        <AuditView events={events} me={actor.userId} inCharge={inCharge} />
      </div>
    );
  } else if (tab === "losses") {
    const [losses, stocktakes] = await Promise.all([
      loadLosses(actor.hospitalId),
      loadStocktakeReports(appDb(), actor.hospitalId),
    ]);
    body = (
      <div className="flex flex-col gap-4">
        <LossesView data={losses} all={sp.all === "1"} />
        <StocktakeReports rows={stocktakes} />
      </div>
    );
  } else if (tab === "sheets") {
    const n = Number(one(sp.sheet));
    body = (
      <SheetsView
        actor={actor}
        manages={inCharge}
        sheet={Number.isInteger(n) && n > 0 ? n : null}
      />
    );
  } else {
    const now = monthOf(new Date().toISOString());
    const months = [0, -1, -2, -3].map((i) => shift(now, i));
    const month = months.find((m) => m === one(sp.month)) ?? now;
    const [{ figures, saved }, scope] = await Promise.all([
      loadReports(actor.hospitalId, month),
      pharmacyScope(),
    ]);
    const cases: Record<string, number> = {};
    for (const c of figures.cases)
      if (c.controlled && c.productId) cases[c.productId] = (cases[c.productId] ?? 0) + 1;
    const cards: ReportCard[] = REPORT_KINDS.map((kind: ReportKind) => {
      const s = saved.find((r) => r.kind === kind);
      const snap =
        s?.status === "submitted"
          ? (s.snapshot as { rows: unknown; issues: ReportCard["issues"] } | null)
          : null;
      const rows = snap?.rows ?? reportRows(kind, figures);
      return {
        kind,
        state: s?.status ?? "draft",
        due: dueOn(month, RULES.reports[kind].due),
        issues: snap?.issues ?? reportIssues(kind, figures, RULES.epiWastageRemarkPct),
        remarks: s?.remarks ?? {},
        checkedBy: s?.checkedBy ?? null,
        submittedBy: s?.submittedBy ?? null,
        submittedAt: s?.submittedAt ?? null,
        body: { kind, rows, cases } as ReportBody,
      };
    });
    body = (
      <div className="flex flex-col gap-3">
        <FilterChips
          label={RC.reports.head.period}
          current={month}
          chips={months.map((m) => ({
            key: m,
            label: monthLong(m),
            href: `/pharmacy/records?tab=reports&month=${m}`,
          }))}
        />
        <ReportsView
          month={month}
          period={monthLong(month)}
          facility={scope.hospitalName}
          cards={cards}
          inCharge={inCharge}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageTabs page="records" current={tab} counts={{ sheets: toEnter }} />
      {body}
    </div>
  );
}
