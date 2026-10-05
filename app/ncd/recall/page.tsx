import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PhoneCallIcon, PhoneIcon, UserCheckIcon } from "lucide-react";

import { StatCard } from "@/components/medsync/stat-card";
import { can } from "@/lib/ncdreg/context";
import { computeReport } from "@/lib/ncdreg/indicators/snapshot";
import { recallList } from "@/lib/ncdreg/read/views";
import { templateFor } from "@/lib/ncdreg/recall/templates";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { EmptyState, fmtDate, fmtShort, Page, PageTitle } from "../_components/kit";
import { RecallBoard } from "./_components/recall-board";

export const metadata: Metadata = { title: "Recall" };

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "no denominator");

/** E1, E2, §11.3 item 7: the three recall figures, the overdue list, and "Log a call" beside it. */
export default async function RecallPage() {
  const { ctx } = await requireNcdScope();
  if (!can(ctx, "recall_work")) notFound();
  const monthStart = `${ctx.today.slice(0, 7)}-01`;
  const [report, rows, template] = await Promise.all([
    computeReport(ctx, monthStart, { asOf: ctx.today, dataCutoff: ctx.today }),
    recallList(ctx),
    templateFor(ctx, "missed_visit"),
  ]);
  const r = (code: string) => ({
    num: report.results[code]?.num ?? 0,
    den: report.results[code]?.den ?? 0,
  });
  const c13 = r("C13");
  const c14 = r("C14");
  const c15 = r("C15");
  const first = fmtShort(monthStart);
  return (
    <Page>
      <PageTitle
        title="Recall"
        subline={`Overdue list as at ${fmtDate(ctx.today)} · longest overdue first`}
        right={
          can(ctx, "code_list_manage", "sms_template_approve") ? (
            <Link
              href="/ncd/recall/templates"
              className="text-label text-teal-text underline-offset-4 hover:underline"
            >
              SMS templates
            </Link>
          ) : null
        }
      />
      <section aria-label="Recall figures for this month" className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={`Overdue on ${first}`}
          value={`${c13.num} / ${c13.den}`}
          hint={`Patients under care with a missed appointment (${pct(c13.num, c13.den)})`}
          icon={<PhoneIcon />}
          domain="patients"
          share={c13.den ? c13.num / c13.den : 0}
        />
        <StatCard
          label="Called this month"
          value={`${c14.num} / ${c14.den}`}
          hint={`Unique overdue patients called since ${first} (${pct(c14.num, c14.den)})`}
          icon={<PhoneCallIcon />}
          domain="patients"
          share={c14.den ? c14.num / c14.den : 0}
        />
        <StatCard
          label="Returned to care"
          value={`${c15.num} / ${c15.den}`}
          hint={`Visit within 15 days of the first call (${pct(c15.num, c15.den)})`}
          icon={<UserCheckIcon />}
          domain="patients"
          share={c15.den ? c15.num / c15.den : 0}
        />
      </section>
      {rows.length ? (
        <RecallBoard
          rows={rows}
          today={ctx.today}
          catalogue={ctx.catalogue}
          canReveal={can(ctx, "identifier_reveal")}
          canRecordEvent={can(ctx, "event_write")}
          template={
            template ? { body: template.body, approved: template.status === "approved" } : null
          }
        />
      ) : (
        <EmptyState title="No one is overdue">
          <p className="text-body-s text-muted-foreground">
            Patients whose appointment passed with no visit since appear here, longest overdue
            first.
          </p>
        </EmptyState>
      )}
    </Page>
  );
}
