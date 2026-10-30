"use client";

import type { FoundSpecimen, ScanOutcome } from "@/lib/lab/bench-actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { BiohazardIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LAB } from "@/content/lab";
import { LABWS2 } from "@/content/lab-workspace-v2";
import {
  findSpecimenAction,
  receiveByLabelAction,
  undoReceiveAction,
} from "@/lib/lab/bench-actions";
import { UNDO_WINDOW_MS } from "@/lib/lab/one-menu";
import { LabButton } from "@/components/tide/work/button";

const B = LAB.bench;
const TAP = "min-h-11 sm:min-h-0";

type Receipt = Extract<ScanOutcome, { kind: "received" }>;
/** A scan that needs one more step before it can receive: the tick (SR-3) or a reason (SR-2). */
type Pending = { kind: "procedure_first" | "not_collected"; raw: string; words: string };

/**
 * Scan to receive (Lab Phase 2 §5.5, SR-1..SR-5, §10). A keyboard-wedge scanner types the label and
 * Enter; the field clears and keeps focus after every scan. Outcomes are announced politely; not
 * found, voided and rejected assertively. The last receipt keeps an Undo for five minutes.
 */
export function ScanReceive({ initial }: { initial?: string } = {}) {
  const router = useRouter();
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [busy, start] = useTransition();
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [followed, setFollowed] = useState(false);
  const [reason, setReason] = useState("");

  const refocus = () => field.current?.focus();
  useEffect(refocus, []);
  // SR-5: Undo is offered for the window, then the reject or amend paths apply.
  useEffect(() => {
    if (!receipt) return;
    const t = window.setTimeout(() => setReceipt(null), UNDO_WINDOW_MS);
    return () => window.clearTimeout(t);
  }, [receipt]);

  const send = (
    raw: string,
    extra: { procedureFollowed?: boolean; receiveAnywayReason?: string },
  ) =>
    start(async () => {
      const r = await receiveByLabelAction({ raw, clientKey: crypto.randomUUID(), ...extra });
      setPolite("");
      setAssertive("");
      if (!r.ok || !r.data) {
        setAssertive(r.ok ? B.scanHint : r.error);
      } else {
        const o = r.data;
        setPending(null);
        setFollowed(false);
        setReason("");
        if (o.kind === "received") {
          setReceipt(o);
          setPolite(o.words);
          router.refresh();
        } else if (o.kind === "already") setPolite(o.words);
        else if (o.kind === "procedure_first" || o.kind === "not_collected")
          setPending({ kind: o.kind, raw, words: o.words });
        else setAssertive(o.words);
      }
      refocus();
    });

  // Lab Workspace v2: "Receive {label}" from Scan or search arrives here as `?receive=`, and runs once.
  const ran = useRef(false);
  useEffect(() => {
    if (!initial || ran.current) return;
    ran.current = true;
    send(initial, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const undo = (r: Receipt) =>
    start(async () => {
      const res = await undoReceiveAction({
        patientUserId: r.patientUserId,
        specimenId: r.specimenId,
        clientKey: crypto.randomUUID(),
      });
      setReceipt(null);
      if (res.ok) {
        setAssertive("");
        setPolite(B.undone);
        router.refresh();
      } else setAssertive(res.error);
      refocus();
    });

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <form
        className="flex flex-col gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const raw = value.trim();
          setValue("");
          if (raw) send(raw, {});
          else refocus();
        }}
      >
        <label htmlFor={`${id}-scan`} className="text-label text-foreground">
          {B.scanLabel}
        </label>
        <Input
          ref={field}
          id={`${id}-scan`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-describedby={`${id}-hint`}
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          className="h-11 max-w-sm font-mono"
        />
        <span id={`${id}-hint`} className="text-caption text-muted-foreground">
          {B.scanHint}
        </span>
      </form>

      <div className="text-body-s flex flex-wrap items-center gap-2">
        <p role="status" aria-live="polite">
          {polite}
        </p>
        {receipt ? (
          <LabButton
            type="button"
            variant="secondary"
            className={TAP}
            onClick={() => undo(receipt)}
            busy={busy}
          >
            {B.undo}
          </LabButton>
        ) : null}
      </div>
      <p role="alert" className="text-body-s">
        {assertive ? <StatusWord tone="caution">{assertive}</StatusWord> : null}
      </p>

      {pending?.kind === "procedure_first" ? (
        <div
          role="alert"
          className="bg-status-caution-bg border-status-caution-fg dark:text-status-caution-fg text-body-s flex max-w-xl items-start gap-2.5 rounded-lg border-2 px-3.5 py-3 text-amber-800"
        >
          <BiohazardIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-2">
            <p className="font-medium">{pending.words}</p>
            <label className="text-foreground inline-flex min-h-11 items-center gap-2 sm:min-h-0">
              <input
                type="checkbox"
                checked={followed}
                onChange={(e) => setFollowed(e.target.checked)}
                className="size-4 accent-teal-700"
              />
              {B.procedureFollowed}
            </label>
            <span className="flex flex-wrap gap-2">
              <LabButton
                type="button"
                className={TAP}
                onClick={() => send(pending.raw, { procedureFollowed: true })}
                variant="primary"
                busy={busy}
                disabledReason={!followed ? LABWS2.reasons.tickProcedure : null}
              >
                {B.receive}
              </LabButton>
              <Button
                type="button"
                variant="ghost"
                size="md"
                className={TAP}
                onClick={() => {
                  setPending(null);
                  refocus();
                }}
              >
                {B.cancel}
              </Button>
            </span>
          </div>
        </div>
      ) : pending?.kind === "not_collected" ? (
        <form
          className="border-border bg-card text-body-s flex max-w-xl flex-col gap-2 rounded-lg border px-3.5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length >= 3)
              send(pending.raw, { receiveAnywayReason: reason.trim() });
          }}
        >
          <StatusWord tone="caution" className="w-fit">
            {pending.words}
          </StatusWord>
          <label htmlFor={`${id}-reason`} className="text-label text-foreground">
            {B.reason}
          </label>
          <Input
            id={`${id}-reason`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            maxLength={200}
            className="h-11 sm:h-[34px]"
          />
          <span className="flex flex-wrap gap-2">
            <LabButton
              type="submit"
              className={TAP}
              variant="primary"
              busy={busy}
              disabledReason={reason.trim().length < 3 ? LABWS2.reasons.reasonAtLeast3 : null}
            >
              {B.receiveAnyway}
            </LabButton>
            <Button
              type="button"
              variant="ghost"
              size="md"
              className={TAP}
              onClick={() => {
                setPending(null);
                refocus();
              }}
            >
              {B.cancel}
            </Button>
          </span>
        </form>
      ) : null}
    </div>
  );
}

