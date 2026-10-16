"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Refusal, TARGET } from "../../../_components/review-dialogs";
import * as actions from "../../../controlled-actions";

/** LB-4, Law 11: Print logs the print, then opens the browser's print; a failure to log never stops it. */
export function RegisterPrint({ entryId, label }: { entryId: string; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-col gap-1">
      <Button
        type="button"
        className={TARGET}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await actions.printRegisterEntry({
              clientKey: crypto.randomUUID(),
              entryId,
            });
            setError(r.ok ? null : r.error);
            window.print();
          })
        }
      >
        {label}
      </Button>
      <Refusal error={error} />
    </span>
  );
}
