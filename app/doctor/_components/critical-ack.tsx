"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { CRITICALS_COPY, CRITICALS_UI } from "@/content/lab-criticals";
import {
  acknowledgeCriticalAlertAction,
  disputePhoneAcknowledgementAction,
  recordAlertSeenAction,
} from "@/lib/lab/criticals/actions";
import { cn } from "@/lib/utils";

type Response = keyof typeof CRITICALS_COPY.responses;
const D = CRITICALS_UI.doctor;

/**
 * The doctor's acknowledgement (Lab Phase 1 §5.4; CA-6–CA-8, CA-12). One tap, nothing required:
 * a bare Acknowledge is valid (D-LAB1-14). A second doctor's tap returns the first acknowledgement.
 * The outcome is said in a polite live region and the page re-reads.
 */
export function AckButton({
  alertId,
  label,
  className,
}: {
  alertId: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const ack = () =>
    start(async () => {
      const r = await acknowledgeCriticalAlertAction({
        surface: "doctor",
        alertId,
        response: null,
        clientKey: key,
      });
      if (!r.ok) return setSaid({ ok: false, text: r.error });
      setSaid({
        ok: true,
        text:
          r.data?.kind === "already" && !r.data.byMe
            ? "Already acknowledged by a colleague."
            : "Acknowledged.",
      });
      router.refresh();
    });
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" onClick={ack} disabled={pending} className={cn("min-h-11", className)}>
        {pending ? "Acknowledging…" : label}
      </Button>
      <span role="status" aria-live="polite" className="text-body-s">
        {said ? said.ok ? said.text : <StatusWord tone="caution">{said.text}</StatusWord> : null}
      </span>
    </span>
  );
}

/** The detail's acknowledgement: three one-tap responses (optional), a note, Acknowledge. */
export function AckPanel({
  alertId,
  label,
  labPhone,
}: {
  alertId: string;
  label: string;
  labPhone: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [response, setResponse] = useState<Response | null>(null);
  const [note, setNote] = useState("");
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const ack = () =>
    start(async () => {
      const r = await acknowledgeCriticalAlertAction({
        surface: "doctor",
        alertId,
        response,
        ...(note.trim() ? { note: note.trim() } : {}),
        clientKey: key,
      });
      if (!r.ok) return setSaid({ ok: false, text: r.error });
      setSaid({
        ok: true,
        text:
          r.data?.kind === "already" && !r.data.byMe
            ? "Already acknowledged by a colleague."
            : "Acknowledged.",
      });
      router.refresh();
    });
  return (
    <section aria-labelledby="ack-heading" className="flex flex-col gap-3 pb-24 sm:pb-0">
      <h2 id="ack-heading" className="text-heading-s">
        {D.acknowledge}
      </h2>
      <div
        role="group"
        aria-label="Response (optional)"
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
      >
        {(Object.entries(CRITICALS_COPY.responses) as [Response, string][]).map(([code, words]) => (
          <Button
            key={code}
            type="button"
            variant={response === code ? "primary" : "secondary"}
            aria-pressed={response === code}
            onClick={() => setResponse((r) => (r === code ? null : code))}
            className="min-h-12 justify-start sm:min-h-9"
          >
            {words}
          </Button>
        ))}
      </div>
      <label className="text-body-s flex flex-col gap-1">
        <span className="text-muted-foreground">{D.note}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
          className="border-input bg-card text-body-s focus-visible:shadow-focus rounded-sm border px-2.5 py-2 outline-none"
        />
      </label>
      {labPhone ? (
        <p className="text-body-s">
          {D.callLab}: <span className="font-mono tabular-nums">{labPhone}</span>
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="text-body-s min-h-5">
        {said ? said.ok ? said.text : <StatusWord tone="caution">{said.text}</StatusWord> : null}
      </p>
      {/* Phones: a sticky footer with Acknowledge at 48 px (§5.4, §10), clear of the Emergency button. */}
      <div className="bg-background border-border fixed inset-x-0 bottom-0 z-20 border-t p-3 pr-44 sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <Button
          type="button"
          onClick={ack}
          disabled={pending}
          className="min-h-12 w-full sm:min-h-9 sm:w-auto"
        >
          {pending ? "Acknowledging…" : label}
        </Button>
      </div>
    </section>
  );
}

/** CA-9: "The lab recorded your phone acknowledgement at 10:48. Not you? Tell us." */
export function PhoneAckLine({ alertId, time }: { alertId: string; time: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const dispute = () =>
    start(async () => {
      const r = await disputePhoneAcknowledgementAction({ surface: "doctor", alertId });
      if (!r.ok) return setSaid({ ok: false, text: r.error });
      setSaid({ ok: true, text: D.disputed });
      router.refresh();
    });
  return (
    <p className="text-body-s flex flex-wrap items-center gap-2">
      <span>{CRITICALS_COPY.phoneAck(time)}</span>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={dispute}
        disabled={pending}
        className="min-h-11 sm:min-h-7"
      >
        {D.dispute}
      </Button>
      <span role="status" aria-live="polite">
        {said ? said.ok ? said.text : <StatusWord tone="caution">{said.text}</StatusWord> : null}
      </span>
    </p>
  );
}

/** CA-5: the detail rendered for a recipient writes `seen` once. Silent. */
export function SeenOnce({ alertId }: { alertId: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void recordAlertSeenAction({ surface: "doctor", alertId }).catch(() => undefined);
  }, [alertId]);
  return null;
}