/** Find a specimen (§5.5): by label number or order number; each match opens its result screen. */
export function FindSpecimen() {
  const id = useId();
  const [q, setQ] = useState("");
  const [busy, start] = useTransition();
  const [found, setFound] = useState<FoundSpecimen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const F = B.find;

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-1">
      <h2 id={`${id}-h`} className="text-label text-foreground">
        {F.title}
      </h2>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await findSpecimenAction({ q });
            setError(r.ok ? null : r.error);
            setFound(r.ok ? (r.data ?? []) : null);
          });
        }}
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          {F.label}
        </label>
        <Input
          id={`${id}-q`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={F.label}
          autoComplete="off"
          className="h-11 w-60 sm:h-[34px]"
        />
        <LabButton type="submit" variant="secondary" className={TAP} busy={busy}>
          {F.submit}
        </LabButton>
      </form>
      <div role="status" className="text-body-s">
        {error ? (
          <StatusWord tone="caution">{error}</StatusWord>
        ) : found && found.length === 0 ? (
          <span className="text-muted-foreground">{F.none}</span>
        ) : found ? (
          <ul className="flex flex-col">
            {found.map((f) => (
              <li key={`${f.labelNo}-${f.orderId}`} className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/lab/results/${f.orderId}`}
                  prefetch={false}
                  className="inline-flex min-h-11 items-center gap-2 font-medium text-teal-700 underline-offset-4 hover:underline sm:min-h-0"
                >
                  <span className="font-mono">{f.labelNo}</span>
                  {f.test}
                </Link>
                {f.voided ? <StatusWord tone="neutral">{F.voided}</StatusWord> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
