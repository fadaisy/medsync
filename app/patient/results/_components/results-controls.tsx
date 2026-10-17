"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { askForCopyAction, setResultsConsentAction } from "../actions";

/** PR-12: the consent switch. A real switch (role="switch"), the state said in words, not colour alone. */
export function ResultsConsentSwitch({
  on,
  subject,
  label,
  type = "results_in_app",
}: {
  on: boolean;
  subject: string;
  label: string;
  type?: "results_in_app" | "results_sms";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setResultsConsentAction({ on: !on, subject, type });
            setError(r.ok ? null : r.error);
            router.refresh();
          })
        }
        className="border-border bg-card text-body-s flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 py-2 text-left"
      >
        <span>{label}</span>
        <span className="font-medium">{on ? "On" : "Off"}</span>
      </button>
      <p role="status" aria-live="polite" className="text-body-s min-h-5">
        {error}
      </p>
    </div>
  );
}

/** PR-15: one request per tap (a fresh key each time the page loads). */
export function AskForCopy() {
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<string | null>(null);
  const [key] = useState(() => `copy:${crypto.randomUUID()}`);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        className="min-h-11 w-fit"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await askForCopyAction({ clientKey: key });
            setSaid(r.ok ? "Asked. The records office replies within 30 days." : r.error);
          })
        }
      >
        Ask for a copy of all my results
      </Button>
      <p role="status" aria-live="polite" className="text-body-s min-h-5">
        {said}
      </p>
    </div>
  );
}
