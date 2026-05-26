import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";
import { cadres, roles } from "@/db/schema/reference-data";
import { users } from "@/db/schema/users";
import { describeState } from "@/lib/lifecycle";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Your affiliation · MedSync",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Holding page for clinical-staff signups between submission and approval.
 *
 * Reached:
 *   - immediately after the clinical signup form (the success redirect)
 *   - on every subsequent sign-in for users whose only relationship to
 *     the platform is a pending staff_affiliation (no superadmin /
 *     hospital_admin / pending hospital application).
 *
 * Once a superadmin approves the affiliation:
 *   - clinician role is granted (Edge Function approve-staff-affiliation)
 *   - users.state flips to approved
 *   - sign-in routing falls through this branch and goes to / (Phase 0
 *     has no clinical workspace yet; revisit when /clinical lands).
 */
export default async function ClinicalPendingPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/sign-in?redirect=/onboarding/clinical-pending");
  }

  const [aff] = await db
    .select({
      id: staffAffiliations.id,
      state: staffAffiliations.state,
      rejectionReason: staffAffiliations.rejectionReason,
      employmentType: staffAffiliations.employmentType,
      createdAt: staffAffiliations.createdAt,
      hospitalName: hospitals.name,
      departmentName: hospitalDepartments.name,
      roleName: roles.name,
      cadreName: cadres.name,
    })
    .from(staffAffiliations)
    .innerJoin(hospitals, eq(hospitals.id, staffAffiliations.hospitalId))
    .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, staffAffiliations.departmentId))
    .innerJoin(roles, eq(roles.id, staffAffiliations.roleId))
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .where(eq(staffAffiliations.userId, userData.user.id))
    .orderBy(desc(staffAffiliations.createdAt))
    .limit(1);

  // No affiliation on file — they reached this page in error. Bounce home.
  if (!aff) redirect("/");

  // Once approved, they shouldn't be here. The sign-in action skips this
  // branch automatically; this is a defence-in-depth bounce for anyone
  // who navigates here directly.
  if (aff.state === "approved" || aff.state === "active") {
    redirect("/");
  }

  const [me] = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, userData.user.id))
    .limit(1);

  const isUnderReview = aff.state === "pending_approval" || aff.state === "under_review";
  const isRejected = aff.state === "rejected";

  return (
    <div className="bg-background min-h-svh">
      <header className="border-gray-150 border-b">
        <div className="mx-auto flex w-full max-w-300 items-center justify-between px-8 py-4">
          <Link
            href="/"
            className="font-display text-foreground text-[15px] font-medium tracking-tight"
          >
            MedSync
          </Link>
          <form action="/sign-out" method="POST">
            <button
              type="submit"
              className="text-muted-foreground hover:text-foreground text-[12px]"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-5 py-16 sm:px-8 sm:py-24">
        <div className="flex flex-col gap-3">
          <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
            <span
              className={"size-1 rounded-full " + (isRejected ? "bg-red-500" : "bg-amber-500")}
            />
            {describeState(aff.state as Parameters<typeof describeState>[0])}
          </span>
          <h1 className="font-display text-foreground text-[32px] leading-tight font-medium tracking-[-0.02em] sm:text-[40px]">
            {isRejected ? "Your affiliation wasn't approved" : "We're verifying your affiliation"}
          </h1>
          <p className="text-muted-foreground text-[15px] leading-relaxed">
            {isRejected ? (
              <>
                Our review found:{" "}
                <span className="text-foreground italic">
                  {aff.rejectionReason ?? "(no reason recorded yet)"}
                </span>
                . Reach out to your hospital admin or to MedSync support if you&apos;d like to
                discuss next steps.
              </>
            ) : (
              <>
                Thanks{me?.fullName ? `, ${me.fullName.split(" ")[0]}` : ""}. We&apos;ve sent your
                affiliation with{" "}
                <span className="text-foreground font-medium">{aff.hospitalName}</span> to that
                hospital&apos;s admin team for verification against the {aff.cadreName} council
                registry. You&apos;ll be emailed the moment a decision is made.
              </>
            )}
          </p>
        </div>

        <section className="border-border bg-card flex flex-col gap-3 rounded-lg border p-5">
          <h2 className="text-foreground text-[14px] font-medium">Affiliation on file</h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-[140px_1fr]">
            <dt className="text-muted-foreground font-mono text-[10.5px] tracking-[0.06em] uppercase">
              Hospital
            </dt>
            <dd className="text-foreground">{aff.hospitalName}</dd>

            <dt className="text-muted-foreground font-mono text-[10.5px] tracking-[0.06em] uppercase">
              Department
            </dt>
            <dd className="text-foreground">{aff.departmentName}</dd>

            <dt className="text-muted-foreground font-mono text-[10.5px] tracking-[0.06em] uppercase">
              Role
            </dt>
            <dd className="text-foreground">
              {aff.roleName} <span className="text-muted-foreground">({aff.cadreName})</span>
            </dd>

            <dt className="text-muted-foreground font-mono text-[10.5px] tracking-[0.06em] uppercase">
              Employment
            </dt>
            <dd className="text-foreground capitalize">{aff.employmentType.replace(/_/g, " ")}</dd>

            <dt className="text-muted-foreground font-mono text-[10.5px] tracking-[0.06em] uppercase">
              Submitted
            </dt>
            <dd className="text-muted-foreground font-mono">
              {new Date(aff.createdAt).toLocaleString()}
            </dd>

            <dt className="text-muted-foreground font-mono text-[10.5px] tracking-[0.06em] uppercase">
              Status
            </dt>
            <dd
              className={
                "font-medium " +
                (isRejected
                  ? "text-red-700 dark:text-red-300"
                  : "text-amber-700 dark:text-amber-300")
              }
            >
              {describeState(aff.state as Parameters<typeof describeState>[0])}
            </dd>
          </dl>
        </section>

        {isUnderReview ? (
          <section className="border-border bg-muted/30 flex flex-col gap-2 rounded-lg border p-5 text-[12.5px] leading-relaxed">
            <p className="text-foreground font-medium">What happens next</p>
            <ol className="text-muted-foreground flex flex-col gap-1.5 pl-4">
              <li>
                1. The hospital admin verifies your registration against the council registry.
              </li>
              <li>2. They confirm your role and department against their internal records.</li>
              <li>
                3. On approval: you complete MFA enrolment and your clinician role is activated for
                that hospital.
              </li>
            </ol>
          </section>
        ) : null}

        <p className="text-muted-foreground text-center text-[11.5px]">
          You can close this tab — we&apos;ll notify you by email.
        </p>
      </main>
    </div>
  );
}
