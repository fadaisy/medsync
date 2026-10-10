import type { DoseRow } from "@/lib/pharmacy/emergency-doses";
import type { DosesPeriod } from "@/lib/pharmacy/read";

import { StatusWord } from "@/components/emr/status-word";
import { CautionNotice } from "@/components/medsync/caution-notice";
import { PageHeader } from "@/components/medsync/page-header";
import { sentenceCase } from "@/components/medsync/workspace-shell";
import { EMERGENCY_NOTICE, PHARMACY } from "@/content/pharmacy";
import { identitiesFor } from "@/lib/emr/read/results";
import { NO_CART } from "@/lib/pharmacy/emergency-doses";
import { getEmergencyDoses } from "@/lib/pharmacy/read";
import { requirePharmacyScope } from "@/lib/pharmacy/scope";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { DoseFilters } from "../_components/dose-filters";

export const dynamic = "force-dynamic";

/**
 * Emergency doses by cart (§5.5; canvas 0.3): doses given on the resus desk at this hospital, as
 * recorded there, newest first. Read-only. No stock figure is read or shown (ED-5, D-PH0-13).
 */
const E = PHARMACY.emergency;
const PERIODS: readonly DosesPeriod[] = ["today", "7d", "30d"];
const when = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: DEFAULT_TIME_ZONE,
});

export default async function EmergencyDosesPage({
  searchParams,
}: {
  searchParams: Promise<{ cart?: string; period?: string }>;
}) {
  const scope = await requirePharmacyScope();
  const sp = await searchParams;
  const period = PERIODS.includes(sp.period as DosesPeriod) ? (sp.period as DosesPeriod) : "7d";
  const cart = sp.cart ?? "all";
  const d = await getEmergencyDoses(scope.hospitalId, period, cart);
  const ids = await identitiesFor(
    scope,
    d.rows.flatMap((r) => (r.patientUserId ? [r.patientUserId] : [])),
    "pharmacy_emergency_doses",
  );
  const cadre = (userId: string | null) =>
    userId && d.cadreOf.get(userId) ? sentenceCase(d.cadreOf.get(userId)!) : E.notRecorded;
  const carts = [
    { value: "all", label: E.allCarts, count: d.total },
    ...[...d.cartCounts]
      .sort(([a], [b]) => (a === NO_CART ? 1 : b === NO_CART ? -1 : a.localeCompare(b)))
      .map(([c, n]) => ({ value: c, label: c === NO_CART ? E.noCart : c, count: n })),
  ];
  const tableId = "pharmacy-doses";
  const patient = (r: DoseRow) => {
    if (!r.patientUserId) return { name: E.unidentified, mrn: "" };
    return ids.get(r.patientUserId) ?? { name: "Name withheld", mrn: "" };
  };
  const witness = (r: DoseRow) =>
    !r.controlled
      ? null
      : r.witness === "typed"
        ? E.witnessTypedLine
        : r.witness
          ? E.witness(cadre(r.witness.userId))
          : E.witnessNone;
  const episode = (r: DoseRow) => {
    const start = d.episodeStart.get(r.episodeId);
    return start ? E.episode(when.format(start)) : E.notRecorded;
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${scope.hospitalName} · ${PHARMACY.place}`}
        placeInTopBar
        title={E.title}
        subline={E.lede}
      />
      <CautionNotice tone="neutral" lead={EMERGENCY_NOTICE.text} />
      <DoseFilters carts={carts} cart={cart} period={period} controls={tableId} />

      <div id={tableId}>
        <div className="border-border bg-card hidden overflow-x-auto rounded-lg border md:block">
          <table className="text-body-s w-full">
            <caption className="sr-only">{E.title}</caption>
            <thead className="text-muted-foreground text-left">
              <tr className="border-border border-b">
                {Object.values(E.columns).map((c) => (
                  <th key={c} scope="col" className="px-4 py-2.5 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {d.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted-foreground px-4 py-8 text-center">
                    {E.empty}
                  </td>
                </tr>
              ) : (
                d.rows.map((r) => {
                  const p = patient(r);
                  const w = witness(r);
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-4 py-3 font-mono whitespace-nowrap tabular-nums">
                        {when.format(r.givenAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex flex-col">
                          <span className="font-medium">{p.name}</span>
                          <span className="text-muted-foreground font-mono text-[12px] tabular-nums">
                            {p.mrn}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {r.medicine}
                        {w ? (
                          <span className="mt-1 block">
                            <StatusWord tone="neutral">{w}</StatusWord>
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 whitespace-pre-wrap">
                        {[r.dose, r.route].filter(Boolean).join(" · ") || E.notRecorded}
                      </td>
                      <td className="px-4 py-3">{r.cart ?? E.noCart}</td>
                      <td className="px-4 py-3">{cadre(r.givenByUserId)}</td>
                      <td className="px-4 py-3 font-mono tabular-nums">{episode(r)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <ul className="divide-border border-border flex flex-col divide-y border-y md:hidden">
          {d.rows.length === 0 ? (
            <li className="text-body-s text-muted-foreground py-8 text-center">{E.empty}</li>
          ) : (
            d.rows.map((r) => {
              const p = patient(r);
              const w = witness(r);
              return (
                <li key={r.id} className="text-body-s flex flex-col gap-1 py-3">
                  <span className="font-medium">
                    {p.name} <span className="text-muted-foreground font-mono">{p.mrn}</span>
                  </span>
                  <span>
                    {r.medicine} · {[r.dose, r.route].filter(Boolean).join(" · ") || E.notRecorded}
                  </span>
                  <span className="text-muted-foreground">
                    <span className="font-mono tabular-nums">{when.format(r.givenAt)}</span> ·{" "}
                    {r.cart ?? E.noCart} · {cadre(r.givenByUserId)}
                  </span>
                  {w ? <StatusWord tone="neutral">{w}</StatusWord> : null}
                </li>
              );
            })
          )}
        </ul>
      </div>
      <p className="text-body-s text-muted-foreground">
        {E.footer(d.rows.length, E.periodInFooter[period])}
      </p>
    </div>
  );
}
