import type { LabTechScope } from "@/lib/lab-tech/scope";
import type { StoredCell } from "@/lib/lab/hmis-store";
import type { ReactNode } from "react";
import Link from "next/link";

import { HmisTable } from "@/components/lab/hmis-table";
import { fill, LAB3, LAB3_HMIS } from "@/content/lab-phase-3";
import { LABWS2_REPORTS } from "@/content/lab-workspace-v2-reports";
import { db } from "@/db";
import { testCatalogue } from "@/db/schema";
import { hmisForm } from "@/lib/lab/hmis-form";
import { loadHmisMonth, manualKeys } from "@/lib/lab/hmis-store";
import { dayOf } from "@/lib/lab/stock";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { EmptyState, Panel, Pill } from "../../_components/v2/kit";
import { PeriodPicker } from "../../_components/v2/period-picker";
import { FilterChips, SpaceHeader } from "../../_components/v2/space";
import { dateWords, timeWords } from "../../_lib/days";
import { ActButton, CsvButton, ManualCellsDialog } from "../../hmis/_components/hmis-forms";
import { dueWords, monthOptions, monthWords, validMonth } from "../../hmis/_lib/month";

const H = LAB3_HMIS;
const C = LABWS2_REPORTS.hmis;
const PARTS = Object.keys(H.tabs) as (keyof typeof H.tabs)[];
const LINK = "text-primary font-medium underline-offset-4 hover:underline";

/**
 * Reports → HMIS 105 (prompt 5.9): the old /lab/hmis re-laid in the place. Same loads, same actions (count,
 * check, prepare revision, hand counts, CSV export), same prints and drill-downs, now at /lab/reports/hmis/*.
 * The month is the period picker in month mode; the form's sections are chips under `part` (the old `tab`,
 * renamed because `tab` now names the place's tab).
 */
