import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Shared signup layout — the actual flow lives in /signup/{patient,
 * clinical,hospital}/page.tsx. This wrapper provides the back-to-
 * intent-selector header and is robots: noindex (signup pages
 * shouldn't appear in search results).
 */
export default function SignupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background relative flex min-h-svh w-full flex-col">
      <header className="border-border w-full border-b">
        <div className="mx-auto flex w-full max-w-300 items-center justify-between px-5 py-4 sm:px-8">
          <Link
            href="/get-started"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-[12.5px] transition-colors"
          >
            &larr; Choose a different door
          </Link>
          <Link
            href="/sign-in"
            className="text-muted-foreground hover:text-foreground text-[12.5px] transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
