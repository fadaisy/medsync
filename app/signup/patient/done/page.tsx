import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightIcon, BellIcon, ShieldCheckIcon, UserPlusIcon } from "lucide-react";

import { getAuthState } from "@/lib/auth";
import { getPatientCode } from "@/lib/patient";
import { SignupShell } from "../../_components/signup-shell";

export const metadata: Metadata = {
  title: "You're in",
  robots: { index: false, follow: false },
};

interface DonePageProps {
  searchParams: Promise<{ code?: string }>;
}

/**
 * /signup/patient/done — terminal success page. Shows the patient's
 * MS-YYYY-NNNNN code in a bold teal-lit panel and lays out the next
 * three actions they'll want to take from the dashboard.
 */
export default async function DonePage({ searchParams }: DonePageProps) {
  const params = await searchParams;
  const auth = await getAuthState();

  if (!auth.user) redirect("/sign-in?redirect=/signup/patient/done");

  let code: string | null = params.code ?? null;
  if (!code) {
    code = await getPatientCode(auth.user.id);
  }
  if (!code) {
    redirect("/signup/patient");
  }

  return (
    <SignupShell
      pathSegments={["signup", "patient", "done"]}
      eyebrow="Active · welcome aboard"
      title={
        <>
          You&apos;re <span className="text-teal-700 italic dark:text-teal-300">in.</span>
        </>
      }
      subtitle={
        <>
          Your record is live and encrypted. Below is your patient ID — your care team uses this to
          find you across every MedSync hospital.
        </>
      }
      maxWidth={150}
    >
      <div className="flex flex-col gap-6">
        {/* Patient-ID hero card */}
        <section
          className={[
            "medsync-forced-dark relative overflow-hidden rounded-2xl bg-teal-900 p-6 text-white sm:p-8",
            "before:pointer-events-none before:absolute before:inset-0 before:opacity-60 before:[background:radial-gradient(closest-side,oklch(0.55_0.10_180/0.45),transparent_70%)]",
          ].join(" ")}
        >
          <div className="relative flex flex-col gap-3">
            <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-teal-200 uppercase">
              <span className="size-1 rounded-full bg-teal-300" />
              Your patient ID
            </span>
            <span className="font-mono text-[32px] tracking-[0.04em] text-balance sm:text-[40px]">
              {code}
            </span>
            <span className="max-w-[42ch] text-[12.5px] text-teal-100">
              Keep this somewhere safe. You can also find it on your dashboard at any time — your
              care team uses it to pull up your record at any MedSync hospital.
            </span>
          </div>
        </section>

        {/* Next steps */}
        <section className="border-border bg-card flex flex-col gap-4 rounded-xl border p-5 shadow-xs sm:p-6">
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
            What&apos;s next
          </span>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <NextStep
              Icon={UserPlusIcon}
              title="Pick a primary facility"
              body="Visits + prescriptions arrive in the right inbox."
            />
            <NextStep
              Icon={BellIcon}
              title="Add a next-of-kin"
              body="So a clinician can reach someone for you in an emergency."
            />
            <NextStep
              Icon={ShieldCheckIcon}
              title="Turn on 2FA"
              body="An extra layer beyond email — optional for patients."
            />
          </ul>
        </section>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            href="/dashboard"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center gap-1.5 rounded-md px-5 text-[13.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
          >
            Go to dashboard
            <ArrowRightIcon className="size-3.5" strokeWidth={2} />
          </Link>
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground text-[13px] transition-colors"
          >
            Back to MedSync home
          </Link>
        </div>
      </div>
    </SignupShell>
  );
}

function NextStep({
  Icon,
  title,
  body,
}: {
  Icon: typeof UserPlusIcon;
  title: string;
  body: string;
}) {
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
