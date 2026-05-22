import type { Metadata } from "next";
import { Suspense } from "react";

import { SignInForm } from "./form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  // useSearchParams needs Suspense to bound the dynamic boundary.
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
