import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

import { EmptyState, ICON, Note, Pill } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { ME_COPY as C } from "@/content/patient/me";
import { PATIENT_WEB_COPY as W } from "@/content/patient/web";
import { loadRecords } from "@/lib/patient-web/me-data";
import { countUnseenNotifications } from "@/lib/patient-web/notifications";
import { formatFullDate } from "@/lib/patient/booking-format";
import { requirePatientScope } from "@/lib/patient/scope";
import { RetryButton } from "../../_components/home-bits";

export const metadata: Metadata = { title: "Visit records" };
export const dynamic = "force-dynamic";

/**
 * Visit records (the phone's (app)/records/index.tsx, ADR 0342 §2): the summaries a clinician shared with
 * this patient, newest first, through the web's own decrypting readers. A held copy never reaches a patient.
 */
export default async function RecordsPage() {
  const scope = await requirePatientScope();
  const [records, unseen] = await Promise.all([
    loadRecords(scope.userId).catch(() => null),
    countUnseenNotifications(scope.userId).catch(() => 0),
  ]);
  return (
    <>
      <PageHeader
        back={{ href: "/patient/me", label: C.backToMe }}
        overline={C.myHealth}
        area="me"
        title={C.recordsTitle}
        subtitle={C.recordsIntro}
        unseen={unseen}
      />
      <div className="flex max-w-2xl flex-col gap-3">
        {!records ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-pw-ink-2 text-[17px]">{C.recordsFailed}</p>
            <RetryButton />
          </div>
        ) : !records.length ? (
          <EmptyState title={C.recordsEmpty} />
        ) : (
          <ul className="flex flex-col gap-3">
            {records.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/patient/me/records/${v.id}`}
                  className="rounded-pw-card bg-pw-surface shadow-pw-card hover:bg-pw-surface-2 focus-visible:outline-pw-focus flex items-center gap-3 p-5 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[17px] leading-[22px] font-semibold">
                      {formatFullDate(v.startedAt)}
                    </span>
                    <span className="text-pw-ink-2 text-[15px] font-medium">
                      {v.hospitalName}
                      {v.clinician ? ` · ${v.clinician}` : ""}
                    </span>
                    <span className="text-[15px] font-medium">{v.outcome}</span>
                    {v.updated ? <Pill className="mt-1 self-start">{C.updated}</Pill> : null}
                  </span>
                  <ChevronRightIcon className="text-pw-ink-3 size-5 shrink-0" {...ICON} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Note>{W.whoSeesRecords}</Note>
      </div>
    </>
  );
}
