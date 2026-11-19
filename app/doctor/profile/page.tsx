import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";

import { PhotoForm } from "@/components/forms";
import { Tag } from "@/components/medsync/tag";
import { db } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";
import { signedAvatarUrl } from "@/lib/avatars";
import { requireDoctorScope } from "@/lib/doctor/scope";
import { describeState } from "@/lib/lifecycle";
import { listHospitals } from "@/lib/reference-data";
import { AddHospital } from "./_components/add-hospital";
import { updateDoctorPhotoAction } from "./actions";

export const metadata: Metadata = { title: "Your profile · Doctor · MedSync" };
export const dynamic = "force-dynamic";

/**
 * "Your profile" — the photo control (ADR 0085 §1) beside the identity
 * the scope already resolved. Name, hospital and cadre are read-only
 * here: they come from `users` and the approved affiliation, and change
 * through the hospital admin, not this page.
 */
export default async function DoctorProfilePage() {
  const scope = await requireDoctorScope();
  const [photoUrl, mine, all] = await Promise.all([
    signedAvatarUrl(scope.avatarPath),
    db
      .select({
        id: staffAffiliations.id,
        hospitalId: staffAffiliations.hospitalId,
        hospitalName: hospitals.name,
        departmentName: hospitalDepartments.name,
        state: staffAffiliations.state,
      })
      .from(staffAffiliations)
      .innerJoin(hospitals, eq(hospitals.id, staffAffiliations.hospitalId))
      .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, staffAffiliations.departmentId))
      .where(eq(staffAffiliations.userId, scope.userId))
      .orderBy(asc(hospitals.name)),
    listHospitals(),
  ]);
  // Closed requests may be asked again (joinRefusal); every other hospital is not offered.
  const held = mine
    .filter((a) => !["rejected", "deactivated"].includes(a.state))
    .map((a) => a.hospitalId);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 lg:px-6 lg:py-9">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground text-overline inline-flex items-center gap-1.5 font-mono uppercase">
          <span aria-hidden className="bg-iris-icon ring-iris-edge size-1 rounded-full ring-2" />
          {scope.hospitalName} · {scope.departmentName} · Profile
        </span>
        <h1 className="font-display text-display-s text-foreground">Your profile</h1>
        <p className="text-muted-foreground text-body-s max-w-[60ch] leading-relaxed">
          Your photo is shown to patients who can book you and to colleagues. Without one they see
          your initial.
        </p>
      </header>

      <section
        aria-labelledby="photo-head"
        className="bg-card border-border shadow-card flex flex-col gap-3 rounded-lg border p-6"
      >
        <h2 id="photo-head" className="text-foreground text-heading-s">
          Photo
        </h2>
        <PhotoForm
          action={updateDoctorPhotoAction}
          currentUrl={photoUrl}
          personName={scope.fullName}
        />
      </section>

      <section
        aria-labelledby="identity-head"
        className="bg-card border-border shadow-card flex flex-col gap-3 rounded-lg border p-6"
      >
        <h2 id="identity-head" className="text-foreground text-heading-s">
          Identity
        </h2>
        <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <ReadField label="Name" value={scope.fullName ?? scope.userEmail} />
          <ReadField label="Cadre" value={scope.cadreName} />
          <ReadField label="Hospital" value={scope.hospitalName} />
          <ReadField label="Department" value={scope.departmentName} />
        </dl>
        <p className="text-muted-foreground text-body-s leading-relaxed">
          These come from your approved affiliation. Ask your hospital admin to change them.
        </p>
      </section>

      <section
        aria-labelledby="hospitals-head"
        className="bg-card border-border shadow-card flex flex-col gap-3 rounded-lg border p-6"
      >
        <h2 id="hospitals-head" className="text-foreground text-heading-s">
          Your hospitals
        </h2>
        <ul className="divide-border flex flex-col divide-y">
          {mine.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="text-body-m text-foreground font-medium">{a.hospitalName}</p>
                <p className="text-body-s text-muted-foreground">{a.departmentName}</p>
              </div>
              <Tag>{describeState(a.state as Parameters<typeof describeState>[0])}</Tag>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-body-s leading-relaxed">
          Each hospital&rsquo;s admin approves you there on their own. To stop working at a
          hospital, ask its admin.
        </p>
        <AddHospital hospitals={all.map((h) => ({ id: h.id, name: h.name }))} exclude={held} />
      </section>
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted-foreground text-overline uppercase">{label}</dt>
      <dd className="text-foreground text-body-m break-words">{value}</dd>
    </div>
  );
}
