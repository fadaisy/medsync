import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { CautionNotice } from "@/components/medsync/caution-notice";
import { PageHeader } from "@/components/medsync/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PHARMACY } from "@/content/pharmacy";
import { NATIONAL_LIST } from "@/content/pharmacy-catalogue";
import { STOCK } from "@/content/pharmacy-stock";
import { asClinicalReader } from "@/lib/emr/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyNationalListLiveFor } from "@/lib/pharmacy/feature";
import { searchNationalList } from "@/lib/pharmacy/national-catalogue";
import { SELECT } from "../../_components/review-dialogs";

/**
 * The national list from Stock (ADR 0282): every medicine and health supply of the loaded edition, as
 * printed, searchable by name or class. Reference only: nothing here is prescribed, supplied or stocked.
 * Read as the clinician; RLS gives it to holders of `pharmacy.view`.
 */
export async function NationalListBody({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; vital?: string }>;
}) {
  const actor = await requirePharmacyActor();
  if (!pharmacyNationalListLiveFor(actor.hospitalId)) notFound();
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const kind = sp.kind === "medicine" || sp.kind === "supply" ? sp.kind : null;
  const vital = sp.vital === "1";
  const found = await asClinicalReader(actor, (tx) => searchNationalList(tx, { q, kind, vital }));
  const N = NATIONAL_LIST;
  const back = (
    <Link
      href="/pharmacy/stock"
      className="text-body-s text-primary underline-offset-4 hover:underline"
    >
      {N.back}
    </Link>
  );

  if (!found)
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        <PageHeader place={PHARMACY.place} placeInTopBar title={N.title} right={back} />
        <CautionNotice tone="neutral" lead={N.notLoaded} />
      </div>
    );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={PHARMACY.place} placeInTopBar title={N.title} right={back} />
      <p className="text-body-s text-muted-foreground max-w-prose">{N.lead(found.edition.name)}</p>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
          <Label htmlFor="nl-q">{N.search}</Label>
          <Input id="nl-q" name="q" type="search" defaultValue={q} maxLength={100} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="nl-kind">{N.columns.item}</Label>
          <select id="nl-kind" name="kind" defaultValue={kind ?? ""} className={SELECT}>
            <option value="">{N.kind.all}</option>
            <option value="medicine">{N.kind.medicine}</option>
            <option value="supply">{N.kind.supply}</option>
          </select>
        </div>
        <label className="text-body-s flex min-h-11 items-center gap-2">
          <input type="checkbox" name="vital" value="1" defaultChecked={vital} className="size-4" />
          {N.vitalOnly}
        </label>
        <Button type="submit" variant="secondary" className="min-h-11">
          {N.submit}
        </Button>
      </form>

      <p className="text-body-s text-foreground" aria-live="polite">
        {found.total === 0
          ? N.empty
          : found.rows.length < found.total
            ? N.shownSome(found.rows.length, found.total)
            : N.shownAll(found.total)}
      </p>

      {found.rows.length ? (
        <ul className="border-border bg-card divide-border divide-y rounded-lg border">
          {found.rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-body-m text-foreground font-medium">{r.genericName}</span>
                <span className="text-caption text-muted-foreground">{r.therapeuticClass}</span>
              </div>
              <dl className="text-body-s text-muted-foreground flex flex-wrap gap-x-5 gap-y-1">
                {r.kind === "medicine" && r.form ? (
                  <div className="flex gap-1">
                    <dt className="sr-only">{N.columns.form}</dt>
                    <dd>{r.form}</dd>
                  </div>
                ) : null}
                {r.strength || r.unit ? (
                  <div className="flex gap-1">
                    <dt className="sr-only">{N.columns.strength}</dt>
                    <dd>{r.strength ?? r.unit}</dd>
                  </div>
                ) : null}
                {r.levelOfCare ? (
                  <div className="flex gap-1">
                    <dt>{N.columns.level}:</dt>
                    <dd className="text-foreground">{r.levelOfCare}</dd>
                  </div>
                ) : null}
                {r.venClass ? (
                  <div className="flex gap-1">
                    <dt>{N.columns.ven}:</dt>
                    <dd className="text-foreground">{STOCK.ven[r.venClass] ?? r.venClass}</dd>
                  </div>
                ) : null}
                {r.specialist ? (
                  <div>
                    <dt className="sr-only">{N.specialist}</dt>
                    <dd className="text-foreground">{N.specialist}</dd>
                  </div>
                ) : null}
                {r.medicineId ? (
                  <div>
                    <dt className="sr-only">{N.columns.prescribing}</dt>
                    <dd className="text-foreground">{N.onList}</dd>
                  </div>
                ) : null}
              </dl>
              {r.checkNote ? (
                <StatusWord tone="caution">
                  {r.sourcePage ? N.flaggedPage(r.sourcePage) : N.flagged}
                </StatusWord>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
