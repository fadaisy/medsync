import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { IntakeForm } from "@/app/hospital-admin/intake/_components/intake-form";
import { listActiveHospitals, listEntryTypes, listHospitalDepartments } from "@/lib/intake/queries";
import { requireReceptionScope } from "@/lib/reception/scope";
import { receptionRegisterIntakeAction } from "./actions";

export const metadata: Metadata = { title: "Register · Reception · MedSync" };
export const dynamic = "force-dynamic";

export default async function ReceptionIntakePage() {
  const scope = await requireReceptionScope();
  const [entryTypes, departments, hospitals] = await Promise.all([
    listEntryTypes(),
    listHospitalDepartments(scope.hospitalId),
    listActiveHospitals(),
  ]);

  return (
    <div className="stagger-children mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8 lg:py-10">
      <Link
        href="/reception"
        className="text-muted-foreground hover:text-foreground group inline-flex w-fit items-center gap-1 text-[12.5px] transition-colors"
      >
        <ArrowLeftIcon
          className="size-3.5 transition-transform duration-200 group-hover:-translate-x-0.5"
          aria-hidden
        />
        Today
      </Link>

      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          {scope.hospitalName} · Register an entry
        </span>
        <h1 className="font-display text-foreground text-[26px] leading-[1.15] font-medium tracking-[-0.015em]">
          Front door
        </h1>
        <p className="text-muted-foreground max-w-[60ch] text-[12.5px] leading-relaxed">
          Walk-in, booked check-in, referral, emergency, transfer, follow-up. Emergency entries skip
          required fields — capture fast, complete later.
        </p>
      </header>

      <IntakeForm
        entryTypes={entryTypes}
        departments={departments}
        hospitals={hospitals}
        submitAction={receptionRegisterIntakeAction}
      />
    </div>
  );
}
