"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { FreshFactor, needsFreshFactor } from "@/components/medsync/fresh-factor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signResponseAsCsoAction } from "@/lib/lab/criticals/setup-actions";
import { signLimitsAsCsoAction, signRangeAsCsoAction } from "@/lib/lab/measures-actions";

/** The CSO's countersignature (D-LAB1-11, -12): a fresh second factor; an exception in words if alone. */
export function CsoSign({
  hospitalId,
  versionId,
  sameAsLead,
  kind = "response",
}: {
  hospitalId: string;
  versionId: string;
  sameAsLead: boolean;
  kind?: "response" | "range" | "limits";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const sign = () =>
    start(async () => {
      const input = { hospitalId, versionId, exceptionNote: note.trim() || null };
      const r =
        kind === "range"
          ? await signRangeAsCsoAction(input)
          : kind === "limits"
            ? await signLimitsAsCsoAction(input)
            : await signResponseAsCsoAction(input);
      if (needsFreshFactor(r)) return setFresh(true);
      if (!r.ok) return setSaid({ ok: false, text: r.error });
      setSaid({
        ok: true,
        text:
          kind === "range"
            ? "Signed. This range is now in force."
            : kind === "limits"
              ? "Signed. MedSync now flags against these limits."
              : "Signed. These response times are now in force.",
      });
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-2">
      {sameAsLead ? (
        <label className="text-body-s flex flex-col gap-1">
          <span className="text-muted-foreground">
            You signed as the laboratory lead. If no one else can sign as CSO, say why
          </span>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className="min-h-11 sm:min-h-9"
          />
        </label>
      ) : null}
      {fresh ? (
        <FreshFactor
          onCancel={() => setFresh(false)}
          onConfirmed={() => {
            setFresh(false);
            sign();
          }}
        />
      ) : (
        <div>
          <Button type="button" onClick={sign} disabled={pending}>
            Sign as CSO
          </Button>
        </div>
      )}
      <p role="status" aria-live="polite" className="text-body-s min-h-5">
        {said ? said.ok ? said.text : <StatusWord tone="caution">{said.text}</StatusWord> : null}
      </p>
    </div>
  );
}
