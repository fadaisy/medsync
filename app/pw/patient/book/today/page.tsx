import type { Metadata } from "next";
import { dayKeyOf, shortDayOf } from "@patient-core/book-days";

import { PageHeader } from "@/components/tide/shell";
import { TODAY_COPY as T } from "@/content/patient/book";
import { loadClinicsOpenNow, loadHospitals, loadPatientBits } from "@/lib/patient-web/book-data";
import { patientFlag } from "@/lib/patient-web/flags";
import { countUnseenNotifications } from "@/lib/patient-web/notifications";
import { fetchLiveIntakeToday } from "@/lib/patient/appointments";
import { requirePatientScope } from "@/lib/patient/scope";
import { HospitalPicker } from "../_components/hospital-picker";
import { HonestNote } from "../_components/why-coming";
import { RetryButton } from "../../_components/home-bits";
import { TodayForm } from "./_components/today-form";

export const metadata: Metadata = { title: "Join today's line" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Come today (the phone's (app)/book/today.tsx): the clinics taking walk-ins now and their fee, saving your
 * place (`pt-declare-intake`), its stage, and giving it up (`ha-cancel-intake`). Never a place number, a count,
 * a wait or an hour (L8): the phone's "N ahead of you" is not copied. The web keeps no ticket on the device
 * (W3), so the server's live intake is the ticket. Payments are simulated.
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ clinic?: string; s?: string }>;
}) {
  const scope = await requirePatientScope();
  const params = await searchParams;
  const hospitalId = scope.primaryHospitalId;
  const unseen = await countUnseenNotifications(scope.userId).catch(() => 0);
  const header = (overline?: string) => (
    <PageHeader
      back={{ href: "/patient/book", label: T.back }}
      overline={overline}
      area="visits"
      title={T.title}
      unseen={unseen}
    />
  );

  if (!hospitalId) {
    const hospitals = await loadHospitals().catch(() => null);
    return (
      <>
        {header()}
        <div className="flex max-w-2xl flex-col gap-5">
          <HospitalPicker hospitals={hospitals} />
          <HonestNote />
        </div>
      </>
    );
  }

  const [clinics, live, bits] = await Promise.all([
    loadClinicsOpenNow(hospitalId).catch(() => null),
    fetchLiveIntakeToday(scope.userId, hospitalId).catch(() => null),
    loadPatientBits(scope.userId).catch(() => ({ patientCode: null, sex: null })),
  ]);
  const todayKey = dayKeyOf(new Date());

  if (!clinics && !live) {
    return (
      <>
        {header()}
        <div className="flex flex-col items-start gap-3">
          <p className="text-pw-ink-2 text-[17px]">{T.loadFailed}</p>
          <RetryButton />
        </div>
      </>
    );
  }

  return (
    <TodayForm
      unseen={unseen}
      today={shortDayOf(todayKey)}
      hospitalName={scope.primaryHospitalName ?? ""}
      patient={scope.fullName?.trim() || "[First name] [Surname]"}
      patientCode={bits.patientCode}
      clinics={clinics ?? []}
      fromHome={params.clinic && UUID.test(params.clinic) ? params.clinic : null}
      submissionId={params.s && UUID.test(params.s) ? params.s : null}
      live={live ? { id: live.id, status: live.status, clinic: live.departmentName } : null}
      paymentsOn={patientFlag("mobilePayments")}
    />
  );
}
