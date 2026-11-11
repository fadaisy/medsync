import type { PharmacyActor } from "@/lib/pharmacy/write";
import Link from "next/link";

import {
  PrintSheetsDialog,
  RecordDowntimeDialog,
  RecordDrillDialog,
  VoidSheetDialog,
} from "@/app/pharmacy/downtime/_components/downtime-dialogs";
import { RowForm } from "@/app/pharmacy/downtime/_components/row-form";
import { EmptyState, Panel, Pill } from "@/components/tide/work/kit";
import { DOWNTIME_PAGE as D, DOWNTIME_ENTRY as E } from "@/content/pharmacy-golive";
import { RC } from "@/content/pharmacy-rework-records";
import { identitiesFor } from "@/lib/emr/read/results";
import { appDb } from "@/lib/pharmacy/audit/read";
import { pharmacySheetLabel, staleUnusedSheets } from "@/lib/pharmacy/downtime";
import { loadSheetEntry, SUPPLIER_CADRES } from "@/lib/pharmacy/downtime-entry";
import { loadDowntimePage, STATE_WORDS } from "@/lib/pharmacy/downtime-store";
import { pharmacyDowntimeLiveFor } from "@/lib/pharmacy/feature";
import { cadreNames } from "@/lib/pharmacy/read";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";

const S = RC.sheets;
const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: DEFAULT_TIME_ZONE,
});
const link =
  "text-body-s text-primary inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline";

/**
 * Records › Paper sheets (PRD §6.6): the old downtime store and dialogs under the new page. `?sheet=N` opens one sheet's
 * row-by-row entry here (the old enter page sends its links here). No page heading: the shell owns it.
 */
export async function SheetsView({
  actor,
  sheet,
  manages,
}: {
  actor: PharmacyActor;
  sheet: number | null;
  manages: boolean;
}) {
  if (!pharmacyDowntimeLiveFor(actor.hospitalId)) return <EmptyState title={S.off} />;
  if (!actor.access.permissions.has("pharmacy.dispense") || !actor.pointId)
    return <EmptyState title={S.noPoint} />;
  return sheet ? (
    <SheetEntry actor={actor} pointId={actor.pointId} number={sheet} />
  ) : (
    <SheetList actor={actor} pointId={actor.pointId} manages={manages} />
  );
}

