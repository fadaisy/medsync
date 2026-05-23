import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readPendingEmail } from "@/app/signup/patient/actions";
import { VerifyForm } from "./_form";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
};

/**
 * /signup/patient/verify — OTP entry. Expects the pending-patient
 * cookie set by submitSignupAction. If it's missing (or expired),
 * boot the user back to step 1.
 */
export default async function VerifyPage() {
  const email = await readPendingEmail();
  if (!email) redirect("/signup/patient");

  return (
    <div className="mx-auto flex w-full max-w-150 flex-col gap-7 px-5 py-14 sm:px-8 sm:py-20">
      <div className="flex flex-col gap-3">
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className="size-1 rounded-full bg-teal-500" />
          Step 4 &middot; Verify
        </span>
        <h1
          className="font-display text-foreground text-[28px] leading-[1.1] tracking-[-0.025em] text-balance sm:text-[36px]"
          style={{ fontWeight: 400 }}
        >
          Check your email.
        </h1>
        <p className="text-muted-foreground max-w-[58ch] text-[15px] leading-[1.55]">
          We sent a 6-digit code to <span className="text-foreground font-medium">{email}</span>. It
          expires in 60 minutes.
        </p>
      </div>

      <VerifyForm />
    </div>
  );
}
