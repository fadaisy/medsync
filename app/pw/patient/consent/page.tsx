import type { Metadata } from "next";
import { ShieldCheckIcon } from "lucide-react";

import { EMERGENCY_SYMPTOMS } from "@/app/patient/_components/emergency-notice";
import { buttonClass, Card, ICON, Note } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { GETTING_IN_COPY as G } from "@/content/patient/getting-in";
import { ME_COPY } from "@/content/patient/me";
import { PATIENT_WEB_COPY as W } from "@/content/patient/web";
import { countUnseenNotifications } from "@/lib/patient-web/notifications";
import { dataProcessingConsent, resolvePatientScope } from "@/lib/patient/scope";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { ConsentForm } from "./_components/consent-form";

export const metadata: Metadata = { title: "Consent" };
export const dynamic = "force-dynamic";

/**
 * The consent gate (Gate H, ADR 0094; the phone's (app)/consent.tsx). While no `data_processing` record
 * matches the ACTIVE text, every page sends the patient here and the layout drops the rail: the emergency
 * block comes first (ADR 0085 §5), then the whole text, one box and "Agree and continue", through the old
 * page's `acceptDataProcessingConsentAction` unchanged. Sign out is the way not to agree. Once accepted,
 * the page says what was accepted and when.
 */
export default async function ConsentPage() {
  const scope = await resolvePatientScope();
  const consent = await dataProcessingConsent(scope.userId);

  if (consent && consent.acceptedAt === null)
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <PageHeader title={G.gate.title} subtitle={G.gate.lead} />
        <EmergencyBlock hospital={scope.primaryHospitalName} phone={scope.emergencyEntrancePhone} />
        <ConsentForm
          version={consent.version}
          bodySha256={consent.bodySha256}
          effectiveDate={consent.effectiveDate}
          body={consent.body}
        />
      </div>
    );

  const unseen = await countUnseenNotifications(scope.userId).catch(() => 0);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        back={{ href: "/patient/me", label: ME_COPY.backToMe }}
        overline={G.open.overline}
        area="me"
        title={G.open.title}
        unseen={unseen}
      />
      {consent?.acceptedAt ? (
        <Card className="flex items-start gap-3">
          <ShieldCheckIcon className="text-pw-accent-text mt-0.5 size-5 shrink-0" {...ICON} />
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] leading-[22px] font-semibold">
              {G.open.accepted(consent.version)}
            </h2>
            <p className="text-pw-ink-2 text-[15px] leading-[21px]">
              {G.open.acceptedOn(
                consent.acceptedAt.toLocaleDateString("en-GB", {
                  dateStyle: "long",
                  timeZone: DEFAULT_TIME_ZONE,
                }),
              )}
            </p>
          </div>
        </Card>
      ) : null}
      <Card className="flex flex-col gap-1">
        <h2 className="text-[17px] leading-[22px] font-semibold">{G.open.privateTitle}</h2>
        <p className="text-pw-ink-2 text-[15px] leading-[21px]">{W.whoSeesLog}</p>
      </Card>
    </div>
  );
}

/**
 * The emergency block of ADR 0084 §3, first on the gate: named symptoms, one destination, the hospital's
 * own verified number when there is one (never a guessed one), no question. Amber with its words, not red.
 */
function EmergencyBlock({ hospital, phone }: { hospital: string | null; phone: string | null }) {
  const shown = phone?.trim();
  const dialable = shown && /\d/.test(shown) ? shown : null;
  return (
    <aside aria-label={hospital ? `${G.emergency.label}, ${hospital}` : G.emergency.label}>
      <Note tone="caution">
        <div className="flex flex-col gap-2">
          {dialable ? (
            <a
              href={`tel:${dialable.replace(/[^\d+]/g, "")}`}
              className={`${buttonClass("outline", "m")} self-start`}
            >
              {G.emergency.call} <span className="font-mono tabular-nums">{dialable}</span>
              {hospital ? <span className="sr-only">, {hospital}</span> : null}
            </a>
          ) : null}
          <p className="text-pw-ink font-semibold">{G.emergency.body}</p>
          <p className="text-pw-ink">
            {G.emergency.means} {EMERGENCY_SYMPTOMS.join(" · ")}.
          </p>
        </div>
      </Note>
    </aside>
  );
}
