import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthCardSkeleton } from "../../_components/auth-skeleton";
import { MfaChallengeForm } from "./form";

export const metadata: Metadata = { title: "Two-factor" };

export default function MfaChallengePage() {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <MfaChallengeForm />
    </Suspense>
  );
}
