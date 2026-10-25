import type { Metadata } from "next";

import { loadEmergencyContext } from "@/app/emergency/_lib/sheet";
import { ButtonLink, TextLink } from "@/components/tide/kit";
import { HELP_COPY } from "@/content/patient/help";
import { preAlertLive } from "@/lib/emergency/feature";
import { calmContacts, CalmScreen } from "../_components/calm";

export const metadata: Metadata = { title: "Care is here" };
export const dynamic = "force-dynamic";

const C = HELP_COPY.calm.sv;

/**
 * The sexual-violence route (the phone's (app)/emergency/sv.tsx): why time matters, the support line once
 * verified, the general line, the pre-alert when on and, signed in, a visit today. Nothing about what
 * happened is asked or recorded.
 */
export default async function SexualViolencePage() {
  const ctx = await loadEmergencyContext();
  return (
    <CalmScreen
      title={C.title}
      lead={C.lead}
      body={C.body}
      contacts={calmContacts(ctx.sheet.contacts, "sv")}
      fallback={C.fallback}
    >
      {preAlertLive() ? (
        <ButtonLink href="/emergency/tell" tone="soft" className="self-start">
          {HELP_COPY.lines.tell}
        </ButtonLink>
      ) : null}
      {ctx.signedIn ? <TextLink href="/patient/book/today">{C.book}</TextLink> : null}
    </CalmScreen>
  );
}
