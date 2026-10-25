import type { Metadata } from "next";

import { loadBookGlance, loadHospitals } from "@/lib/patient-web/book-data";
import { countUnseenNotifications } from "@/lib/patient-web/notifications";
import { fetchHousehold } from "@/lib/patient/household";
import { requirePatientScope } from "@/lib/patient/scope";
import { BookForm } from "./_components/book-form";
import { adultAreas, catalogueMode } from "./_lib/catalogue";

export const metadata: Metadata = { title: "Book a visit · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Book a visit (the phone's (app)/book/index.tsx): who, why, how. Who: me, or someone this account books for
 * (`booking_agents`). Why: two doors, "Something is wrong" through the symptom steps first. How: come today
 * (joins the line) or ask for a day, with the real glance on each door. No count of people in line
 * (ADR 0084 §5). Without a hospital the patient chooses one first, here.
 */
export default async function BookPage() {
  const scope = await requirePatientScope();
  const hospitalId = scope.primaryHospitalId;
  const [household, glance, hospitals, mode, unseen] = await Promise.all([
    fetchHousehold(scope.userId).catch(() => []),
    hospitalId ? loadBookGlance(hospitalId) : Promise.resolve(null),
    hospitalId ? Promise.resolve([]) : loadHospitals().catch(() => null),
    catalogueMode(),
    countUnseenNotifications(scope.userId).catch(() => 0),
  ]);
  const name = scope.fullName?.trim();

  return (
    <BookForm
      me={name || null}
      household={household.map((m) => ({ id: m.provisionalPatientId, label: m.memberLabel }))}
      glance={glance}
      hospitals={hospitalId ? undefined : hospitals}
      areas={mode === "off" ? null : adultAreas()}
      unseen={unseen}
    />
  );
}
