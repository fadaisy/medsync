import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LABEL_CSS, SpecimenLabel } from "@/components/emr/orders/specimen-label";
import { PrintToolbar } from "@/components/emr/print-toolbar";
import { requireEmrActor } from "@/lib/emr/actor";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { loadSpecimenLabel } from "@/lib/emr/read/orders";

export const metadata: Metadata = { title: "Specimen label · MedSync" };
export const dynamic = "force-dynamic";

/**
 * The specimen label (gate-a E.8): print CSS only, sized for a label roll. Flag off, or no basis
 * for this patient: not found.
 */
export default async function SpecimenLabelPage({
  params,
}: {
  params: Promise<{ encounterId: string; specimenId: string }>;
}) {
  const { encounterId, specimenId } = await params;
  const actor = await requireEmrActor("doctor");
  if (!emrV1LiveFor(actor.hospitalId)) notFound();
  const label = await loadSpecimenLabel(actor, encounterId, specimenId);
  if (!label) notFound();
  return (
    <div className="flex flex-col items-start gap-4 px-4 py-6 md:px-8">
      <style>{LABEL_CSS}</style>
      <div className="flex flex-wrap items-center gap-4 print:hidden">
        <h1 className="text-heading-s text-foreground font-medium">Specimen label</h1>
        <PrintToolbar withheld={[]} />
      </div>
      <SpecimenLabel data={label} />
    </div>
  );
}
