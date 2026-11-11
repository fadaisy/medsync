import type { ReportParams } from "../_lib/params";
import type { LabTechScope } from "@/lib/lab-tech/scope";
import type { ReactNode } from "react";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";

import { EmptyState, Panel } from "@/components/tide/work/kit";
import { SpaceHeader } from "@/components/tide/work/space";
import { LAB3_REPORTS } from "@/content/lab-phase-3";
import { fill } from "@/content/lab-workspace-v2";
import { LABWS2_REPORTS } from "@/content/lab-workspace-v2-reports";
import { db } from "@/db";
import { labHmisReports } from "@/db/schema";
import { periodWords } from "@/lib/lab/period";
import { dayOf } from "@/lib/lab/stock";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { loadReport } from "../_lib/load";
import { CsvButton } from "../../hmis/_components/hmis-forms";
import { monthWords, validMonth } from "../../hmis/_lib/month";
import { ReportFilters } from "./indicators";

const D = LABWS2_REPORTS.downloads;
const LINK =
  "bg-card text-foreground hover:bg-ink-50 focus-visible:shadow-focus inline-flex h-[30px] items-center rounded-full px-3 text-[13px] font-medium whitespace-nowrap shadow-[inset_0_0_0_1px_var(--color-ink-300)] outline-none";

function Row({
  title,
  detail,
  children,
}: {
  title: string;
  detail: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="border-border flex flex-wrap items-center justify-between gap-3 border-t py-3 first:border-t-0">
      <span className="flex min-w-0 flex-col">
        <span className="text-body-s text-foreground font-semibold">{title}</span>
        <span className="text-caption text-muted-foreground">{detail}</span>
      </span>
      {children}
    </li>
  );
}

/**
 * Reports → Downloads (prompt 5.9): every download and print the place offers, for the chosen period, in one
 * panel. Each one is the same file or print as on its own tab (indicators CSV, HMIS 105 CSV and form, register).
 */
export async function DownloadsView({
  scope,
  sp,
  tabs,
  reports,
  hmis,
  register,
}: {
  scope: LabTechScope;
  sp: ReportParams;
  tabs: ReactNode;
  /** Which of the place's sources are on for this viewer (the tabs' flags). */
  reports: boolean;
  hmis: boolean;
  register: boolean;
}) {
  const now = new Date();
  const today = dayOf(now, DEFAULT_TIME_ZONE);
  const p = scope.access.permissions;
  const hmisLead = p.has("lab.hmis.check") || p.has("lab.manage");
  const r = reports ? await loadReport(scope, sp, now) : null;
  const month = validMonth(r?.p.range ? r.p.range.to.slice(0, 7) : sp.month, now);
  const [latest] = hmis
    ? await db
        .select({ revision: labHmisReports.revision })
        .from(labHmisReports)
        .where(
          and(
            eq(labHmisReports.hospitalId, scope.hospitalId),
            eq(labHmisReports.month, `${month}-01`),
          ),
        )
        .orderBy(desc(labHmisReports.revision))
        .limit(1)
    : [];
  const period = r
    ? periodWords({ month: r.p.month, range: r.p.range }, today, LABWS2_REPORTS.period)
    : null;

  return (
    <>
      <SpaceHeader
        tabs={tabs}
        chips={
          r ? (
            <ReportFilters
              tab="downloads"
              p={r.p}
              today={today}
              wards={r.wards}
              sections={r.sections}
              names={r.names}
            />
          ) : null
        }
      />
      <Panel title={D.title} note={D.note} labelledBy="downloads">
        <ul className="flex flex-col">
          {r ? (
            <Row title={D.indicatorsCsv} detail={fill(D.indicatorsCsvDetail, { period: period! })}>
              <a href={r.csv.href} download={r.csv.name} className={LINK}>
                {LAB3_REPORTS.csv}
              </a>
            </Row>
          ) : null}
          {hmis && latest ? (
            <>
              <Row
                title={D.hmisCsv}
                detail={
                  hmisLead
                    ? fill(D.hmisCsvDetail, { month: monthWords(month), rev: latest.revision })
                    : D.hmisCsvLead
                }
              >
                {hmisLead ? (
                  <CsvButton month={month} revision={latest.revision} from="lab" />
                ) : null}
              </Row>
              <Row
                title={D.hmisPrint}
                detail={fill(D.hmisPrintDetail, { month: monthWords(month), rev: latest.revision })}
              >
                <Link
                  href={`/lab/reports/hmis/print?${new URLSearchParams({ month, rev: String(latest.revision) })}`}
                  className={LINK}
                >
                  {D.open}
                </Link>
              </Row>
            </>
          ) : null}
          {register ? (
            <Row title={D.registerPrint} detail={D.registerPrintDetail}>
              <Link href="/lab/reports?tab=register" className={LINK}>
                {D.open}
              </Link>
            </Row>
          ) : null}
        </ul>
        {hmis && !latest ? (
          <EmptyState compact title={fill(D.hmisNone, { month: monthWords(month) })} />
        ) : null}
      </Panel>
    </>
  );
}
