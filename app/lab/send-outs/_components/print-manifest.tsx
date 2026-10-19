"use client";

import { useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { printManifestAction } from "@/lib/lab/referral-actions";
import { LabButton } from "../../_components/v2/button";

/** MF-4: every print is recorded before the browser prints; a reprint says "Copy". */
export function PrintManifest({ manifestId }: { manifestId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-3">
      <LabButton
        type="button"
        onClick={() =>
          start(async () => {
            const r = await printManifestAction({ manifestId });
            if (!r.ok) return setError(r.error);
            setError(null);
            window.print();
          })
        }
        variant="primary"
        busy={pending}
      >
        Print
      </LabButton>
      {error ? <StatusWord tone="caution">{error}</StatusWord> : null}
    </span>
  );
}
