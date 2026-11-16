import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { checksThisYear, teamCards } from "@patient-core/my-care";

import { PageHeader } from "@/components/tide/shell";
import { CARE_V2_COPY } from "@/content/patient-app/care";
import { loadCareWeb, loadTeamAndThread } from "@/lib/patient-web/care-v2";
import { careModeOn } from "@/lib/patient-web/flags";
import { requirePatientScope } from "@/lib/patient/scope";
import { MyCareClient } from "../_v2/my-care";

export const metadata: Metadata = { title: "My care" };

const stamp = (iso: string) =>
  new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

/** My care, Care mode v2 (Step 9): the team and checks in one column, messages in the other. */
export default async function MyCarePage() {
  if (!careModeOn()) notFound();
  await requirePatientScope();
  const now = new Date();
  const care = await loadCareWeb(now);
  const rows = care ? await loadTeamAndThread(care.enrolmentId) : null;
  return (
    <>
      <PageHeader
        title={CARE_V2_COPY.myCare.title}
        back={{ href: "/patient/care", label: CARE_V2_COPY.hero.title }}
      />
      <MyCareClient
        team={rows ? teamCards(rows.team, rows.names) : []}
        // Done dates arrive with the results link: until then every check reads Due, never Done.
        checks={care ? checksThisYear(care.intervals, new Map(), now) : []}
        messages={(rows?.messages ?? []).map((m) => ({
          id: m.id,
          fromPatient: m.fromPatient,
          kind: m.kind,
          body: m.body,
          at: stamp(m.atIso),
        }))}
      />
    </>
  );
}
