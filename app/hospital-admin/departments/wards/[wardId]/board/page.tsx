import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { loadBedBoard } from "@/lib/wards/board";
import { wardBuilderLiveFor } from "@/lib/wards/feature";
import { BoardClient } from "./board-client";

export const metadata: Metadata = { title: "Bed board · Hospital admin · MedSync" };
export const dynamic = "force-dynamic";

/**
 * The live bed board for the hospital admin (ADR 0194): the published plan with every bed's state.
 * Patients show by MRN only, as on the admin's other surfaces. Behind WARD_BUILDER.
 */
export default async function WardBoardPage({ params }: { params: Promise<{ wardId: string }> }) {
  const scope = await requireHospitalAdminScope();
  if (!wardBuilderLiveFor(scope.hospitalId)) notFound();
  const { wardId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(wardId)) notFound();
  const data = await loadBedBoard(scope.hospitalId, wardId, { patients: "mrn" });
  if (!data) notFound();
  return <BoardClient key={wardId} data={data} hospitalId={scope.hospitalId} />;
}
