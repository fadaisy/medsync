import type { Metadata } from "next";
import { OFF_WORDS } from "@patient-core/me-places";

import { Note } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { ME_COPY as C } from "@/content/patient/me";
import { loadPlaces } from "@/lib/patient-web/me-data";
import { countUnseenNotifications } from "@/lib/patient-web/notifications";
import { requirePatientScope } from "@/lib/patient/scope";
import { RetryButton } from "../../_components/home-bits";
import { PlacesView } from "./_components/places-view";

export const metadata: Metadata = { title: "My places · MedSync" };
export const dynamic = "force-dynamic";

/**
 * My places (the phone's (app)/places, ADR 0402): the places the patient saved, home first, from
 * `patient_places` under patient-only RLS. The repo has no web map, so a place is a list row (coordinates
 * never shown) and its pin comes from the browser only when the patient presses "Use my location" (L9).
 */
export default async function PlacesPage() {
  const scope = await requirePatientScope();
  const [places, unseen] = await Promise.all([
    loadPlaces(scope.userId).catch(() => ({ status: "error" as const })),
    countUnseenNotifications(scope.userId).catch(() => 0),
  ]);
  return (
    <>
      <PageHeader
        back={{ href: "/patient/me", label: C.backToMe }}
        overline={C.places}
        area="me"
        title={C.placesTitle}
        subtitle={C.placesIntro}
        unseen={unseen}
      />
      <div className="flex max-w-2xl flex-col gap-3">
        {places.status === "off" ? (
          <Note>{OFF_WORDS}</Note>
        ) : places.status === "error" ? (
          <div className="flex flex-col items-start gap-2">
            <Note>{C.placesFailed}</Note>
            <RetryButton />
          </div>
        ) : (
          <PlacesView places={places.value} />
        )}
      </div>
    </>
  );
}
