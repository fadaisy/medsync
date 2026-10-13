import type { Metadata } from "next";

import { requireNurseScope } from "@/lib/nurse/scope";
import { BedsideScreen } from "./_components/bedside-screen";

export const metadata: Metadata = { title: "Bedside test · Nurse · MedSync" };
export const dynamic = "force-dynamic";

export default async function BedsidePage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  return <BedsideScreen surface="nurse" patientId={patientId} scope={await requireNurseScope()} />;
}
