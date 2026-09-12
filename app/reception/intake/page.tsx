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
        className="text-muted-foreground hover:text-foreground text-body-s ease-expo-out group inline-flex w-fit items-center gap-1 transition-colors duration-150"
      >
        <ArrowLeftIcon
          className="ease-expo-out size-3.5 transition-transform duration-150 group-hover:-translate-x-0.5"
          aria-hidden
        />
        Today
      </Link>

      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground text-overline inline-flex items-center gap-1.5 font-mono uppercase">
          <span aria-hidden className="bg-brand-500 ring-brand-500/20 size-1 rounded-full ring-2" />
          {scope.hospitalName} · Register an entry
        </span>
        <h1 className="font-display text-foreground text-heading-l">Front door</h1>
        <p className="text-muted-foreground text-body-s max-w-[60ch] leading-relaxed">
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
