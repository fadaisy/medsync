import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readPendingHospitalEmail } from "@/app/signup/hospital/actions";
import { HospitalVerifyForm } from "./_form";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
};

export default async function HospitalVerifyPage() {
  const email = await readPendingHospitalEmail();
  if (!email) redirect("/signup/hospital");

  return (
    <div className="mx-auto flex w-full max-w-150 flex-col gap-7 px-5 py-14 sm:px-8 sm:py-20">
      <div className="flex flex-col gap-3">
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className="size-1 rounded-full bg-teal-500" />
          Step 4 &middot; Verify email
        </span>
        <h1
          className="font-display text-foreground text-[28px] leading-[1.1] tracking-[-0.025em] text-balance sm:text-[36px]"
          style={{ fontWeight: 400 }}
        >
          One more step.
        </h1>
        <p className="text-muted-foreground max-w-[58ch] text-[15px] leading-[1.55]">
          We sent a 6-digit code to <span className="text-foreground font-medium">{email}</span>.
          After you enter it, your application enters MedSync&apos;s superadmin review queue.
        </p>
      </div>

      <HospitalVerifyForm />
    </div>
  );
}
