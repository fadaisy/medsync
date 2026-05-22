import type { Metadata } from "next";
import { Suspense } from "react";

import { MfaChallengeForm } from "./form";

export const metadata: Metadata = { title: "Two-factor" };

export default function MfaChallengePage() {
  return (
    <Suspense>
      <MfaChallengeForm />
    </Suspense>
  );
}