async function SheetList({
  actor,
  pointId,
  manages,
}: {
  actor: PharmacyActor;
  pointId: string;
  manages: boolean;
}) {
  const data = await loadDowntimePage(actor.hospitalId, pointId);
  const toEnter = data.sheets.filter((s) => s.state === "to_enter").length;
  const unused = data.sheets
    .filter((s) => s.state === "unused")
    .sort((a, b) => a.number - b.number)
    .map((s) => ({ number: s.number, label: pharmacySheetLabel(s.number) }));
  const stale = manages ? staleUnusedSheets(data.sheets, localDate(new Date())) : [];
  const periodOf = new Map(data.periods.map((p) => [p.id, p]));
  const note = (s: (typeof data.sheets)[number]) => {
    if (s.state === "voided") return s.voidedReason ?? "";
    if (s.state === "complete" && s.completedAt) return when.format(s.completedAt);
    const p = s.periodId ? periodOf.get(s.periodId) : null;
    return p ? `${when.format(p.startsAt)} – ${when.format(p.endsAt)}` : "";
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-s text-ink-700 max-w-prose">{S.note}</p>
      <div className="flex flex-wrap gap-2">
        <PrintSheetsDialog />
        {manages ? <RecordDowntimeDialog unused={unused} /> : null}
        <RecordDrillDialog />
        {manages && unused.length ? <VoidSheetDialog unused={unused} /> : null}
      </div>
      {stale.length ? (
        <Panel title={D.staleHeading}>
          <p className="text-body-s text-ink-700">
            {stale.map((s) => pharmacySheetLabel(s.number)).join(", ")}. {D.stale}
          </p>
        </Panel>
      ) : null}

      <Panel title={S.sheetsTitle} note={S.toEnter(toEnter)}>
        {data.sheets.length === 0 ? (
          <EmptyState compact title={S.none} next={S.noneNext} />
        ) : (
          <ul className="divide-border flex flex-col divide-y">
            {data.sheets.map((s) => (
              <li
                key={s.number}
                className="grid gap-x-3 gap-y-1 py-2 sm:grid-cols-[8rem_9rem_9rem_minmax(0,1fr)_auto] sm:items-center"
              >
                <span className="text-body-s font-mono">{pharmacySheetLabel(s.number)}</span>
                <span>
                  <Pill tone={s.state === "to_enter" ? "caution" : "neutral"} glyph={null}>
                    {STATE_WORDS[s.state]}
                  </Pill>
                </span>
                <span className="text-caption tabular-nums">{when.format(s.reservedAt)}</span>
                <span className="text-caption text-ink-700">{note(s)}</span>
                <span>
                  {s.state === "to_enter" ? (
                    <Link
                      href={`/pharmacy/records?tab=sheets&sheet=${s.number}`}
                      prefetch={false}
                      className={link}
                    >
                      {S.enter}
                      <span className="sr-only"> {pharmacySheetLabel(s.number)}</span>
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={D.periodsHeading}>
          {data.periods.length === 0 ? (
            <EmptyState compact title={D.noPeriods} />
          ) : (
            <ul className="divide-border text-body-s flex flex-col divide-y">
              {data.periods.map((p) => (
                <li key={p.id} className="flex flex-wrap gap-x-3 py-2">
                  <span className="tabular-nums">
                    {when.format(p.startsAt)} – {when.format(p.endsAt)}
                  </span>
                  <span className="text-muted-foreground">{D.reasons[p.reason] ?? p.reason}</span>
                  {p.note ? <span className="text-muted-foreground">{p.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={D.drillsHeading}>
          {data.drills.length === 0 ? (
            <EmptyState compact title={D.noDrills} />
          ) : (
            <ul className="divide-border text-body-s flex flex-col divide-y">
              {data.drills.map((d) => (
                <li key={d.id} className="flex flex-col gap-0.5 py-2">
                  <span className="tabular-nums">{d.heldOn}</span>
                  <span>{d.whatWasDone}</span>
                  <span className="text-muted-foreground">{d.participants}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

async function SheetEntry({
  actor,
  pointId,
  number,
}: {
  actor: PharmacyActor;
  pointId: string;
  number: number;
}) {
  const sheet = await loadSheetEntry(actor.hospitalId, pointId, number);
  if (!sheet)
    return (
      <EmptyState
        title={E.notToEnter}
        action={
          <Link href="/pharmacy/records?tab=sheets" className={link}>
            {S.back}
          </Link>
        }
      />
    );
  const [ids, names] = await Promise.all([
    identitiesFor(
      actor,
      sheet.rows.map((r) => r.patientUserId),
      "pharmacy_downtime_entry",
    ),
    cadreNames(appDb()),
  ]);
  const label = pharmacySheetLabel(number);
  const nextRow = (section: "supply" | "not_supplied") =>
    Math.max(0, ...sheet.rows.filter((r) => r.section === section).map((r) => r.row ?? 0)) + 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-heading-s">{E.title(label)}</h2>
        <Link href="/pharmacy/records?tab=sheets" prefetch={false} className={link}>
          {S.back}
        </Link>
      </div>
      {sheet.state === "to_enter" ? (
        <RowForm
          sheet={number}
          sheetLabel={label}
          nextRow={{ supply: nextRow("supply"), not_supplied: nextRow("not_supplied") }}
          products={sheet.products}
          batches={sheet.batches}
          cadres={SUPPLIER_CADRES.map((code) => ({ code, name: names.get(code) ?? code }))}
          today={localDate(new Date())}
          timeZone={DEFAULT_TIME_ZONE}
          cadreName={actor.cadreName}
        />
      ) : (
        <EmptyState compact title={E.notToEnter} />
      )}
      <Panel title={S.entered}>
        {sheet.rows.length === 0 ? (
          <EmptyState compact title={E.noRows} />
        ) : (
          <ul className="divide-border flex flex-col divide-y">
            {sheet.rows.map((r, i) => {
              const who = ids.get(r.patientUserId);
              return (
                <li
                  key={i}
                  className="grid gap-x-3 gap-y-0.5 py-2 sm:grid-cols-[9rem_3rem_minmax(0,1fr)_minmax(0,1.2fr)_9rem]"
                >
                  <span className="text-caption">{E.sections[r.section]}</span>
                  <span className="text-caption tabular-nums">{r.row ?? ""}</span>
                  <span className="text-body-s">{who ? E.foundAs(who.name, who.mrn) : ""}</span>
                  <span className="text-body-s">
                    {r.medicine}{" "}
                    {r.detail ? <span className="text-ink-700">· {r.detail}</span> : null}
                    {r.paper ? (
                      <span className="text-caption text-muted-foreground block">
                        {E.transcribed}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-caption tabular-nums">
                    {r.suppliedAt ? when.format(new Date(r.suppliedAt)) : ""}
                    <span className="text-muted-foreground block">
                      {when.format(new Date(r.enteredAt))}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
