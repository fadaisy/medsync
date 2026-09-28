"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { decideDiagnosisCosign } from "@/lib/emr/actions/diagnoses";

/**
 * A junior's Final from the review queue (D-SI-09, D-SI-23). Approve makes the diagnosis Final and
 * closes the request in one transaction; Return closes it with the note and the diagnosis stays
 * Working (lib/emr/write/diagnoses.ts decideDiagnosisCosign).
 */
export function DiagnosisCosignForm({
  requestId,
  patientUserId,
  encounterId,
}: {
  requestId: string;
  patientUserId: string;
  encounterId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (decision: "approve" | "return") =>
    start(async () => {
      const r = await decideDiagnosisCosign({
        surface: "doctor",
        patientUserId,
        requestId,
        decision,
        clientKey: crypto.randomUUID(),
        ...(note.trim() ? { reviewNote: note.trim() } : {}),
      });
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setMessage({
        ok: true,
        text: decision === "approve" ? "Diagnosis confirmed as final." : "Returned: stays working.",
      });
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-label="Review note (required to return)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="Review note (optional to approve, required to return)"
        className="border-input bg-background text-body-s focus-visible:shadow-focus resize-none rounded-md border px-3 py-2 outline-none"
      />
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span role="status" aria-live="polite" className="text-body-s mr-auto">
          {message?.text}
        </span>
        {encounterId ? (
          <Link
            href={`/doctor/encounters/${encounterId}`}
            className="text-body-s tap inline-flex min-h-11 items-center font-medium text-teal-700 underline-offset-4 hover:underline sm:min-h-0"
          >
            Open the visit
          </Link>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => run("return")}
          disabled={pending}
        >
          Return
        </Button>
        <Button type="button" size="sm" onClick={() => run("approve")} disabled={pending}>
          {pending ? "Saving…" : "Approve"}
        </Button>
      </div>
    </div>
  );
}
