import type { Metadata } from "next";
import { FlaskConicalIcon } from "lucide-react";

import { ButtonLink, Card, ICON, Note, SectionHead } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { CARE_COPY } from "@/content/patient/care";
import { loadLabNames } from "@/lib/patient-web/care-labs";
import { requirePatientScope } from "@/lib/patient/scope";
import { RetryButton } from "../../_components/home-bits";

export const metadata: Metadata = { title: "Lab tests" };
export const dynamic = "force-dynamic";

const C = CARE_COPY.labs;

/**
 * Lab tests (the phone's care/labs.tsx): the names of the patient's tests, ready first, then those not ready
 * to show yet with their one line. No values here (S15); the old results page reads them, behind the same
 * switch and consent.
 */
export default async function LabsPage() {
  const scope = await requirePatientScope();
  const labs = await loadLabNames(scope.userId, scope.primaryHospitalId).catch(() => null);
  return (
    <>
      <PageHeader
        title={C.title}
        subtitle={C.subtitle}
        area="medicines"
        back={{ href: "/patient/care", label: CARE_COPY.backToCare }}
      />
      <div className="flex w-full max-w-[720px] flex-col gap-5">
        {!labs ? (
          <div className="flex flex-col items-start gap-3">
            <Note>{C.failed}</Note>
            <RetryButton />
          </div>
        ) : labs.state === "off" ? (
          <Note>{C.off}</Note>
        ) : labs.state === "no_consent" ? (
          <div className="flex flex-col items-start gap-3">
            <Note>{C.noConsent}</Note>
            <ButtonLink href="/patient/results" tone="outline" size="m">
              {C.openResults}
            </ButtonLink>
          </div>
        ) : labs.state === "minor" ? (
          <Note>{C.minor}</Note>
        ) : labs.state !== "ready" ? (
          <Note>{C.unsigned}</Note>
        ) : !labs.ready.length && !labs.notReady.length ? (
          <Note>{C.empty}</Note>
        ) : (
          <>
            {labs.ready.length ? (
              <section aria-labelledby="labs-ready" className="flex flex-col gap-3">
                <SectionHead id="labs-ready" title={C.ready} />
                <Card className="p-0">
                  <ul>
                    {labs.ready.map((r) => (
                      <li
                        key={r.id}
                        className="border-pw-surface-3 flex items-center gap-3 border-t px-4 py-3 first:border-t-0"
                      >
                        <FlaskConicalIcon
                          className="text-pw-area-medicines size-5 shrink-0"
                          {...ICON}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[17px] font-semibold">{r.test}</span>
                          <span className="text-pw-ink-2 block text-[13px] font-medium">
                            {r.hospitalName} · <span className="font-pw-mono">{r.releasedOn}</span>
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            ) : null}
            {labs.notReady.length ? (
              <section aria-labelledby="labs-not-ready" className="flex flex-col gap-3">
                <SectionHead id="labs-not-ready" title={C.notReady} />
                <Card className="p-0">
                  <ul>
                    {labs.notReady.map((n) => (
                      <li
                        key={n.key}
                        className="border-pw-surface-3 flex flex-col gap-0.5 border-t px-4 py-3 first:border-t-0"
                      >
                        <span className="text-[17px] font-semibold">{n.test}</span>
                        <span className="text-pw-ink-2 text-[13px] font-medium">{n.line}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            ) : null}
            <Note>{C.namesOnly}</Note>
            <ButtonLink href="/patient/results" tone="outline" size="m" className="self-start">
              {C.openResults}
            </ButtonLink>
          </>
        )}
      </div>
    </>
  );
}
