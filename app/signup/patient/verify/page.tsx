import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readPendingEmail } from "@/app/signup/patient/actions";
import { SignupShell } from "../../_components/signup-shell";
import { VerifyForm } from "./_form";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
};

export default async function VerifyPage() {
  const email = await readPendingEmail();
  if (!email) redirect("/signup/patient");

  return (
    <SignupShell
      pathSegments={["signup", "patient", "verify"]}
      eyebrow="Step 4 · Verify email"
      title={
        <>
          Check <span className="text-teal-700 italic dark:text-teal-300">your inbox.</span>
        </>
      }
      subtitle={
        <>
          We sent a 6-digit code to{" "}
          <span className="text-foreground font-mono text-[14px]">{email}</span>. It expires in 60
          minutes. Enter it below — the code submits automatically when the last digit lands.
        </>
      }
      maxWidth={150}
    >
      <VerifyForm />
    </SignupShell>
  );
}
