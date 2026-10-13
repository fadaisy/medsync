import type { StoredCell } from "@/lib/lab/hmis-store";
import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { StatusWord } from "@/components/emr/status-word";
import { HmisTable } from "@/components/lab/hmis-table";
import { PageHeader } from "@/components/medsync/page-header";
import { buttonVariants } from "@/components/ui/button";
import { fill, LAB3, LAB3_HMIS, LAB3_HMIS_DESK } from "@/content/lab-phase-3";
import { db } from "@/db";
import {
  hmisDesignations,
  labSignedConfigs,
  staffAffiliations,
  testCatalogue,
  users,
} from "@/db/schema";
import { asClinicalReader } from "@/lib/emr/db";
import { hmisForm } from "@/lib/lab/hmis-form";
import { hmisDeskScope } from "@/lib/lab/hmis-scope";
import { mappingKey } from "@/lib/lab/hmis-store";
import { hmisReminder } from "@/lib/lab/hmis105";
import { PAYLOADS } from "@/lib/lab/signed-config";
import { dayOf } from "@/lib/lab/stock";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { dateWords, dayWords, timeWords } from "../lab/_lib/days";
import { CsvButton } from "../lab/hmis/_components/hmis-forms";
import { dueWords, monthOptions, monthWords, validMonth } from "../lab/hmis/_lib/month";
import { CoSignMapping, Designate, EndDesignation, SignReport } from "./_components/desk-forms";

export const metadata: Metadata = { title: "HMIS 105 · MedSync" };
export const dynamic = "force-dynamic";

const D = LAB3_HMIS_DESK;
const H = LAB3_HMIS;
const TABS = Object.keys(H.tabs) as (keyof typeof H.tabs)[];
const card =
  "border-border bg-card shadow-card text-body-s flex flex-col gap-3 rounded-lg border p-4";

type Aggregate = {
  id: string;
  month: string;
  revision: number;
  state: string;
  cells: Record<string, StoredCell>;
  checked_at: string | null;
  signed_at: string | null;
};

/**
 * The HMIS desk (GATE A §4, §5.11 Send; Law 10): the Health Unit In-Charge signs the checked HMIS 105 with a
 * fresh second factor, the HMIS focal person co-signs the mapping, the hospital admin sets both designations.
 * Reports are read through `private.lab_hmis_aggregates()`: numbers only, never the records behind them.
 */
