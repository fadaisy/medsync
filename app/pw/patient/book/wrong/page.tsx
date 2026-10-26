import type { Metadata } from "next";

import { ButtonLink, Note } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { BOOK_COPY as C, WRONG_COPY as W } from "@/content/patient/book";
import { loadPatientBits } from "@/lib/patient-web/book-data";
import { fromSlot } from "@/lib/patient-web/opaque";
import { requirePatientScope } from "@/lib/patient/scope";
import { adultAreas, catalogueMode } from "../_lib/catalogue";
import { WrongSteps } from "./_components/wrong-steps";

export const metadata: Metadata = { title: "Something is wrong" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Something is wrong (the phone's (app)/symptoms.tsx; MS-PRD-SYM-001 §7, ADR 0098): three steps, forced light
 * (L11). Gate CS decides what renders: off says so; a draft carries the "Unsigned clinical content" line (W2).
 * The page reads nothing clinical: the catalogue is the bundled package and the tier is computed in the
 * browser, then the server recomputes it on submit and its answer is the one shown (S11).
 */
export default async function WrongPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; doctor?: string; department?: string; hospital?: string }>;
}) {
  const scope = await requirePatientScope();
  const [mode, bits, params] = await Promise.all([
    catalogueMode(),
    loadPatientBits(scope.userId).catch(() => ({ patientCode: null, sex: null })),
    searchParams,
  ]);
  // Opaque ids only (W4): anything else is dropped.
  const doctor = Object.fromEntries(
    (["doctor", "department", "hospital"] as const).flatMap((k) =>
      params[k] && UUID.test(params[k]) ? [[k, params[k]]] : [],
    ),
  );

  return (
    <div data-pw-light className="flex flex-col gap-7 max-[760px]:gap-5">
      {mode === "off" ? (
        <>
          <PageHeader back={{ href: "/patient/book", label: C.back }} title={W.title} />
          <div className="flex max-w-2xl flex-col items-start gap-4">
            <Note>{W.off}</Note>
            <ButtonLink href="/patient/book" tone="outline">
              {C.back}
            </ButtonLink>
          </div>
        </>
      ) : (
        <WrongSteps
          draft={mode === "draft_watermarked"}
          initialArea={fromSlot(
            adultAreas().map((x) => x.key),
            params.a,
          )}
          showPregnancy={bits.sex !== "male"}
          hospital={
            scope.primaryHospitalId
              ? {
                  name: scope.primaryHospitalName ?? null,
                  emergencyPhone: scope.emergencyEntrancePhone,
                }
              : null
          }
          doctor={doctor}
        />
      )}
    </div>
  );
}
