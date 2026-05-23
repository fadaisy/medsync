import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthState } from "@/lib/auth";
import { getPatientCode } from "@/lib/patient";

export const metadata: Metadata = {
  title: "You're in",
  robots: { index: false, follow: false },
};

interface DonePageProps {
  searchParams: Promise<{ code?: string }>;
}

/**
 * /signup/patient/done — terminal success page. Shows the patient
 * their MS-YYYY-NNNNN code and routes them to the dashboard.
 *
 * The MS-ID arrives via ?code= when the verify action redirects here.
 * If the user lands without it (back button, fresh tab) we read it
 * from the DB using their session.
 */
export default async function DonePage({ searchParams }: DonePageProps) {
  const params = await searchParams;
  const auth = await getAuthState();

  // Not signed in (cookie expired, came in fresh) → send to sign-in.
  if (!auth.user) redirect("/sign-in?redirect=/signup/patient/done");

  let code: string | null = params.code ?? null;
  if (!code) {
    code = await getPatientCode(auth.user.id);
  }
  if (!code) {
    // Signed in but no profile — they didn't actually finish signup;
    // bounce them back to step 1.
    redirect("/signup/patient");
  }

  return (
    <div className="mx-auto flex w-full max-w-150 flex-col gap-8 px-5 py-14 sm:px-8 sm:py-20">
      <div className="flex flex-col items-start gap-3">
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className="size-1 rounded-full bg-teal-500" />
          Active
        </span>
        <h1
          className="font-display text-foreground text-[30px] leading-[1.1] tracking-[-0.025em] text-balance sm:text-[40px]"
          style={{ fontWeight: 400 }}
        >
          You&apos;re in.
        </h1>
        <p className="text-muted-foreground max-w-[58ch] text-[15px] leading-[1.55] sm:text-[16.5px]">
          Your record is live. Below is your patient ID — your care team uses this to find you
          across hospitals.
        </p>
      </div>

      <div className="medsync-forced-dark flex flex-col gap-2 rounded-lg bg-teal-900 p-5 text-white">
        <span className="font-mono text-[10px] tracking-[0.18em] text-teal-200 uppercase">
          Your patient ID
        </span>
        <span className="font-mono text-[28px] tracking-[0.04em] sm:text-[34px]">{code}</span>
        <span className="text-[12px] text-teal-100">
          Keep this somewhere safe. You can also find it on your dashboard at any time.
        </span>
      </div>

      <div className="border-border bg-card flex flex-col gap-3 rounded-md border p-4">
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          What&apos;s next
        </span>
        <ul className="flex flex-col gap-2 text-[13.5px]">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-teal-500" />
            <span className="text-foreground/85">
              Pick a primary facility from your dashboard so visits and prescriptions arrive in the
              right inbox.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-teal-500" />
            <span className="text-foreground/85">
              Add a next-of-kin contact (optional) so a clinician can reach someone for you in an
              emergency.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-teal-500" />
            <span className="text-foreground/85">
              Turn on two-factor auth from settings if you want an extra layer beyond email.
            </span>
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/dashboard"
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
        >
          Go to dashboard &rarr;
        </Link>
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground text-[13px] transition-colors"
        >
          Back to MedSync home
        </Link>
      </div>
    </div>
  );
}
