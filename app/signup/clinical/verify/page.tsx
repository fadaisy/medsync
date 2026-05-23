import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readPendingClinicalEmail } from "@/app/signup/clinical/actions";
import { SignupShell } from "../../_components/signup-shell";
import { ClinicalVerifyForm } from "./_form";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
};

export default async function ClinicalVerifyPage() {
  const email = await readPendingClinicalEmail();
  if (!email) redirect("/signup/clinical");

  return (
    <SignupShell
      pathSegments={["signup", "clinical", "verify"]}
      eyebrow="Step 4 · Verify email"
      title={
        <>
          One <span className="text-teal-700 italic dark:text-teal-300">more step.</span>
        </>
      }
      subtitle={
        <>
          We sent a 6-digit code to{" "}
          <span className="text-foreground font-mono text-[14px]">{email}</span>. After you enter
          it, you land in your hospital admin&apos;s approval queue.
        </>
      }
      maxWidth={150}
    >
      <ClinicalVerifyForm />
    </SignupShell>
  );
}
