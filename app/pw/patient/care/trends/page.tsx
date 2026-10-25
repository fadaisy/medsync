import type { Metadata } from "next";
import Link from "next/link";
import { readingsFrom } from "@patient-core/log";
import { THRESHOLDS_NOTE } from "@patient-core/readings";
import { PlusIcon } from "lucide-react";

import { ICON } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { CARE_COPY } from "@/content/patient/care";
import { loadLog } from "@/lib/patient-web/day";
import { requirePatientScope } from "@/lib/patient/scope";
import { RetryButton } from "../../_components/home-bits";
import { TrendsView } from "./_components/trends-view";

export const metadata: Metadata = { title: "Health trends" };
export const dynamic = "force-dynamic";

const C = CARE_COPY.trends;

/** Health trends (the phone's care/trends.tsx), from the patient's own readings of the last seven days. */
export default async function TrendsPage() {
  const scope = await requirePatientScope();
  const rows = await loadLog(scope.userId, 8).catch(() => null);
  return (
    <>
      <PageHeader
        title={C.title}
        area="readings"
        back={{ href: "/patient/care", label: CARE_COPY.backToCare }}
        tools={
          <Link
            href="/patient/care/readings"
            aria-label={C.logReading}
            className="bg-pw-accent text-pw-on-accent shadow-pw-accent focus-visible:outline-pw-focus grid size-12 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <PlusIcon className="size-5" {...ICON} strokeWidth={2.3} />
          </Link>
        }
      />
      {rows ? (
        <TrendsView nowIso={new Date().toISOString()} readings={readingsFrom(rows)} />
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-pw-ink-2 text-[17px]">{C.failed}</p>
          <RetryButton />
        </div>
      )}
      <p className="text-pw-ink-3 mt-6 text-center text-[13px] font-medium">{THRESHOLDS_NOTE}</p>
    </>
  );
}
