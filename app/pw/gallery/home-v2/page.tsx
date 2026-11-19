import type { DoctorCard } from "@patient-core/doctors";
import { dayKeyOf } from "@patient-core/doctors";
import { ticketView } from "@patient-core/ticket-view";
import { stageOf } from "@patient-core/visit-stages";

import { PageHeader, PatientShell } from "@/components/tide/shell";
import { HomeV2 } from "@/components/tide/v2-home-web";
import { DoctorsView } from "../../patient/_components/doctors";
import { GALLERY_SHELL } from "../v2-shell";

// The sample doctors' days are counted from today.
export const dynamic = "force-dynamic";

/** An invented doctor with one place, open on `day` days from today; belongs to nobody. */
function sampleDoctor(key: string, day: number, home: boolean): DoctorCard {
  const next = dayKeyOf(new Date(Date.now() + day * 86_400_000));
  return {
    key,
    userId: key,
    name: `Sample Doctor ${key}`,
    role: "Medical Officer",
    initials: key,
    photoUrl: null,
    nextDayKey: next,
    rating: null,
    places: [
      {
        hospitalId: home ? "h1" : "h2",
        hospitalName: home ? "Demo Hospital" : "Other Demo Hospital",
        departmentId: "d1",
        departmentName: "General clinic",
        nextDayKey: next,
        feeWords: "No fee",
        walkInToday: false,
        home,
      },
    ],
  };
}

/** Visit mode Home v2 on fixtures (board 16): an invented visit today, results, household and card. */
export default function HomeV2Gallery() {
  const ticket = ticketView(
    {
      startsAtIso: "2026-11-20T05:00:00Z",
      sessionId: "s",
      departmentName: "Diabetes clinic",
      hospitalName: "Demo Hospital",
      bookingCode: "K7M42Q",
      forMember: null,
      quotedFeeUgx: 30000,
    },
    undefined,
    "Sample Member",
  );
  return (
    <PatientShell v2={GALLERY_SHELL}>
      <PageHeader overline="Kit · v2" area="visits" title="Good morning Sample" demo />
      <HomeV2
        visit={{
          ticket,
          stage: stageOf("arrived", null),
          today: true,
          href: "/pw/gallery/visit-v2?screen=day",
        }}
        results={{ state: "ready", ready: 2, waiting: 1 }}
        household={[{ id: "m1", label: "Mother" }]}
        card={{ tierName: "Basic", memberNo: "MS-2026-00035", plus: false }}
        doctors={
          <DoctorsView
            doctors={[
              sampleDoctor("C", 3, true),
              sampleDoctor("A", 0, false),
              sampleDoctor("B", 1, true),
            ]}
          />
        }
      />
    </PatientShell>
  );
}
