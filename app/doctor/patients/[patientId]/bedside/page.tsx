import type { Metadata } from "next";

import { BedsideScreen } from "@/app/nurse/patients/[patientId]/bedside/_components/bedside-screen";
import { requireDoctorScope } from "@/lib/doctor/scope";

export const metadata: Metadata = { title: "Bedside test · Doctor · MedSync" };
export const dynamic = "force-dynamic";

/** Lab Phase 2 §5.7: the same bedside form, from the doctor's patient page. */
export default async function DoctorBedsidePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  return (
    <BedsideScreen surface="doctor" patientId={patientId} scope={await requireDoctorScope()} />
  );
}