export default async function HmisDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; tab?: string }>;
}) {
  const who = await hmisDeskScope();
  const now = new Date();
  const sp = await searchParams;
  const month = validMonth(sp.month, now);
  const tab = TABS.find((t) => t === sp.tab) ?? "10.2";
  const f = hmisForm();
  const scope = { userId: who.userId, hospitalId: who.hospitalId };
  const raw = (await asClinicalReader(scope, (tx) =>
    tx.execute(
      sql`SELECT id, to_char(month, 'YYYY-MM') AS month, revision, state, cells, checked_at, signed_at
            FROM private.lab_hmis_aggregates() ORDER BY month DESC, revision DESC`,
    ),
  )) as unknown as { rows?: Aggregate[] } | Aggregate[];
  const reports = Array.isArray(raw) ? raw : (raw.rows ?? []);
  const shown = reports.find((r) => r.month === month) ?? null;
  const [mappingDraft] = who.roles.includes("focal")
    ? await db
        .select()
        .from(labSignedConfigs)
        .where(
          and(
            eq(labSignedConfigs.hospitalId, who.hospitalId),
            eq(labSignedConfigs.kind, "hmis_mapping"),
            eq(labSignedConfigs.key, mappingKey(f.form)),
            eq(labSignedConfigs.status, "draft"),
            isNotNull(labSignedConfigs.leadSignedBy),
          ),
        )
        .orderBy(desc(labSignedConfigs.version))
        .limit(1)
    : [];
  const mapping = mappingDraft
    ? (PAYLOADS.hmis_mapping.safeParse(mappingDraft.payload).data ?? null)
    : null;
  const today = dayOf(now, DEFAULT_TIME_ZONE);
  const [designations, staff, tests] = await Promise.all([
    who.admin
      ? db
          .select({
            id: hmisDesignations.id,
            role: hmisDesignations.role,
            name: users.fullName,
            startsOn: hmisDesignations.startsOn,
            endsOn: hmisDesignations.endsOn,
          })
          .from(hmisDesignations)
          .innerJoin(users, eq(users.id, hmisDesignations.userId))
          .where(eq(hmisDesignations.hospitalId, who.hospitalId))
          .orderBy(desc(hmisDesignations.setAt))
      : Promise.resolve([]),
    who.admin
      ? db
          .selectDistinct({ id: users.id, name: users.fullName })
          .from(staffAffiliations)
          .innerJoin(users, eq(users.id, staffAffiliations.userId))
          .where(
            and(
              eq(staffAffiliations.hospitalId, who.hospitalId),
              eq(staffAffiliations.state, "active"),
            ),
          )
          .orderBy(users.fullName)
      : Promise.resolve([]),
    db.select({ code: testCatalogue.code, name: testCatalogue.display }).from(testCatalogue),
  ]);
  const testNames = Object.fromEntries(tests.map((t) => [t.code, t.name]));
  const reminder = hmisReminder(
    now,
    DEFAULT_TIME_ZONE,
    reports.filter((r) => r.signed_at).map((r) => r.month),
  );
  const designated = who.roles.length > 0;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={who.hospitalName}
        title={D.title}
        subline={`${monthWords(month)} · as of ${dateWords(now)} ${timeWords(now)}`}
      />
      <p className="text-body-s text-muted-foreground max-w-[75ch]">{D.lede}</p>
      {reminder ? (
        <StatusWord tone="caution">
          {fill(H.reminder, { month: monthWords(reminder), date: dueWords(reminder) })}
        </StatusWord>
      ) : null}
      {!designated && !who.admin ? <p className="text-body-s">{D.notDesignated}</p> : null}

      <form action="/hmis" className="flex flex-wrap items-end gap-2">
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
        <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Show
        </button>
      </form>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="border-border bg-card shadow-card min-w-0 rounded-lg border p-4">
          {shown ? (
            <>
              <nav aria-label="Sections" className="flex flex-wrap gap-2 pb-3">
                {TABS.map((t) => (
                  <Link
                    key={t}
                    href={`/hmis?month=${month}&tab=${encodeURIComponent(t)}`}
                    aria-current={tab === t ? "page" : undefined}
                    className={buttonVariants({
                      variant: tab === t ? "soft" : "secondary",
                      size: "sm",
                    })}
                  >
                    {H.tabs[t]}
                  </Link>
                ))}
              </nav>
              <HmisTable
                form={f.form}
                section={tab}
                cells={shown.cells}
                drill={null}
                testNames={testNames}
              />
              <p className="text-caption text-muted-foreground pt-2">{H.captionAggregates}</p>
            </>
          ) : (
            <p className="text-body-s">{H.status.none}</p>
          )}
        </section>
        <aside className="flex flex-col gap-4">
          <section aria-labelledby="waiting" className={card}>
            <h2 id="waiting" className="text-heading-s font-medium">
              {D.waiting}
            </h2>
            {shown ? (
              <p>
                {fill(H.status.revision, { n: shown.revision })} ·{" "}
                {shown.signed_at
                  ? fill(H.status.signed, { date: dateWords(new Date(shown.signed_at)) })
                  : H.status[shown.state as "draft" | "checked"]}
              </p>
            ) : null}
            <p>{fill(H.due, { date: dueWords(month) })}</p>
            {who.roles.includes("in_charge") && shown?.state === "checked" ? (
              <SignReport month={month} revision={shown.revision} />
            ) : (
              <p className="text-muted-foreground">{D.nothingWaiting}</p>
            )}
            {shown && (designated || who.admin) ? (
              <CsvButton month={month} revision={shown.revision} from="desk" />
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
          </section>
          {mappingDraft && mapping ? (
            <section aria-labelledby="mapping" className={card}>
              <h2 id="mapping" className="text-heading-s font-medium">
                {H.mapping}
              </h2>
              <p>{D.mappingWaiting}</p>
              <ul className="flex flex-col gap-1">
                {mapping.rows.map((r) => (
                  <li key={r.code}>
                    <span className="font-mono">{r.code}</span>:{" "}
                    {r.sources.map((s) => testNames[s.testCode] ?? s.testCode).join(", ")}
                  </li>
                ))}
              </ul>
              {!f.form.verified ? <StatusWord tone="caution">{H.unverified}</StatusWord> : null}
              <CoSignMapping configId={mappingDraft.id} />
            </section>
          ) : null}
          {who.admin ? (
            <section aria-labelledby="designations" className={card}>
              <h2 id="designations" className="text-heading-s font-medium">
                {D.designations}
              </h2>
              <p className="text-muted-foreground">{D.designationsLede}</p>
              <ul className="flex flex-col gap-2">
                {designations.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {d.name} · {D.roles[d.role as "in_charge" | "focal"]} · {dayWords(d.startsOn)}
                      {d.endsOn ? ` to ${dayWords(d.endsOn)}` : ""}
                    </span>
                    {!d.endsOn ? <EndDesignation id={d.id} today={today} who={d.name} /> : null}
                  </li>
                ))}
              </ul>
              <Designate staff={staff} today={today} />
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
