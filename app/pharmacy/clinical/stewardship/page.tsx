import type { Group } from "@/lib/pharmacy/clinical/stewardship";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { STEWARDSHIP_UI as U } from "@/content/pharmacy-clinical";
import { asClinicalReader } from "@/lib/emr/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import {
  cultureState,
  dayOfTherapy,
  figures,
  groupOf,
  reviewDue,
} from "@/lib/pharmacy/clinical/stewardship";
import { stewardshipData } from "@/lib/pharmacy/clinical/stewardship-read";
import { pharmacyStewardshipLiveFor } from "@/lib/pharmacy/feature";
import { drugById } from "@/lib/prescribing/formulary";

export const metadata: Metadata = { title: "Stewardship · Pharmacy" };
export const dynamic = "force-dynamic";

const TZ = "Africa/Kampala";
const GROUPS: Group[] = ["Access", "Watch", "Reserve", "unknown"];
const name = (id: string) => drugById(id)?.generic ?? id;

/** 5.5 Stewardship (AM-3 to AM-8): figures with counts, review due, Reserve started. Read-only; Law 5. */
export default async function StewardshipPage() {
  const actor = await requirePharmacyActor();
  if (!pharmacyStewardshipLiveFor(actor.hospitalId)) notFound();
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 86_400_000);
  const d = await asClinicalReader(actor, (tx) => stewardshipData(tx, actor.hospitalId, from));
  const f = figures(d.courses, d.tags, d.cultures, d.settings, from, now);
  const open = d.courses
    .filter((c) => !c.endedAt)
    .map((c) => {
      const g = groupOf(d.tags, c.medicineId, c.route) ?? "unknown";
      const t = dayOfTherapy(c, now, TZ);
      return {
        c,
        g,
        t,
        due: reviewDue(c, g, d.settings, d.reviews, now, TZ),
        culture: cultureState(
          d.cultures,
          c.patientUserId,
          t.start,
          d.settings?.noCultureWindowHours ?? 48,
        ),
      };
    });
  const dueRows = open.filter((o) => o.due.due);
  const pct = (n: number, of: number) => (of ? ` (${Math.round((n / of) * 100)}%)` : "");
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={U.title}
        subline={<span className="text-body-s text-muted-foreground max-w-[70ch]">{U.lead}</span>}
      />
      {!d.signed ? (
        <p className="text-body-s">{U.noPack}</p>
      ) : (
        <>
          {d.settings ? null : <p className="text-body-s">{U.noSettings}</p>}
          <section className="flex flex-col gap-2">
            <h2 className="text-heading-s">{U.started(f.started)}</h2>
            <dl className="text-body-s grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
              {GROUPS.map((g) => (
                <div key={g} className="contents">
                  <dt className="text-muted-foreground">{U.groups[g]}</dt>
                  <dd className="m-0 tabular-nums" title={f.byGroup[g].definition}>
                    {f.byGroup[g].numerator} of {f.byGroup[g].denominator}
                    {pct(f.byGroup[g].numerator, f.byGroup[g].denominator)} · {U.daysOfTherapy}:{" "}
                    {f.dotByGroup[g]}
                  </dd>
                </div>
              ))}
              {f.noCulture ? (
                <div className="contents">
                  <dt className="text-muted-foreground">{U.noCulture}</dt>
                  <dd className="m-0 tabular-nums" title={f.noCulture.definition}>
                    {f.noCulture.numerator} of {f.noCulture.denominator}
                    {pct(f.noCulture.numerator, f.noCulture.denominator)}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
          <Rows title={U.reviewToday} rows={dueRows} />
          <Rows title={U.reserve} rows={open.filter((o) => o.g === "Reserve")} />
          <section className="flex flex-col gap-2">
            <h2 className="text-heading-s">{U.byWard}</h2>
            <ul className="text-body-s flex flex-col gap-1">
              {f.byWard.map((w) => (
                <li key={w.ward} className="tabular-nums">
                  {w.ward === "none" ? "—" : w.ward}:{" "}
                  {GROUPS.map((g) => `${U.groups[g]} ${w.counts[g]}`).join(" · ")}
                  {w.charts ? "" : ` · ${U.noWardChart}`}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );

  function Rows({ title, rows }: { title: string; rows: typeof open }) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-heading-s">{title}</h2>
        {rows.length ? (
          <ul className="text-body-s flex flex-col gap-1">
            {rows.map((o) => (
              <li key={o.c.prescriptionId}>
                {name(o.c.medicineId)} {o.c.route ?? ""} · {U.groups[o.g]} ·{" "}
                {U.day(o.t.day, o.t.from)} · {U.culture[o.culture.state]}
                {o.c.indication ? ` · ${o.c.indication}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-s text-muted-foreground">{U.none}</p>
        )}
      </section>
    );
  }
}
