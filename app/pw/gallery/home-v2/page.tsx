import { ticketView } from "@patient-core/ticket-view";
import { stageOf } from "@patient-core/visit-stages";

import { PageHeader, PatientShell } from "@/components/tide/shell";
import { HomeV2 } from "@/components/tide/v2-home-web";
import { GALLERY_SHELL } from "../v2-shell";

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
      />
    </PatientShell>
  );
}