export async function HmisView({
  scope,
  sp,
  tabs,
}: {
  scope: LabTechScope;
  sp: { month?: string; part?: string; rev?: string };
  tabs: ReactNode;
}) {
  const p = scope.access.permissions;
  const lead = p.has("lab.hmis.check") || p.has("lab.manage");
  const now = new Date();
  const today = dayOf(now, DEFAULT_TIME_ZONE);
  const month = validMonth(sp.month, now);
  const part = PARTS.find((t) => t === sp.part) ?? "10.2";
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
  const signed = shown?.state === "signed" || shown?.state === "exported";
  const status = !shown
    ? H.status.none
    : signed
      ? fill(H.status[shown.state as "signed" | "exported"], { date: dateWords(shown.signedAt!) })
      : H.status[shown.state as "draft" | "checked"];
  const q = (o: Record<string, string>) =>
    `/lab/reports?${new URLSearchParams({ tab: "hmis", month, part, ...(shown ? { rev: String(shown.revision) } : {}), ...o })}`;
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
  const stateWord = (s: string) => C.stateWords[s as keyof typeof C.stateWords] ?? s;

  return (
    <>
      <SpaceHeader
        tabs={tabs}
        chips={
          <PeriodPicker
            base="/lab/reports"
            keep={{ tab: "hmis", part }}
            value={{ month, range: null }}
            today={today}
            mode="month"
            months={monthOptions(now)}
          />
        }
        note={fill(C.asOf, {
          month: monthWords(month),
          time: `${dateWords(now)} ${timeWords(now)}`,
        })}
      />
      <div className="flex flex-col gap-4">
        <p className="text-body-s text-muted-foreground">{H.lede}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={signed ? "passed" : "neutral"}>{status}</Pill>
          {shown && shown.revision > 1 ? (
            <Pill>{fill(H.status.revision, { n: shown.revision })}</Pill>
          ) : null}
          {!f.form.verified ? <Pill tone="caution">{H.unverified}</Pill> : null}
          {shown && !shown.mappingConfigId ? <Pill tone="caution">{H.mappingUnsigned}</Pill> : null}
          <Link href="/lab/setup/hmis-mapping" className={`${LINK} text-body-s`}>
            {H.mapping}
          </Link>
        </div>

        {v.changed?.changes.length ? (
          <Panel title={<Pill tone="caution">{C.changed}</Pill>} labelledBy="changed">
            <p className="text-body-s">
              {fill(LAB3.hmisChanged, {
                n: v.changed.changes.length,
                reason: v.changed.downtime ? H.changedReason.downtime : H.changedReason.other,
              }).replaceAll("**", "")}
            </p>
            <ul className="text-body-s flex flex-col gap-1">
              {v.changed.changes.map((c) => (
                <li key={c.key} className="tabular-nums">
                  {fill(H.changeLine, {
                    cell: labelOf(c.key),
                    old: c.old ?? C.blank,
                    new: c.new ?? C.blank,
                  })}{" "}
                  <span className="text-muted-foreground">
                    {fill(C.changeCounts, { added: c.added.length, removed: c.removed.length })}
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
          </Panel>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <Panel as="div" className="min-w-0">
            <FilterChips
              label={C.sections}
              current={part}
              chips={PARTS.map((t) => ({ key: t, label: H.tabs[t], href: q({ part: t }) }))}
            />
            {!v.mapping ? (
              <EmptyState compact title={H.noMapping} />
            ) : !shown ? (
              <EmptyState compact title={H.status.none} />
            ) : (
              <HmisTable
                form={f.form}
                section={part}
                cells={cells}
                testNames={testNames}
                textFigures
                drill={(key) =>
                  `/lab/reports/hmis/records?${new URLSearchParams({ month, rev: String(shown.revision), key })}`
                }
              />
            )}
            {part === "10.3" && v.purposeNotRecorded ? (
              <p className="text-body-s">
                {fill(H.purposeNotRecorded, { n: v.purposeNotRecorded })}
              </p>
            ) : null}
          </Panel>

          <div className="flex flex-col gap-4">
            <Panel title={H.send} labelledBy="hmis-send">
              <p className="text-body-s">{fill(H.due, { date: dueWords(month) })}</p>
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
                    href={`/lab/reports/hmis/print?${new URLSearchParams({ month, rev: String(shown.revision) })}`}
                    className={`${LINK} text-body-s`}
                  >
                    {H.printForm}
                  </Link>
                  {lead ? <CsvButton month={month} revision={shown.revision} from="lab" /> : null}
                  {f.form.rows.some((r) => r.cells.some((c) => !c.dataElement)) ? (
                    <p className="text-caption text-muted-foreground">{H.csvNote}</p>
                  ) : null}
                </>
              ) : null}
            </Panel>
            <Panel title={H.howCounted} labelledBy="hmis-how">
              <ol className="text-body-s flex list-[lower-alpha] flex-col gap-1 pl-5">
                {LAB3.hmisCountingRules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
              <p className="text-caption text-muted-foreground">{H.cron}</p>
            </Panel>
            <Panel title={H.handEntered} labelledBy="hmis-hand">
              <ul className="text-body-s flex list-disc flex-col gap-1 pl-5">
                {H.hand.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              {lead && editable ? <ManualCellsDialog month={month} cells={hand} /> : null}
            </Panel>
            {v.unmapped.length ? (
              <Panel title={<Pill tone="caution">{H.unmapped}</Pill>} labelledBy="hmis-unmapped">
                <ul className="text-body-s flex flex-col gap-1">
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
              </Panel>
            ) : null}
            {v.revisions.length > 1 ? (
              <Panel title={H.revisions} labelledBy="hmis-revisions">
                <ul className="text-body-s flex flex-col gap-1">
                  {v.revisions.map((r) => (
                    <li key={r.revision}>
                      <Link href={q({ rev: String(r.revision) })} className={LINK}>
                        {fill(H.status.revision, { n: r.revision })}
                      </Link>{" "}
                      · {stateWord(r.state)}
                      {r.signedAt ? ` ${dateWords(r.signedAt)}` : ""}
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
