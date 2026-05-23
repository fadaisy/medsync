import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthState } from "@/lib/auth";
import { getHospitalApplicationForUser } from "@/lib/hospital";

export const metadata: Metadata = {
  title: "Application submitted",
  robots: { index: false, follow: false },
};

/**
 * /signup/hospital/pending — terminal "application submitted" page.
 *
 * Reached after OTP verification. Surfaces the application's current
 * state (pending_approval / approved / rejected) and the next concrete
 * action — MFA setup, since the applicant will be elevated to
 * hospital_admin on approval and clinical access requires AAL2.
 */
export default async function HospitalPendingPage() {
  const auth = await getAuthState();
  if (!auth.user) redirect("/sign-in?redirect=/signup/hospital/pending");

  const application = await getHospitalApplicationForUser(auth.user.id);
  if (!application) {
    redirect("/signup/hospital");
  }

  const stateLabel = humanState(application.state);
  const stateTone = toneFor(application.state);

  return (
    <div className="mx-auto flex w-full max-w-150 flex-col gap-8 px-5 py-14 sm:px-8 sm:py-20">
      <div className="flex flex-col items-start gap-3">
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className={`size-1 rounded-full ${stateTone.dot}`} />
          {stateLabel}
        </span>
        <h1
          className="font-display text-foreground text-[30px] leading-[1.1] tracking-[-0.025em] text-balance sm:text-[40px]"
          style={{ fontWeight: 400 }}
        >
          Application submitted.
        </h1>
        <p className="text-muted-foreground max-w-[58ch] text-[15px] leading-[1.55] sm:text-[16.5px]">
          Your facility is in the MedSync superadmin review queue. We confirm registration with the
          relevant authority and your role at the institution before approval. You&apos;ll get an
          email when we decide — typically within a working day.
        </p>
      </div>

      <div className="border-border bg-card flex flex-col gap-3 rounded-md border p-4">
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          Application
        </span>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
          <dt className="text-muted-foreground text-[12px]">Facility</dt>
          <dd className="text-foreground text-[13px] font-medium">{application.hospitalName}</dd>
          <dt className="text-muted-foreground text-[12px]">Level</dt>
          <dd className="text-foreground text-[13px]">{application.level.replace(/_/g, " ")}</dd>
          <dt className="text-muted-foreground text-[12px]">Ownership</dt>
          <dd className="text-foreground text-[13px]">
            {application.ownership.replace(/_/g, " ")}
          </dd>
          <dt className="text-muted-foreground text-[12px]">State</dt>
          <dd className="text-foreground text-[13px] font-medium">{stateLabel}</dd>
          <dt className="text-muted-foreground text-[12px]">Submitted</dt>
          <dd className="text-foreground text-[13px]">
            {application.createdAt.toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </dd>
          {application.rejectionReason ? (
            <>
              <dt className="text-muted-foreground text-[12px]">Notes</dt>
              <dd className="text-status-critical-fg text-[13px]">{application.rejectionReason}</dd>
            </>
          ) : null}
        </dl>
      </div>

      <div className="border-border bg-card flex flex-col gap-3 rounded-md border p-4">
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          What&apos;s next
        </span>
        <ul className="flex flex-col gap-2 text-[13.5px]">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-teal-500" />
            <span className="text-foreground/85">
              Set up two-factor auth — mandatory for the hospital_admin role you&apos;ll receive on
              approval.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-teal-500" />
            <span className="text-foreground/85">
              We email you the outcome. On approval, your dashboard shows the empty hospital ready
              for clinician affiliations.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-teal-500" />
            <span className="text-foreground/85">
              Clinicians sign up separately at /signup/clinical and pick your facility — you approve
              each affiliation from the dashboard.
            </span>
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/onboarding/mfa-setup"
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
        >
          Set up MFA &rarr;
        </Link>
        <Link
          href="/dashboard"
          className="border-border text-foreground inline-flex h-9 items-center rounded-md border px-4 text-[13px] transition-colors hover:border-teal-300"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}

function humanState(state: string): string {
  switch (state) {
    case "pending_approval":
      return "Pending review";
    case "approved":
    case "active":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "suspended":
      return "Suspended";
    default:
      return state;
  }
}

function toneFor(state: string): { dot: string } {
  switch (state) {
    case "approved":
    case "active":
      return { dot: "bg-teal-500" };
    case "rejected":
      return { dot: "bg-red-500" };
    case "suspended":
      return { dot: "bg-gray-400" };
    case "pending_approval":
    default:
      return { dot: "bg-amber-500" };
  }
}
