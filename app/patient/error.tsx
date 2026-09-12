"use client";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { PatientPageHeader } from "./_components/page-header";

/**
 * Patient-surface error boundary.
 *
 * Deliberately calm: no stack, no digest, no red. A patient looking at their
 * own health record can do nothing with a trace, and red on this surface is
 * reserved for a clinician-declared emergency — a failed read is not one.
 * The reassurance is the point, because "it broke" reads as "it lost my
 * records" unless we say otherwise.
 *
 * `error` is part of the boundary contract Next passes in; nothing here has a
 * use for it, so it stays in the type and out of the body.
 */
export default function PatientError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PatientPageHeader eyebrow="MedSync" title="This didn’t load" />

      <p className="text-foreground text-body-m max-w-[60ch] leading-relaxed">
        We couldn&rsquo;t load this. Your data is safe.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={reset}>
          Try again
        </Button>
        <Link href="/patient" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Back to home
        </Link>
      </div>
    </div>
  );
}
