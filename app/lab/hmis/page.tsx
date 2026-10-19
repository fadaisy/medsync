import type { StoredCell } from "@/lib/lab/hmis-store";
import type { Metadata } from "next";
import Link from "next/link";

import { StatusWord } from "@/components/emr/status-word";
import { HmisTable } from "@/components/lab/hmis-table";
import { PageHeader } from "@/components/medsync/page-header";
import { buttonVariants } from "@/components/ui/button";
import { LAB } from "@/content/lab";
import { fill, LAB3, LAB3_HMIS } from "@/content/lab-phase-3";
import { db } from "@/db";
import { testCatalogue } from "@/db/schema";
import { labHmisLiveFor } from "@/lib/lab/feature";
import { hmisForm } from "@/lib/lab/hmis-form";
import { loadHmisMonth, manualKeys } from "@/lib/lab/hmis-store";
import { cn } from "@/lib/utils";
import { dateWords, timeWords } from "../_lib/days";
import { redirectIfV2 } from "../_lib/v2-redirect";
import { QcChip } from "../quality/_components/qc-chip";
import { requireQualityScope } from "../quality/_lib/scope";
import { ActButton, CsvButton, ManualCellsDialog } from "./_components/hmis-forms";
import { dueWords, monthOptions, monthWords, validMonth } from "./_lib/month";

