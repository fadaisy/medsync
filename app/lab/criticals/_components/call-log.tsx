"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CRITICALS_UI } from "@/content/lab-criticals";
import { couldNotReachAction, logCriticalCallAction } from "@/lib/lab/criticals/actions";

const OTHER = "__other__";
const D = CRITICALS_UI.detail;

/**
 * Log a phone call (§5.3, CA-9): who was spoken to, whether they read the result back, Log call.
 * A call with read-back to a clinician who may acknowledge stops the clock; any other call is
 * recorded as Ward informed. Could not reach anyone escalates at once (ES-1). The outcome is said in
 * a polite live region; the page then re-reads.
 */
export function CallLog({
  alertId,
  targets,
  lastLevel,
}: {
  alertId: string;
  targets: { userId: string; name: string; cadre: string }[];
  lastLevel: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [to, setTo] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [readBack, setReadBack] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const other = to === OTHER;
  const ready = other ? name.trim().length >= 2 && role.trim().length >= 2 : to !== "";

  const log = () =>
    start(async () => {
      const r = await logCriticalCallAction({
        alertId,
        to: other ? { name: name.trim(), role: role.trim() } : { userId: to },
        readBack,
        clientKey: crypto.randomUUID(),
      });
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setMessage({ ok: true, text: r.data?.acknowledged ? D.loggedAck : D.loggedWard });
      router.refresh();
    });

  const escalate = () =>
    start(async () => {
      const r = await couldNotReachAction({ alertId, clientKey: crypto.randomUUID() });
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setMessage({ ok: true, text: r.data?.escalatedTo === null ? D.lastLevel : D.escalatedNow });
      router.refresh();
    });

  return (
    <section
      aria-labelledby="log-call"
      className="border-border flex flex-col gap-4 rounded-lg border p-4"
    >
      <h2 id="log-call" className="text-heading-s">
        {D.logCall}
      </h2>
      <label className="text-body-s flex flex-col gap-1">
        <span className="text-muted-foreground">{D.whoSpoke}</span>
        <select
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 rounded-sm border px-2 outline-none sm:min-h-9"
        >
          <option value="">Choose</option>
          {targets.map((t) => (
            <option key={t.userId} value={t.userId}>
              {t.name}, {t.cadre}
            </option>
          ))}
          <option value={OTHER}>{D.notOnMedSync}</option>
        </select>
      </label>
      {other ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-body-s flex flex-col gap-1">
            <span className="text-muted-foreground">{D.name}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="min-h-11 sm:min-h-9"
            />
          </label>
          <label className="text-body-s flex flex-col gap-1">
            <span className="text-muted-foreground">{D.role}</span>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={80}
              className="min-h-11 sm:min-h-9"
            />
          </label>
        </div>
      ) : null}
      <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
        <input
          type="checkbox"
          checked={readBack}
          onChange={(e) => setReadBack(e.target.checked)}
          className="size-4 accent-teal-600"
        />
        {D.readBack}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={log} disabled={pending || !ready}>
          {D.log}
        </Button>
        <Button type="button" variant="secondary" onClick={escalate} disabled={pending}>
          {D.couldNotReach}
        </Button>
        {lastLevel ? (
          <span className="text-body-s text-muted-foreground">{D.lastLevel}</span>
        ) : null}
      </div>
      <p role="status" aria-live="polite" className="text-body-s min-h-5">
        {message ? (
          message.ok ? (
            message.text
          ) : (
            <StatusWord tone="caution">{message.text}</StatusWord>
          )
        ) : null}
      </p>
    </section>
  );
}
