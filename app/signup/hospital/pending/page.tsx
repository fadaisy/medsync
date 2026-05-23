import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightIcon, ClockIcon, MailIcon, ShieldCheckIcon } from "lucide-react";

import { getAuthState } from "@/lib/auth";
import { getHospitalApplicationForUser } from "@/lib/hospital";
import { SignupShell } from "../../_components/signup-shell";

export const metadata: Metadata = {
  title: "Application submitted",
  robots: { index: false, follow: false },
};

export default async function HospitalPendingPage() {
  const auth = await getAuthState();
  if (!auth.user) redirect("/sign-in?redirect=/signup/hospital/pending");

  const application = await getHospitalApplicationForUser(auth.user.id);
  if (!application) redirect("/signup/hospital");

  const stateLabel = humanState(application.state);
  const tone = toneFor(application.state);

  return (
    <SignupShell
      pathSegments={["signup", "hospital", "pending"]}
      eyebrow={`Status · ${stateLabel}`}
      title={
        <>
          Application <span className="text-teal-700 italic dark:text-teal-300">submitted.</span>
        </>
      }
      subtitle={
        <>
          Your facility is in the MedSync superadmin review queue. We confirm registration with the
          relevant authority and your role at the institution before approval. You&apos;ll get an
          email when we decide — typically within a working day.
        </>
      }
      maxWidth={150}
    >
      <div className="flex flex-col gap-6">
        {/* Facility summary */}
        <section className="border-border bg-card flex flex-col gap-4 rounded-xl border p-5 shadow-xs sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
              Application
            </span>
            <span
              className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium ${tone.pill}`}
            >
              {stateLabel}
            </span>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[140px_1fr]">
            <dt className="text-muted-foreground text-[12px]">Facility</dt>
            <dd className="text-foreground text-[13px] font-medium">{application.hospitalName}</dd>
            <dt className="text-muted-foreground text-[12px]">Level</dt>
            <dd className="text-foreground text-[13px]">{application.level.replace(/_/g, " ")}</dd>
            <dt className="text-muted-foreground text-[12px]">Ownership</dt>
            <dd className="text-foreground text-[13px]">
              {application.ownership.replace(/_/g, " ")}
            </dd>
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
                <dd className="text-status-critical-fg text-[13px] whitespace-pre-line">
                  {application.rejectionReason}
                </dd>
              </>
            ) : null}
          </dl>
        </section>

        {/* Next steps */}
        <section className="border-border bg-card flex flex-col gap-4 rounded-xl border p-5 shadow-xs sm:p-6">
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
            What&apos;s next
          </span>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <NextStep
              Icon={ShieldCheckIcon}
              title="Set up MFA"
              body="Mandatory for the hospital_admin role you'll receive on approval."
            />
            <NextStep
              Icon={MailIcon}
              title="Watch your inbox"
              body="We email you the outcome — usually within a working day."
            />
            <NextStep
              Icon={ClockIcon}
              title="On approval"
              body="Your dashboard shows the empty hospital, ready for clinicians."
            />
          </ul>
        </section>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            href="/onboarding/mfa-setup"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center gap-1.5 rounded-md px-5 text-[13.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
          >
            Set up MFA
            <ArrowRightIcon className="size-3.5" strokeWidth={2} />
          </Link>
          <Link
            href="/dashboard"
            className="border-border text-foreground inline-flex h-10 items-center rounded-md border px-5 text-[13px] transition-colors hover:border-teal-300"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </SignupShell>
  );
}

function NextStep({ Icon, title, body }: { Icon: typeof MailIcon; title: string; body: string }) {
  return (
    <li className="flex flex-col gap-2">
      <span
        aria-hidden
        className="inline-flex size-8 items-center justify-center rounded-md bg-teal-50 text-teal-700 dark:bg-teal-50/15 dark:text-teal-200"
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="text-foreground text-[13px] leading-tight font-medium">{title}</span>
      <span className="text-muted-foreground text-[12px] leading-snug">{body}</span>
    </li>
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

function toneFor(state: string): { pill: string } {
  switch (state) {
    case "approved":
    case "active":
      return { pill: "bg-teal-500/15 text-teal-700 dark:text-teal-300" };
    case "rejected":
      return { pill: "bg-red-500/15 text-red-700 dark:text-red-300" };
    case "suspended":
      return { pill: "bg-gray-400/15 text-gray-700 dark:text-gray-300" };
    case "pending_approval":
    default:
      return { pill: "bg-amber-500/15 text-amber-700 dark:text-amber-400" };
  }
}
