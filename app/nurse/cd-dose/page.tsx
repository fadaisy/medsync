import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/medsync/page-header";
import { EmptyState } from "@/components/tide/work/kit";
import { CTL } from "@/content/pharmacy-rework-controls";
import { fill } from "@/content/pharmacy-workspace-v2";
import { db } from "@/db";
import { requireNurseScope } from "@/lib/nurse/scope";
import { placeRegisters } from "@/lib/pharmacy/cd/read";
import { wardsOf } from "@/lib/pharmacy/stores/ward-read";
import { DoseButton } from "./_components/dose-dialog";

export const metadata: Metadata = { title: "Controlled drugs · Nurse · MedSync" };
export const dynamic = "force-dynamic";

/** The ward's controlled-drug registers for the nurse: record a dose given, with a witness on duty. */
export default async function NurseCdDosePage({ searchParams }: { searchParams: Promise<{ location?: string }> }) {
  const scope = await requireNurseScope();
  const d = db as unknown as EmrDb;
  const wards = await wardsOf(d, scope.hospitalId, scope.userId);
  const { location } = await searchParams;
  const ward = wards.find((w) => w.id === location) ?? wards[0];
  const registers = ward ? await placeRegisters(d, scope.hospitalId, ward.id) : [];
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={scope.departmentName} title={ward ? `${CTL.nurse.title} · ${ward.name}` : CTL.nurse.title} />
      <p className="text-body-s text-ink-600">{CTL.nurse.lead}</p>
      {wards.length > 1 ? (
        <nav aria-label={CTL.nurse.title} className="flex flex-wrap gap-2">
          {wards.map((w) => (
            <Link
              key={w.id}
              href={`/nurse/cd-dose?location=${w.id}`}
              aria-current={w.id === ward?.id ? "page" : undefined}
              className="bg-card shadow-tide-card inline-flex min-h-11 items-center rounded-full px-4 text-[13.5px] aria-[current=page]:font-semibold"
            >
              {w.name}
            </Link>
          ))}
        </nav>
      ) : null}
      {!ward ? (
        <EmptyState title={CTL.nurse.noWard} />
      ) : registers.length ? (
        <ul className="flex flex-col gap-2">
          {registers.map((r) => (
            <li key={r.medicineId} className="bg-card shadow-tide-card rounded-tide-row flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="flex flex-col">
                <span className="text-[14px] font-semibold">{r.name}</span>
                <span className="text-caption text-ink-600">{fill(CTL.nurse.balance, { n: r.balance })}</span>
              </div>
              <DoseButton ward={{ id: ward.id, name: ward.name }} register={r} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={CTL.nurse.none} />
      )}
    </div>
  );
}