export const metadata: Metadata = { title: "HMIS 105 · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const H = LAB3_HMIS;
const TABS = Object.keys(H.tabs) as (keyof typeof H.tabs)[];
const card =
  "border-border bg-card shadow-card text-body-s flex flex-col gap-3 rounded-lg border p-4";
const link = "font-medium text-teal-700 underline-offset-4 hover:underline";

/**
 * HMIS 105, laboratory (Lab Phase 3 §5.11, artboard 11; labHmis): the month, its status, "Changed since signing"
 * with Prepare revision, the section tabs, the table (every number opens its records), how the numbers are
 * counted, what is still entered by hand, and Send (due date, print, CSV, check). The In-Charge signs at /hmis.
 */
export default async function HmisPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; tab?: string; rev?: string }>;
}) {
  // The form's section was `tab`; in Reports `tab` names the place's tab, so the section travels as `part`.
  const old = await searchParams;
  await redirectIfV2(
    `/lab/reports?${new URLSearchParams({ tab: "hmis", ...(old.tab ? { part: old.tab } : {}) })}`,
    { month: old.month, rev: old.rev },
  );
  const { scope } = await requireQualityScope(labHmisLiveFor);
  const p = scope.access.permissions;
  const lead = p.has("lab.hmis.check") || p.has("lab.manage");
  const now = new Date();
  const sp = await searchParams;
  const month = validMonth(sp.month, now);
  const tab = TABS.find((t) => t === sp.tab) ?? "10.2";
  const f = hmisForm();
  const [v, tests] = await db.transaction(async (t) =>
    Promise.all([
      loadHmisMonth(t as never, scope.hospitalId, month, f),
      t.select({ code: testCatalogue.code, name: testCatalogue.display }).from(testCatalogue),
    ]),
  );
  const testNames = Object.fromEntries(tests.map((t) => [t.code, t.name]));
  const latest = v.revisions[0] ?? null;
  const shown = v.revisions.find((r) => String(r.revision) === sp.rev) ?? latest;
  const cells = (shown?.cells ?? {}) as Record<string, StoredCell>;
  const status = !shown
    ? H.status.none
    : shown.state === "signed" || shown.state === "exported"
      ? fill(H.status[shown.state], { date: dateWords(shown.signedAt!) })
      : H.status[shown.state as "draft" | "checked"];
  const q = (o: Record<string, string>) =>
    `/lab/hmis?${new URLSearchParams({ month, tab, ...(shown ? { rev: String(shown.revision) } : {}), ...o })}`;
  const labelOf = (key: string) => {
    const [row, column] = key.split("|");
    const r = f.form.rows.find((x) => (x.code ?? x.label) === row);
    return `${r?.code ? `${r.code} ` : ""}${r?.label ?? testNames[row!] ?? row} · ${column}`;
  };
  const hand = manualKeys(f.form).map((key) => ({
    key,
    label: labelOf(key),
    value: (latest?.manual as Record<string, number> | undefined)?.[key] ?? null,
  }));
  const editable = latest?.state === "draft";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title={H.title}
        subline={`${monthWords(month)} · as of ${dateWords(now)} ${timeWords(now)}`}
        right={
          <form className="flex items-end gap-2" action="/lab/hmis">
            <label className="text-body-s flex flex-col gap-1">
              <span className="text-muted-foreground">Month</span>
              <select
                name="month"
                defaultValue={month}
                className="border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 rounded-sm border px-2 outline-none sm:min-h-9"
              >
                {monthOptions(now).map((m) => (
                  <option key={m} value={m}>
                    {monthWords(m)}
                  </option>
                ))}
              </select>
            </label>
            <input type="hidden" name="tab" value={tab} />
            <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Show
            </button>
          </form>
        }
      />
      <p className="text-body-s text-muted-foreground max-w-[75ch]">{H.lede}</p>
      <div className="flex flex-wrap items-center gap-3">
        {shown?.state === "signed" || shown?.state === "exported" ? (
          <QcChip tone="passed">{status}</QcChip>
        ) : (
          <QcChip tone="dashed">{status}</QcChip>
        )}
        {shown && shown.revision > 1 ? (
          <StatusWord>{fill(H.status.revision, { n: shown.revision })}</StatusWord>
        ) : null}
        {!f.form.verified ? <StatusWord tone="caution">{H.unverified}</StatusWord> : null}
        {shown && !shown.mappingConfigId ? (
          <StatusWord tone="caution">{H.mappingUnsigned}</StatusWord>
        ) : null}
        <Link href="/lab/hmis/mapping" className={link}>
          {H.mapping}
        </Link>
      </div>

      {v.changed?.changes.length ? (
        <section
          aria-labelledby="changed"
          className="border-status-caution-fg bg-status-caution-bg text-body-s flex flex-col gap-2 rounded-lg border p-4"
        >
          <h2 id="changed" className="text-heading-s font-medium">
            <StatusWord tone="caution">Changed since signing</StatusWord>
          </h2>
          <p>
            {fill(LAB3.hmisChanged, {
              n: v.changed.changes.length,
              reason: v.changed.downtime ? H.changedReason.downtime : H.changedReason.other,
            }).replaceAll("**", "")}
          </p>
          <ul className="flex flex-col gap-1">
            {v.changed.changes.map((c) => (
              <li key={c.key} className="tabular-nums">
                {fill(H.changeLine, {
                  cell: labelOf(c.key),
                  old: c.old ?? "blank",
                  new: c.new ?? "blank",
                })}{" "}
                <span className="text-muted-foreground">
                  ({c.added.length} added, {c.removed.length} removed)
                </span>
              </li>
            ))}
          </ul>
          {lead && latest && latest.state !== "draft" && latest.state !== "checked" ? (
            <ActButton
              label={H.prepareRevision}
              okText={H.revisionReady}
              kind="revision"
              month={month}
            />
          ) : null}
        </section>
      ) : null}

      <nav aria-label="Sections" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t}
            href={q({ tab: t })}
            aria-current={tab === t ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: tab === t ? "soft" : "secondary", size: "sm" }),
            )}
          >
            {H.tabs[t]}
          </Link>
        ))}
      </nav>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section
          aria-label={H.tabs[tab]}
          className="border-border bg-card shadow-card min-w-0 rounded-lg border p-4"
        >
          {!v.mapping ? (
            <p className="text-body-s">{H.noMapping}</p>
          ) : !shown ? (
            <p className="text-body-s">{H.status.none}</p>
          ) : (
            <HmisTable
              form={f.form}
              section={tab}
              cells={cells}
              testNames={testNames}
              drill={(key) =>
                `/lab/hmis/records?${new URLSearchParams({ month, rev: String(shown.revision), key })}`
              }
            />
          )}
          {tab === "10.3" && v.purposeNotRecorded ? (
            <p className="text-body-s pt-3">
              {fill(H.purposeNotRecorded, { n: v.purposeNotRecorded })}
            </p>
          ) : null}
        </section>

        <aside className="flex flex-col gap-4">
          <section aria-labelledby="send" className={card}>
            <h2 id="send" className="text-heading-s font-medium">
              {H.send}
            </h2>
            <p>{fill(H.due, { date: dueWords(month) })}</p>
            {lead &&
            v.mapping &&
            (!latest || latest.state === "draft" || latest.state === "checked") ? (
              <ActButton
                label={latest ? H.recount : H.generate}
                okText={H.generated}
                kind="generate"
                month={month}
                variant={latest ? "secondary" : "primary"}
              />
            ) : null}
            {lead && latest?.state === "draft" ? (
              <ActButton
                label={H.check}
                okText={H.checked}
                variant="primary"
                kind="check"
                month={month}
                revision={latest.revision}
              />
            ) : null}
            {shown ? (
              <>
                <Link
                  href={`/lab/hmis/print?${new URLSearchParams({ month, rev: String(shown.revision) })}`}
                  className={link}
                >
                  {H.printForm}
                </Link>
                {lead ? <CsvButton month={month} revision={shown.revision} from="lab" /> : null}
                {f.form.rows.some((r) => r.cells.some((c) => !c.dataElement)) ? (
                  <p className="text-caption text-muted-foreground">{H.csvNote}</p>
                ) : null}
              </>
            ) : null}
          </section>
          <section aria-labelledby="how" className={card}>
            <h2 id="how" className="text-heading-s font-medium">
              {H.howCounted}
            </h2>
            <ol className="flex list-[lower-alpha] flex-col gap-1 pl-5">
              {LAB3.hmisCountingRules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
            <p className="text-caption text-muted-foreground">{H.cron}</p>
          </section>
          <section aria-labelledby="hand" className={card}>
            <h2 id="hand" className="text-heading-s font-medium">
              {H.handEntered}
            </h2>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {H.hand.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            {lead && editable ? <ManualCellsDialog month={month} cells={hand} /> : null}
          </section>
          {v.unmapped.length ? (
            <section aria-labelledby="unmapped" className={card}>
              <h2 id="unmapped" className="text-heading-s font-medium">
                <StatusWord tone="caution">{H.unmapped}</StatusWord>
              </h2>
              <ul className="flex flex-col gap-1">
                {v.unmapped.map((u) => (
                  <li key={u}>
                    {fill(H.unmappedLine, {
                      what: u.startsWith("test:")
                        ? (testNames[u.slice(5)] ?? u)
                        : u.replace(":", ": "),
                    })}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {v.revisions.length > 1 ? (
            <section aria-labelledby="revisions" className={card}>
              <h2 id="revisions" className="text-heading-s font-medium">
                {H.revisions}
              </h2>
              <ul className="flex flex-col gap-1">
                {v.revisions.map((r) => (
                  <li key={r.revision}>
                    <Link href={q({ rev: String(r.revision) })} className={link}>
                      {fill(H.status.revision, { n: r.revision })}
                    </Link>{" "}
                    · {r.state}
                    {r.signedAt ? ` ${dateWords(r.signedAt)}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
