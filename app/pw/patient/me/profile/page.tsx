import type { Metadata } from "next";

import { Note, TextLink } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { ME_COPY as C } from "@/content/patient/me";
import { loadOnFile } from "@/lib/patient-web/me-data";
import { countUnseenNotifications } from "@/lib/patient-web/notifications";
import { requirePatientScope } from "@/lib/patient/scope";
import { RetryButton } from "../../_components/home-bits";
import { DetailsForm } from "./_components/details-form";

export const metadata: Metadata = { title: "A few more details · MedSync" };
export const dynamic = "force-dynamic";

/**
 * "A few more details" (the phone's (app)/profile/details.tsx): title, language, the usual hospital, an ID
 * and a next of kin, all optional. Title, language, ID and next of kin go through `/api/mobile/profile`,
 * which holds the encryption key and never sends the ID or the next of kin back: the page learns only that
 * one is on file. The hospital is changed on the hospitals page, the web's one writer for it.
 */
export default async function ProfilePage() {
  const scope = await requirePatientScope();
  const [onFile, unseen] = await Promise.all([
    loadOnFile().catch(() => ({ ok: false as const, message: C.detailsFailed })),
    countUnseenNotifications(scope.userId).catch(() => 0),
  ]);
  const hospital = (
    <section className="rounded-pw-card bg-pw-surface shadow-pw-card flex flex-col gap-2 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[17px] leading-[22px] font-semibold">{C.hospitalPart}</h2>
        {scope.primaryHospitalName ? (
          <span className="text-pw-accent-text text-[13px] font-semibold">{C.added}</span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-[17px]">{scope.primaryHospitalName ?? C.notChosen}</p>
        <TextLink href="/patient/hospitals">
          {scope.primaryHospitalName ? C.changePick : C.choose}
        </TextLink>
      </div>
    </section>
  );
  return (
    <>
      <PageHeader
        back={{ href: "/patient/me", label: C.backToMe }}
        overline={C.details}
        area="me"
        title={C.detailsTitle}
        subtitle={C.detailsIntro}
        unseen={unseen}
      />
      <div className="flex max-w-2xl flex-col gap-3">
        {onFile.ok ? (
          <DetailsForm onFile={onFile.onFile} hospital={hospital} />
        ) : (
          <div className="flex flex-col items-start gap-2">
            {hospital}
            <Note>{`${onFile.message} ${C.detailsLoadTail}`}</Note>
            <RetryButton />
          </div>
        )}
      </div>
    </>
  );
}
