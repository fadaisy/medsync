import type { Metadata } from "next";

import { loadEmergencyContext } from "@/app/emergency/_lib/sheet";
import { ButtonLink } from "@/components/tide/kit";
import { HELP_COPY } from "@/content/patient/help";
import { preAlertLive } from "@/lib/emergency/feature";
import { calmContacts, CalmScreen } from "../_components/calm";

export const metadata: Metadata = { title: "You are not alone" };
export const dynamic = "force-dynamic";

const C = HELP_COPY.calm.crisis;

/** The self-harm route (the phone's (app)/emergency/crisis.tsx): calm support, and the pre-alert when it is on. */
export default async function CrisisPage() {
  const ctx = await loadEmergencyContext();
  return (
    <CalmScreen
      title={C.title}
      lead={C.lead}
      body={C.body}
      contacts={calmContacts(ctx.sheet.contacts, "crisis")}
      fallback={C.fallback}
    >
      {preAlertLive() ? (
        <ButtonLink href="/emergency/tell" tone="soft" className="self-start">
          {HELP_COPY.lines.tell}
        </ButtonLink>
      ) : null}
    </CalmScreen>
  );
}
