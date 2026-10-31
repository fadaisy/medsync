import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TARGET } from "@/app/pharmacy/store/wards/_components/ward-dialogs";
import { WardStockView } from "@/app/pharmacy/store/wards/_components/ward-stock-view";
import { PageHeader } from "@/components/medsync/page-header";
import { CTL } from "@/content/pharmacy-rework-controls";
import { WARDS } from "@/content/pharmacy-stores-wards";
import { db } from "@/db";
import { requireNurseScope } from "@/lib/nurse/scope";
import { pharmacyWardStockLiveFor } from "@/lib/pharmacy/feature";
import { getWardStockPage, rightsAt, wardsOf } from "@/lib/pharmacy/stores/ward-read";
import {
  attestOwnFactor,
  confirmWardReceipt,
  raiseWardRequisition,
  recordGapReason,
  recordWardCount,
  returnWardStock,
} from "./actions";

export const metadata: Metadata = { title: "Ward stock · Nurse · MedSync" };
export const dynamic = "force-dynamic";

/**
 * The ward's own stock page for nurses (5.4, Appendix A, S21): only the wards this nurse holds a ward
 * right at. The nurse in charge (`ward_act`) counts, raises requisitions and returns stock; receipt is
 * confirmed by the nurse in charge, or any nurse on the ward where the site allows (`ward_confirm`).
 */
export default async function NurseWardStockPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; count?: string }>;
}) {
  const scope = await requireNurseScope();
  if (!pharmacyWardStockLiveFor(scope.hospitalId)) notFound();
  const d = db as unknown as EmrDb;
  const wards = await wardsOf(d, scope.hospitalId, scope.userId);
  const sp = await searchParams;
  const ward = wards.find((w) => w.id === sp.location) ?? wards[0];
  if (!ward)
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        <PageHeader place={scope.departmentName} title={WARDS.title} />
        <p className="text-body-s text-muted-foreground">{WARDS.nurseNoWard}</p>
      </div>
    );
  const [page, rights] = await Promise.all([
    getWardStockPage(d, scope.hospitalId, ward.id, new Date()),
    rightsAt(d, scope.userId, ward.id),
  ]);
  if (!page) notFound();
  const base = `/nurse/ward-stock?location=${ward.id}`;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={scope.departmentName} title={`${WARDS.title} · ${ward.name}`} />
      <Link
        href={`/nurse/cd-dose?location=${ward.id}`}
        className={`text-body-s inline-flex ${TARGET} w-fit items-center font-medium underline underline-offset-2`}
      >
        {CTL.nurse.link}
      </Link>
      {wards.length > 1 ? (
        <nav aria-label={WARDS.title} className="flex flex-wrap gap-2">
          {wards.map((w) => (
            <Link
              key={w.id}
              href={`/nurse/ward-stock?location=${w.id}`}
              aria-current={w.id === ward.id ? "page" : undefined}
              className={`text-body-s border-border inline-flex ${TARGET} items-center rounded-md border px-3 aria-[current=page]:font-semibold`}
            >
              {w.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <WardStockView
        page={page}
        base={base}
        mode={sp.count ? "count" : "page"}
        me={scope.userId}
        actions={{
          count: rights.act ? recordWardCount : undefined,
          requisition: rights.act ? raiseWardRequisition : undefined,
          returnStock: rights.act ? returnWardStock : undefined,
          attestOwn: rights.confirm ? attestOwnFactor : undefined,
          confirm: rights.confirm ? confirmWardReceipt : undefined,
          gapReason: rights.act ? recordGapReason : undefined,
        }}
      />
    </div>
  );
}
