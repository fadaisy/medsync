import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DownloadIcon, FileTextIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { can } from "@/lib/ncdreg/context";
import { AGE_BAND_LABELS, careBandLabels, dashboardBoard, monthLong, parseFilters, parseMonth, snapshotState, tableSections } from "@/lib/ncdreg/read/dashboard";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { HOSPITAL_PARAMS } from "@/lib/ncdreg/standard/indicators";
import { fmtDate } from "../_components/kit";
import { CompactCards, ConditionRows, HeadlineStrip } from "./_components/bands";
import { ChartBands, DashboardFrame } from "./_components/frame";
import { IndicatorTable } from "./_components/indicator-table";
import { DashboardViews } from "./_components/view-toggle";

export const metadata: Metadata = { title: "Dashboard · NCD registry" };

type Search = Record<string, string | string[] | undefined>;

const SELECT = "border-input bg-card text-label text-foreground focus-visible:shadow-focus h-8 rounded-sm border px-2 outline-none";

/** F1, F3, F6, F7: the one-screen department dashboard (§11.3 item 8). */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { ctx } = await requireNcdScope();
  if (!can(ctx, "aggregate_view", "report_view")) notFound();
  const sp = await searchParams;
  const month = parseMonth(typeof sp.month === "string" ? sp.month : null, ctx.today);
  const filters = parseFilters(sp, ctx.catalogue);
  const [b, snapshot] = await Promise.all([dashboardBoard(ctx, month, filters), snapshotState(ctx, month)]);
  const glycaemic = ctx.catalogue.find((m) => m.code === HOSPITAL_PARAMS.glycaemic_module)?.label ?? "the glycaemic condition";
  const bands = careBandLabels(ctx.catalogue);
  const filtered = Object.values(filters).some(Boolean);

  const title = (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1 className="font-display text-display-s text-foreground">Dashboard</h1>
      <span className="text-body-s text-muted-foreground">
        {monthLong(month)} ·{" "}
        {snapshot.signed ? `Signed by ${snapshot.signed.by} on ${fmtDate(snapshot.signed.at.toISOString().slice(0, 10))}` : "Snapshot not yet signed by the registry lead"}
      </span>
    </div>
  );
  const actions = (
    <>
      {can(ctx, "aggregate_export", "export_request") ? (
        <Link href="/ncd/exchange" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          <DownloadIcon aria-hidden />
          Export
        </Link>
      ) : null}
      <Link href={`/ncd/report/${month}`} className={buttonVariants({ variant: "primary", size: "sm" })}>
        <FileTextIcon aria-hidden />
        Monthly report
      </Link>
    </>
  );
  const filterForm = (
    <form action="/ncd/dashboard" method="get" className="flex flex-wrap items-center gap-2" aria-label="Month and filters">
      <label className="text-caption text-ink-700 flex items-center gap-1.5">
        Month
        <input type="month" name="month" defaultValue={month} max={ctx.today.slice(0, 7)} className={SELECT} />
      </label>
      <label className="sr-only" htmlFor="f-condition">
        Condition
      </label>
      <select id="f-condition" name="condition" defaultValue={filters.condition ?? ""} className={SELECT}>
        <option value="">All conditions</option>
        {b.enabledModules.map((m) => (
          <option key={m.code} value={m.code}>
            {m.label}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="f-sex">
        Sex
      </label>
      <select id="f-sex" name="sex" defaultValue={filters.sex ?? ""} className={SELECT}>
        <option value="">Any sex</option>
        <option value="female">Female</option>
        <option value="male">Male</option>
      </select>
      <label className="sr-only" htmlFor="f-age">
        Age band
      </label>
      <select id="f-age" name="age" defaultValue={filters.ageBand ?? ""} className={SELECT}>
        <option value="">Any age</option>
        {Object.entries(AGE_BAND_LABELS).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="f-district">
        District
      </label>
      <select id="f-district" name="district" defaultValue={filters.district ?? ""} className={SELECT}>
        <option value="">Any district</option>
        {b.districts.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="f-band">
        Care band
      </label>
      <select id="f-band" name="band" defaultValue={filters.careBand ?? ""} className={SELECT}>
        <option value="">Any care band</option>
        {Object.entries(bands).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
        Apply
      </button>
      {filtered ? (
        <Link href={`/ncd/dashboard?month=${month}`} className="text-caption text-ink-700 underline underline-offset-2">
          Clear filters
        </Link>
      ) : null}
      {!b.view.canDrill ? <span className="text-caption text-muted-foreground">Counts from 1 to 4 show as 1–4.</span> : null}
    </form>
  );

  return (
    <DashboardFrame>
      <DashboardViews
        title={title}
        actions={actions}
        filters={filterForm}
        charts={
          <ChartBands
            strip={<HeadlineStrip b={b} catalogue={ctx.catalogue} />}
            conditionsTitle="Outcomes by condition · ordered by patients under care · trends share one scale"
            conditions={<ConditionRows b={b} />}
            cards={<CompactCards b={b} catalogue={ctx.catalogue} glycaemicLabel={glycaemic} />}
          />
        }
        table={<IndicatorTable sections={tableSections(b.view, b.results, b.enabledModules, ctx.catalogue)} />}
      />
    </DashboardFrame>
  );
}
