import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LockIcon } from "lucide-react";

import { can } from "@/lib/ncdreg/context";
import { addMonths } from "@/lib/ncdreg/indicators/engine";
import { monthLong, monthlyReport, tableSections } from "@/lib/ncdreg/read/dashboard";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { fmtDate, Page, PageTitle } from "../../_components/kit";
import { IndicatorTable } from "../../dashboard/_components/indicator-table";
import { PrintButton, SignForm } from "./_components/sign-form";

export const metadata: Metadata = { title: "Monthly report · NCD registry" };

/** F5: the print-ready monthly report; the registry lead signs it in-app and signing locks the month. */
export default async function MonthlyReportPage({ params }: { params: Promise<{ month: string }> }) {
  const { ctx, hospitalName } = await requireNcdScope();
  if (!can(ctx, "report_view", "aggregate_view", "report_sign")) notFound();
  const { month } = await params;
  const current = ctx.today.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > current) notFound();
  const r = await monthlyReport(ctx, month);
  const monthText = monthLong(month);
  const ended = month < current;

  return (
    <Page className="print:max-w-none print:px-0 print:py-0">
      <nav aria-label="Months" className="text-caption text-ink-700 flex items-center gap-4 print:hidden">
        <Link href="/ncd/dashboard" className="underline-offset-2 hover:underline">
          Dashboard
        </Link>
        <Link href={`/ncd/report/${addMonths(month, -1)}`} className="underline-offset-2 hover:underline">
          Previous month
        </Link>
        {month < current ? (
          <Link href={`/ncd/report/${addMonths(month, 1)}`} className="underline-offset-2 hover:underline">
            Next month
          </Link>
        ) : null}
      </nav>
      <PageTitle
        title={`Monthly report, ${monthText}`}
        subline={`${hospitalName} · NCD registry · indicator definitions ${r.definitionVersion}`}
        right={<PrintButton />}
      />
      <section aria-label="Sign-off" className="border-border flex flex-col gap-2 rounded-lg border px-4 py-3 print:border-ink-300">
        {r.signed ? (
          <p className="text-body-s text-foreground flex items-center gap-2">
            <LockIcon className="text-ink-600 size-4" aria-hidden />
            Signed by {r.signed.by} on {fmtDate(r.signed.at.toISOString().slice(0, 10))}. This month is locked: corrections made afterwards appear in the next period.
          </p>
        ) : (
          <>
            <p className="text-body-s text-ink-700">
              Not signed. {ended ? "Figures are computed live and can still change." : "The month has not ended; figures so far."}
            </p>
            {can(ctx, "report_sign") && ended ? <SignForm month={month} monthText={monthText} /> : null}
          </>
        )}
        {!r.view.canDrill ? <p className="text-caption text-muted-foreground">Counts from 1 to 4 show as 1–4 and carry no percentage, except where every person counted is synthetic.</p> : null}
      </section>
      <IndicatorTable sections={tableSections(r.view, r.results, r.modules, ctx.catalogue)} className="print:text-[11px]" />
    </Page>
  );
}
