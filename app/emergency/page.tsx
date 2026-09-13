import type { Metadata } from "next";
import Link from "next/link";

import { EmergencyNotice } from "@/app/patient/_components/emergency-notice";

export const metadata: Metadata = {
  title: "Emergency",
  robots: { index: false, follow: false },
};

/**
 * The pre-auth emergency signpost (PRD §2.5): static, public, no question,
 * no number — a number is a hospital's verified fact, and nobody is signed
 * in here to name one. The block shows the destination alone, which is its
 * designed no-number state. Reached from the sign-in page's text link.
 */
export default function EmergencyPage() {
  return (
    <main className="bg-background mx-auto flex min-h-svh w-full max-w-xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="font-display text-foreground text-heading-m font-medium tracking-[-0.015em]">
        Emergency
      </h1>
      <EmergencyNotice />
      <p className="text-muted-foreground text-body-s leading-relaxed">
        Once you are signed in, your hospital&rsquo;s own emergency number is shown on every page.
      </p>
      <Link
        href="/sign-in"
        className="text-primary text-body-s w-fit underline-offset-4 hover:underline"
      >
        Back to sign in
      </Link>
    </main>
  );
}
