import type { Metadata } from "next";
import {
  ageWords,
  cardLines,
  cardNumber,
  initials,
  sexLetter,
  splitHistory,
} from "@patient-core/me-health";
import { placesSummary } from "@patient-core/me-places";

import { PageHeader } from "@/components/tide/shell";
import { ME_COPY as C } from "@/content/patient/me";
import { loadMedicines } from "@/lib/patient-web/day";
import {
  loadCardIdentity,
  loadHistory,
  loadOnFile,
  loadPlaces,
  loadSms,
} from "@/lib/patient-web/me-data";
import { countUnseenNotifications } from "@/lib/patient-web/notifications";
import { fetchHousehold } from "@/lib/patient/household";
import { requirePatientScope } from "@/lib/patient/scope";
import pkg from "@/package.json";
import { MeView } from "./_components/me-view";

export const metadata: Metadata = { title: "Me · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Me (the phone's (tabs)/me.tsx): the health card, my health, the people I book for, places, details,
 * privacy and the app's settings. Every read is a convenience: one that fails leaves its row honest
 * ("Not switched on yet", or the empty words) and the page still draws. Not on the web: the profile photo
 * (no upload path here yet) and the phone's push row (the web has no push).
 */
export default async function MePage() {
  const scope = await requirePatientScope();
  const now = new Date();
  const [id, history, places, meds, household, smsOn, onFile, unseen] = await Promise.all([
    loadCardIdentity(scope.userId).catch(() => null),
    loadHistory(scope.userId).catch(() => ({ status: "error" as const })),
    loadPlaces(scope.userId).catch(() => ({ status: "error" as const })),
    loadMedicines(scope.userId).catch(() => null),
    fetchHousehold(scope.userId).catch(() => []),
    loadSms(scope.userId).catch(() => null),
    loadOnFile().catch(() => null),
    countUnseenNotifications(scope.userId).catch(() => 0),
  ]);

  const name = scope.fullName?.trim() || null;
  const facility = id?.facility ?? scope.primaryHospitalName;
  const h = splitHistory(history.status === "ready" ? history.value : []);
  const lines = cardLines(h, id?.conditions ?? []);
  const hOff = history.status === "off";
  const nok = onFile?.ok ? onFile.onFile.nokOnFile : null;
  const language = onFile?.ok ? onFile.onFile.preferredLanguage?.trim() || null : null;
  const emergencyPhone = id?.emergencyPhone ?? scope.emergencyEntrancePhone;

  return (
    <>
      <PageHeader title={C.title} area="me" unseen={unseen} />
      <MeView
        card={{
          holder: name ?? C.holderUnknown,
          number: cardNumber(id?.code ?? null),
          facility,
          age: ageWords(id?.dob ?? null, now),
          allergies: lines.allergies,
          nextOfKin: nok === null ? null : nok ? C.nokOnFile(facility) : C.nokNone,
          ifFound:
            emergencyPhone && facility
              ? C.ifFoundCall(facility, emergencyPhone)
              : C.ifFoundReturn(facility),
        }}
        cardConditions={lines.conditions}
        sex={sexLetter(id?.sex ?? null)}
        rows={{
          conditions: C.historySub(
            hOff,
            h.conditions.length,
            "condition",
            "conditions",
            C.noneAdded,
          ),
          allergies:
            !h.allergies.length && h.noKnownAllergies
              ? C.noKnownAllergies
              : C.historySub(hOff, h.allergies.length, "allergy", "allergies", C.noneAdded),
          family: C.historySub(
            hOff,
            h.family.length,
            "family condition",
            "family conditions",
            C.familyNone,
          ),
          medicines: C.medicinesSub(meds?.meds.length ?? 0),
          places:
            places.status === "off"
              ? C.placesOff
              : places.status === "ready"
                ? C.placesSub(placesSummary(places.value))
                : C.placesFailed,
          language: C.languageSub(language),
        }}
        me={{ initials: initials(name), label: name ?? C.peopleMe }}
        household={household.map((m) => ({
          id: m.bookingAgentId,
          label: m.memberLabel,
          initials: initials(m.memberLabel),
        }))}
        smsOn={smsOn}
        version={pkg.version}
      />
    </>
  );
}
