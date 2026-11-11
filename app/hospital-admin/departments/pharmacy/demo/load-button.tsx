"use client";

import { useState, useTransition } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { loadPharmacyDemoAction } from "./actions";

/** One press loads the whole demo; the page lists the load and any section that stopped. */
export function LoadPharmacyDemo() {
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className="w-fit"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await loadPharmacyDemoAction();
            setSaid(
              r.ok
                ? {
                    ok: true,
                    text: r.warnings?.[0] ?? "Loaded. Every pharmacy page now has demo data.",
                  }
                : { ok: false, text: r.error ?? "The demo did not load." },
            );
          })
        }
      >
        {pending ? "Loading the demo pharmacy… (a few minutes)" : "Load the pharmacy demo"}
      </Button>
      <p role="status" aria-live="polite" className="text-body-s min-h-5">
        {said ? (
          said.ok ? (
            said.text
          ) : (
            <StatusWord tone="caution" glyph={TriangleAlertIcon}>
              {said.text}
            </StatusWord>
          )
        ) : null}
      </p>
    </div>
  );
}
