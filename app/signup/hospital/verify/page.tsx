import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readPendingHospitalEmail } from "@/app/signup/hospital/actions";
import { SignupShell } from "../../_components/signup-shell";
import { HospitalVerifyForm } from "./_form";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
};

export default async function HospitalVerifyPage() {
  const email = await readPendingHospitalEmail();
  if (!email) redirect("/signup/hospital");

  return (
    <SignupShell
      pathSegments={["signup", "hospital", "verify"]}
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
          it, your application enters MedSync&apos;s superadmin review queue.
        </>
      }
      maxWidth={150}
    >
      <HospitalVerifyForm />
    </SignupShell>
  );
}
