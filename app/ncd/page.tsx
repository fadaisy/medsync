import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { facilityStatus } from "@/lib/ncdreg/admin";
import { can } from "@/lib/ncdreg/context";
import { DEMO_COPY } from "@/lib/ncdreg/demo/source";
import { todayClinic } from "@/lib/ncdreg/read/views";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { ClinicTable } from "./_components/clinic-table";
import { EmptyState, fmtDate, Page, PageTitle } from "./_components/kit";

export const dynamic = "force-dynamic";

/** B8 Today's clinic, the NCD home (§11.3 item 1). */
export default async function TodaysClinic({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { ctx } = await requireNcdScope();
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : ctx.today;
  const [clinic, status] = await Promise.all([todayClinic(ctx, date), facilityStatus(ctx)]);
  const empty = status.persons === 0 && !status.approved;
  return (
    <Page>
      <PageTitle
        title="Today's clinic"
        subline={fmtDate(date)}
        right={
          <>
            <span
              className="text-body-s text-ink-600 font-mono tabular-nums"
              aria-label={`${clinic.closed} of ${clinic.expected} visits closed`}
            >
              {clinic.closed} of {clinic.expected} visits closed
            </span>
            <form method="get" className="flex items-center gap-2">
              <label htmlFor="clinic-date" className="sr-only">
                Clinic date
              </label>
              <input
                id="clinic-date"
                name="date"
                type="date"
                defaultValue={date}
                className="border-input h-8 rounded-md border px-2 font-mono text-[13px]"
              />
              <Button type="submit" variant="secondary" size="md">
                Show
              </Button>
            </form>
          </>
        }
      />
      {empty ? (
        <EmptyState title={DEMO_COPY.empty_state}>
          {can(ctx, "demo_data_manage") ? (
            <Link href="/ncd/admin?demo=on#demo" className={buttonVariants({ variant: "primary" })}>
              {DEMO_COPY.switch_on}
            </Link>
          ) : null}
        </EmptyState>
      ) : (
        <ClinicTable
          rows={clinic.rows}
          date={date}
          today={ctx.today}
          canEnrol={can(ctx, "enrol")}
          timeZone={ctx.timeZone}
        />
      )}
    </Page>
  );
}
