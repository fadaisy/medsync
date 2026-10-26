import type { Metadata } from "next";

import { PreAlertForm } from "@/app/emergency/_components/pre-alert-form";
import { loadEmergencyContext } from "@/app/emergency/_lib/sheet";
import { emergencyItems, tiles } from "@/app/emergency/_lib/tiles";
import { TideScope } from "@/components/medsync/tide-scope";
import { Note } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { HELP_COPY } from "@/content/patient/help";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { preAlertLive } from "@/lib/emergency/feature";

export const metadata: Metadata = { title: "Tell a hospital I'm coming" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The pre-alert (E2, PRD §8.3), behind FEATURE_PRE_ALERT as before. The form is the old Emergency page's own
 * (`PreAlertForm` and `pt-create-pre-arrival` through its server action), reused rather than forked; it reads
 * the symptom steps' pending draft itself, so the URL carries at most an opaque submission id (W4).
 * ponytail: the form keeps its Chroma look inside the light TideScope; restyle it in Tide when the flag goes on.
 */
export default async function TellPage({
  searchParams,
}: {
  searchParams: Promise<{ submission?: string }>;
}) {
  const [ctx, sp] = await Promise.all([loadEmergencyContext(), searchParams]);
  const C = HELP_COPY.tell;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader back={{ href: "/emergency/lines", label: C.back }} title={C.title} />
      {preAlertLive() ? (
        <TideScope group="public" light>
          <PreAlertForm
            facilities={ctx.sheet.facilities}
            ownHospitalId={ctx.hospitalId}
            signedIn={ctx.signedIn}
            eItems={emergencyItems()}
            tiles={tiles()}
            initialItems={[]}
            submissionId={sp.submission && UUID.test(sp.submission) ? sp.submission : null}
          />
        </TideScope>
      ) : (
        <Note>{PATIENT_WEB_COPY.notAvailable}</Note>
      )}
    </div>
  );
}
