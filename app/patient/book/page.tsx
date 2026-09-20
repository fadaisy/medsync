import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { fetchHousehold } from "@/lib/patient/household";
import { requirePatientScope } from "@/lib/patient/scope";
import { fetchLines } from "@/lib/scheduling/booking-options";
import { cn } from "@/lib/utils";
import { DEFAULT_TIME_ZONE, localDateKey } from "@/supabase/functions/_shared/slots";
import { PatientPageHeader } from "../_components/page-header";
import { BookingWizard } from "./_components/booking-wizard";
import { firstOpenDay } from "./_lib/booking";

// ADR 0084 §2: no jargon anywhere in the flow, and that includes the browser
// tab. "Book" is one of the five words the rule names.
export const metadata: Metadata = { title: "Ask for a day · MedSync" };
export const dynamic = "force-dynamic";

/**
 * A pick made elsewhere — the provider screen's "Book this time", or a
 * service-line tile — arrives as search params and seeds the wizard. Without
 * this the wizard read only localStorage, so the day and time a patient had
 * just chosen were discarded, or worse a stale draft for another clinician
 * resumed in their place.
 */
export default async function PatientBookPage({
  searchParams,
}: {
  searchParams: Promise<{ line?: string; clinician?: string; slot?: string }>;
}) {
  const seed = await searchParams;
  const scope = await requirePatientScope();

  if (!scope.primaryHospitalId) {
    return (
      <div className="stagger-children mx-auto flex w-full max-w-3xl flex-col gap-6">
        <PatientPageHeader
          eyebrow="MedSync"
          title="Choose your hospital first"
          description="A day can only be asked for at the hospital you go to. Choose one, then come back."
        />
        <Link
          href="/patient/hospitals"
          className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-fit")}
        >
          Choose a hospital
        </Link>
      </div>
    );
  }

  const hospitalName = scope.primaryHospitalName ?? "This hospital";
  const now = new Date();
  const [lines, household] = await Promise.all([
    fetchLines(scope.primaryHospitalId, scope.userId, now),
    fetchHousehold(scope.userId),
  ]);
  // A line the patient can act on: an open-queue door, a clinician with a
  // day, or a clinic day published. Lines with nothing are dropped before
  // the wizard sees them — offering a clinic with no days is the sentence
  // "No open times in the next 2 weeks" this page retired (§8).
  const open = lines.filter(
    (l) =>
      l.capacityMode === "open_queue" ||
      l.clinicians.some((c) => firstOpenDay(c) !== undefined) ||
      l.sessions.length > 0,
  );

  if (open.every((l) => l.capacityMode === "open_queue")) {
    return (
      <div className="stagger-children mx-auto flex w-full max-w-3xl flex-col gap-6">
        <PatientPageHeader
          eyebrow={hospitalName}
          title="No days open yet"
          // Nothing here promises a message: no transport carries one. What
          // replaces it is the other door, open by default (ADR 0084 §14).
          description={`${hospitalName} has not put any clinic days on MedSync yet. You can still be seen — going to the hospital does not depend on this app.`}
        />
        <div className="flex flex-col gap-3">
          <Link
            href="/patient/queue"
            className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-fit")}
          >
            Coming to the hospital today
          </Link>
          <p className="text-muted-foreground text-body-s leading-relaxed">
            We save your place in line. You will be seen in turn. We cannot tell you the hour. If
            you arrive without doing that, reception can register you at the desk.
          </p>
        </div>
      </div>
    );
  }

  return (
    // Edge to edge: the shell brings its own gutters and a sticky header that
    // should run edge to edge under the workspace bar, so the layout's
    // padding is taken back here.
    <div className="-mx-4 flex flex-col md:-mx-6">
      <BookingWizard
        hospitalId={scope.primaryHospitalId}
        hospitalName={hospitalName}
        emergencyPhone={scope.emergencyEntrancePhone}
        lines={open}
        household={household.map((m) => ({
          provisionalPatientId: m.provisionalPatientId,
          memberLabel: m.memberLabel,
        }))}
        nowIso={now.toISOString()}
        todayIso={localDateKey(now, DEFAULT_TIME_ZONE)}
        seed={
          seed.line
            ? {
                lineId: seed.line,
                clinicianUserId: seed.clinician ?? null,
                slotStartsAtIso: seed.slot ?? null,
              }
            : null
        }
      />
    </div>
  );
}
