import type { Metadata } from "next";

import { PageHeader } from "@/components/tide/shell";
import { BOOK_COPY as C } from "@/content/patient/book";
import { loadHospitals } from "@/lib/patient-web/book-data";
import { countUnseenNotifications } from "@/lib/patient-web/notifications";
import { requirePatientScope } from "@/lib/patient/scope";
import { HospitalPicker } from "../book/_components/hospital-picker";

export const metadata: Metadata = { title: "Your hospital" };
export const dynamic = "force-dynamic";

/**
 * Pick or change the usual hospital: the first page for a patient with none (Home sends them here), and Me's
 * "change hospital". The Book picker, with the same write as the old page (`selectPrimaryHospitalAction`).
 */
export default async function HospitalsPage() {
  const scope = await requirePatientScope();
  const [hospitals, unseen] = await Promise.all([
    loadHospitals().catch(() => null),
    countUnseenNotifications(scope.userId).catch(() => 0),
  ]);
  const first = scope.primaryHospitalId === null;
  return (
    <>
      <PageHeader
        back={first ? undefined : { href: "/patient/me", label: C.backToMe }}
        overline={first ? C.welcome(scope.fullName?.split(" ")[0] ?? null) : undefined}
        area="visits"
        title={C.hospitalsTitle}
        unseen={unseen}
      />
      <div className="flex max-w-2xl flex-col gap-5">
        <HospitalPicker
          hospitals={hospitals}
          current={scope.primaryHospitalId}
          next="/patient"
          title={first ? C.pickHospitalTitle : C.changeHospitalTitle}
          line={first ? C.pickHospitalLine : C.changeHospitalLine}
        />
      </div>
    </>
  );
}
