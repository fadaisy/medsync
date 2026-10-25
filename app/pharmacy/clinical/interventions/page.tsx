import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { buttonVariants } from "@/components/ui/button";
import { PHARMACY } from "@/content/pharmacy";
import { CLINICAL_B, INTERVENTIONS_UI as U } from "@/content/pharmacy-clinical";
import { asClinicalReader } from "@/lib/emr/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { checksWorthSigning, interventionReport } from "@/lib/pharmacy/clinical/interventions";
import { queryFacts } from "@/lib/pharmacy/clinical/interventions-read";
import { entriesInForce } from "@/lib/pharmacy/clinical/read";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { pharmacyInterventionReviewLiveFor } from "@/lib/pharmacy/feature";

export const metadata: Metadata = { title: "Interventions · Pharmacy" };
export const dynamic = "force-dynamic";

/**
 * Intervention review (5.4, IV-1 to IV-5), behind `pharmacyInterventionReview`: counts by type and by point, what
 * waits, and "a check worth signing" from the signed minimum. For `pharmacy.review` and `pharmacy.manage`.
 */
export default async function InterventionsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const actor = await requirePharmacyActor();
  if (
    !pharmacyInterventionReviewLiveFor(actor.hospitalId) ||
    !actor.access.permissions.has("pharmacy.review")
  )
    notFound();
  const sp = await searchParams;
  const days = (U.periods as readonly number[]).includes(Number(sp.days)) ? Number(sp.days) : 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const [facts, worthPack, manages] = await Promise.all([
    asClinicalReader(actor, (tx) => queryFacts(tx, actor.hospitalId, from, to)),
    asClinicalReader(actor, (tx) => entriesInForce(tx, actor.hospitalId, "check_worth_signing")),
    managesPharmacy(actor.userId, actor.hospitalId),
  ]);
  const r = interventionReport(facts, from, to);
  const t = r.total;
  const acted = t.changed + t.stopped;
  const share = t.answered ? `${Math.round((100 * acted) / t.answered)}%` : "none";
  const minimum = worthPack[0]?.payload.minimum ?? null;
  const worth = checksWorthSigning(r.byType, minimum);
  const max = Math.max(1, ...r.byWard.map((w) => w.sent));
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={U.title}
        subline={<span className="text-body-s text-muted-foreground max-w-[70ch]">{U.lead}</span>}
        right={
          <nav aria-label="Period" className="flex flex-wrap gap-2">
            {U.periods.map((d) => (
              <Link
                key={d}
                href={`?days=${d}`}
                aria-current={d === days ? "page" : undefined}
                className={buttonVariants({
                  variant: d === days ? "primary" : "secondary",
                  size: "md",
                })}
              >
                {U.period(d)}
              </Link>
            ))}
            {manages ? (
              <a
                href={`/pharmacy/clinical/interventions/counts?days=${days}`}
                className={buttonVariants({ variant: "secondary", size: "md" })}
              >
                {U.download}
              </a>
            ) : null}
          </nav>
        }
      />
      <ul className="text-body-s grid gap-2 sm:grid-cols-2">
        <li>{U.figures.sent(t.sent, t.withdrawn, t.open)}</li>
        <li>{U.figures.answered(t.answered)}</li>
        <li>{U.figures.acted(acted, share)}</li>
        <li>{U.figures.kept(t.kept, t.clarified)}</li>
      </ul>
      <section aria-labelledby="by-type" className="flex flex-col gap-2">
        <h2 id="by-type" className="text-heading-s">
          {U.byType}
        </h2>
        <div tabIndex={0} className="border-border overflow-x-auto rounded-lg border">
          <table className="text-body-s w-full tabular-nums">
            <thead className="text-muted-foreground text-left">
              <tr>
                {U.cols.map((c) => (
                  <th key={c} className="p-2 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.byType.map((x) => (
                <tr key={x.key} className="border-border border-t">
                  <td className="p-2">{x.key}</td>
                  <td className="p-2">{x.sent}</td>
                  <td className="p-2">{x.answered}</td>
                  <td className="p-2">{x.changed}</td>
                  <td className="p-2">{x.stopped}</td>
                  <td className="p-2">{x.kept}</td>
                  <td className="p-2">{U.minutes(x.medianMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="by-ward" className="flex flex-col gap-2">
        <h2 id="by-ward" className="text-heading-s">
          {U.byWard}
        </h2>
        <ul className="flex flex-col gap-2">
          {r.byWard.map((w) => {
            const a = w.changed + w.stopped;
            return (
              <li key={w.key} className="text-body-s flex flex-col gap-1">
                <span>{U.barAlt(w.key === "none" ? "No point" : w.key, a, w.sent - a)}</span>
                <span
                  aria-hidden
                  className="bg-muted flex h-3 overflow-hidden rounded-sm"
                  style={{ width: `${(100 * w.sent) / max}%` }}
                >
                  <span
                    className="bg-foreground/70"
                    style={{ width: `${w.sent ? (100 * a) / w.sent : 0}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-caption text-muted-foreground">{U.scale(max)}</p>
      </section>
      <p className="text-body-s">{U.waiting(r.waiting.length)}</p>
      <section aria-labelledby="worth" className="flex flex-col gap-2">
        <h2 id="worth" className="text-heading-s">
          {U.worth}
        </h2>
        {minimum === null ? (
          <p className="text-body-s text-muted-foreground">
            {CLINICAL_B.checkWorthSigningUnsigned}
          </p>
        ) : worth.length ? (
          <ul className="text-body-s flex flex-col gap-1">
            {worth.map((w) => (
              <li key={w.key}>{U.worthLine(w.key, w.actedOn)}</li>
            ))}
          </ul>
        ) : (
          <p className="text-body-s text-muted-foreground">{U.worthNone}</p>
        )}
        {worth.length ? (
          <Link
            href="/pharmacy/clinical/content"
            className={buttonVariants({
              variant: "secondary",
              size: "md",
              className: "self-start",
            })}
          >
            {U.draftCheck}
          </Link>
        ) : null}
      </section>
    </div>
  );
}
