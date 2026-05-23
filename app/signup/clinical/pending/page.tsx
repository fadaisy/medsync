import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthState } from "@/lib/auth";
import { getClinicianAffiliationForUser } from "@/lib/clinician";

export const metadata: Metadata = {
  title: "Submitted for approval",
  robots: { index: false, follow: false },
};

/**
 * /signup/clinical/pending — terminal "submitted for approval" page.
 *
 * Reached after OTP verification. The user can land here at any time
 * after signup completes (back button, fresh tab, link from email)
 * and will see the current state of their first affiliation.
 *
 * MFA enrolment is presented as the next concrete step. The proxy
 * routes MFA-required roles through /onboarding/mfa-setup on their
 * first authenticated request — this page surfaces the same link as
 * a CTA so the user doesn't wonder what comes next.
 */
export default async function ClinicalPendingPage() {
  const auth = await getAuthState();
  if (!auth.user) redirect("/sign-in?redirect=/signup/clinical/pending");

  const affiliation = await getClinicianAffiliationForUser(auth.user.id);
  if (!affiliation) {
    // Signed in but never finished signup — back to step 1.
    redirect("/signup/clinical");
  }

  const stateLabel = humanState(affiliation.state);

  return (
    <div className="mx-auto flex w-full max-w-150 flex-col gap-8 px-5 py-14 sm:px-8 sm:py-20">
      <div className="flex flex-col items-start gap-3">
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className="size-1 rounded-full bg-amber-500" />
          {stateLabel}
        </span>
        <h1
          className="font-display text-foreground text-[30px] leading-[1.1] tracking-[-0.025em] text-balance sm:text-[40px]"
          style={{ fontWeight: 400 }}
        >
          Submitted.
        </h1>
        <p className="text-muted-foreground max-w-[58ch] text-[15px] leading-[1.55] sm:text-[16.5px]">
          Your council registration and first affiliation are in your hospital admin&apos;s approval
          queue. You&apos;ll get an email when they decide. In the meantime, set up MFA —
          you&apos;ll need it before any clinical access opens up.
        </p>
      </div>

      <div className="border-border bg-card flex flex-col gap-3 rounded-md border p-4">
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          Affiliation
        </span>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr]">
          <dt className="text-muted-foreground text-[12px]">State</dt>
          <dd className="text-foreground text-[13px] font-medium">{stateLabel}</dd>
          <dt className="text-muted-foreground text-[12px]">Employment</dt>
          <dd className="text-foreground text-[13px]">
            {affiliation.employmentType.replace(/_/g, " ")}
          </dd>
          <dt className="text-muted-foreground text-[12px]">Submitted</dt>
          <dd className="text-foreground text-[13px]">
            {affiliation.createdAt.toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </dd>
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
              Set up two-factor auth — mandatory for clinical roles before any clinical access opens
              up.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-teal-500" />
            <span className="text-foreground/85">
              You&apos;ll get an email when your hospital admin reviews your affiliation.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-teal-500" />
            <span className="text-foreground/85">
              Approval typically lands within a working day. Reach out to your hospital admin if you
              need to escalate.
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
      return "Pending approval";
    case "approved":
      return "Approved";
    case "active":
      return "Active";
    case "rejected":
      return "Rejected";
    case "suspended":
      return "Suspended";
    default:
      return state;
  }
}
