"use client";

import { useState, useTransition } from "react";
import { SirenIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { openResusFromIntake } from "../../resus/actions";

/**
 * Straight-to-resus from the triage board. Shown on a row already
 * triaged Red/L1: opens (or resumes) the ABCDE resus desk for that
 * patient, carrying their triage vitals in as the first reading. Success
 * redirects server-side; we only land back here on an error.
 */
export function OpenResusButton({
  intakeId,
  resusBase = "/nurse/resus",
}: {
  intakeId: string;
  resusBase?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          setError(null);
          const r = await openResusFromIntake(intakeId, resusBase);
          if (r?.error) setError(r.error);
        })
      }
      className="tap text-caption mr-3 shrink-0 gap-1 self-center bg-rose-600 font-semibold text-white hover:bg-rose-700"
      title={error ?? "Open the ABCDE resus desk for this patient — vitals carried from triage"}
    >
      <SirenIcon className="size-3" aria-hidden />
      {pending ? "Opening…" : "Open resus"}
    </Button>
  );
}
