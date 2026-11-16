"use client";

import type { DayOption, SessionOption } from "@patient-core/book-days";
import type { Network, PromptView } from "@patient-core/payments";
import { useMemo, useState, useTransition } from "react";
import { feeText } from "@patient-core/fees";
import { defaultPayChoice, maskMsisdn } from "@patient-core/payments";
import { PhoneIcon } from "lucide-react";

import { buttonClass, ICON } from "@/components/tide/kit";
import { PayChoice, PromptStatus } from "@/components/tide/v2-pay";
import { PAYMENTS_COPY } from "@/content/patient-app/payments";
import { cn } from "@/lib/utils";

const P = PAYMENTS_COPY;

export interface BookWho {
  /** null = the patient; else a household member's provisional id. */
  id: string | null;
  label: string;
}

export type BookSubmit = (input: {
  member: string | null;
  reason: string;
  session: SessionOption;
}) => Promise<
  { ok: true; appointmentId: string; code: string | null } | { ok: false; error: string }
>;

export type BookPay = (input: {
  appointmentId: string;
  network: Network;
  msisdn: string;
}) => Promise<{ ok: true; view: PromptView } | { ok: false; error: string }>;

/**
 * Book a visit on one page (patient app v2 W1, board 17): three columns. 1. Who and why, and the clinics that
 * take this visit. 2. The chosen clinic's month: each day with places left (full days shown and closed), and the
 * times for a doctor's-times clinic. 3. A summary that stays in view, with the pay choice and one main action:
 * "Confirm and pay UGX …" or "Confirm booking". Steps 1 to 3 show as pills; under 1100 px the columns stack.
 * Booking never needs payment (PA2); paying runs after the booking exists. The booking rules are the booking
 * slice's own (S9): `submit` is its action.
 */
export function BookOnePage({
  hospitalName,
  emergencyLine,
  who,
  reasons,
  days,
  savedMsisdn,
  submit,
  pay,
  visitsHref,
}: {
  hospitalName: string;
  emergencyLine: string;
  who: BookWho[];
  reasons: { code: string; label: string }[];
  days: DayOption[];
  savedMsisdn: string | null;
  submit: BookSubmit;
  pay: BookPay;
  visitsHref: string;
}) {
  const clinics = useMemo(
    () => [...new Set(days.flatMap((d) => d.sessions.map((s) => s.clinicName)))].sort(),
    [days],
  );
  const [member, setMember] = useState<string | null>(who[0]?.id ?? null);
  const [reason, setReason] = useState(reasons[0]?.code ?? "");
  const [clinic, setClinic] = useState<string | null>(clinics[0] ?? null);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [session, setSession] = useState<SessionOption | null>(null);
  const [choice, setChoice] = useState<"momo" | "hospital">(defaultPayChoice(savedMsisdn));
  const [network, setNetwork] = useState<Network>("mtn");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string | null; prompt: PromptView | null } | null>(null);
  const [busy, start] = useTransition();

  const clinicDays = days
    .map((d) => ({ key: d.key, sessions: d.sessions.filter((s) => s.clinicName === clinic) }))
    .filter((d) => d.sessions.length);
  const open = clinicDays.find((d) => d.key === dayKey);
  const clinicFee = (c: string) => days.flatMap((d) => d.sessions).find((s) => s.clinicName === c);
  const fee = session?.fee ?? null;
  const momo = choice === "momo" && !!savedMsisdn && !!fee;
  const step = session ? 3 : clinic ? 2 : 1;

  const confirm = () =>
    start(async () => {
      if (!session) return;
      setError(null);
      const res = await submit({ member, reason, session });
      if (!res.ok) return setError(res.error);
      let prompt: PromptView | null = null;
      if (momo && savedMsisdn) {
        const paid = await pay({ appointmentId: res.appointmentId, network, msisdn: savedMsisdn });
        prompt = paid.ok ? paid.view : "nothing_taken";
      }
      setDone({ code: res.code, prompt });
    });

  if (done) {
    return (
      <section
        className="rounded-pw-card bg-pw-surface shadow-pw-card mx-auto flex max-w-xl flex-col items-center gap-4 p-8 text-center"
        role="status"
      >
        <h2 className="font-pw text-[24px] font-semibold">You are booked</h2>
        {done.prompt ? <PromptStatus view={done.prompt} /> : null}
        <p className="font-pw-mono text-[32px] font-semibold tracking-[0.18em]">
          {done.code ?? "—"}
        </p>
        <p className="text-pw-ink-3 text-[14px]">
          We also sent the code by text. Show it at the desk.
        </p>
        <a href={visitsHref} className={buttonClass("primary", "l")}>
          See it in Visits
        </a>
      </section>
    );
  }

  const col = "rounded-pw-card bg-pw-surface shadow-pw-card flex min-w-0 flex-col gap-4 p-5";
  return (
    <div className="flex flex-col gap-5">
      <p className="rounded-pw-row bg-pw-surface-2 flex items-center gap-2 px-4 py-3 text-[14px]">
        <PhoneIcon className="size-4 shrink-0" {...ICON} />
        {emergencyLine}
      </p>
      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {["Who and why", "Clinic and day", "Confirm"].map((s, i) => (
          <li
            key={s}
            aria-current={step === i + 1 ? "step" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 text-[13px] font-semibold",
              step > i ? "bg-pw-act text-pw-on-act" : "bg-pw-surface-3 text-pw-ink-3",
            )}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <div className="grid gap-4 min-[1100px]:grid-cols-[1fr_1.25fr_0.95fr] min-[1100px]:items-start">
        <section className={col} aria-labelledby="book-who">
          <h2 id="book-who" className="text-[17px] font-semibold">
            Who and why
          </h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-pw-ink-3 mb-1 text-[13px] font-semibold">
              Who is the visit for?
            </legend>
            {who.map((w) => (
              <label
                key={w.id ?? "me"}
                className={cn(
                  "rounded-pw-row flex min-h-12 cursor-pointer items-center gap-3 px-3 ring-[1.5px] ring-inset",
                  member === w.id ? "bg-pw-accent-tint ring-pw-accent" : "ring-pw-line",
                )}
              >
                <input
                  type="radio"
                  name="book-who"
                  className="accent-pw-focus size-5"
                  checked={member === w.id}
                  onChange={() => setMember(w.id)}
                />
                <span className="text-[15px]">{w.label}</span>
              </label>
            ))}
            <p className="text-pw-ink-3 text-[12px]">
              Children&apos;s clinics are booked at the hospital desk for now.
            </p>
          </fieldset>
          <div className="flex flex-col gap-1">
            <label htmlFor="book-why" className="text-pw-ink-3 text-[13px] font-semibold">
              Why are you coming?
            </label>
            <select
              id="book-why"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-pw-field bg-pw-surface-2 min-h-12 px-3 text-[15px]"
            >
              {reasons.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-pw-ink-3 mb-1 text-[13px] font-semibold">
              Clinics at {hospitalName}
            </legend>
            {clinics.map((c) => {
              const f = clinicFee(c);
              return (
                <label
                  key={c}
                  className={cn(
                    "rounded-pw-row flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2 ring-[1.5px] ring-inset",
                    clinic === c ? "bg-pw-accent-tint ring-pw-accent" : "ring-pw-line",
                  )}
                >
                  <input
                    type="radio"
                    name="book-clinic"
                    className="accent-pw-focus size-5"
                    checked={clinic === c}
                    onChange={() => {
                      setClinic(c);
                      setDayKey(null);
                      setSession(null);
                    }}
                  />
                  <span className="flex flex-1 flex-col">
                    <span className="text-[15px] font-semibold">{c}</span>
                    <span
                      className={cn(
                        "text-[12px]",
                        clinic === c ? "text-pw-ink-2" : "text-pw-ink-3",
                      )}
                    >
                      {f?.feeLabel ?? feeText(f?.fee ?? null)}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        </section>

        <section className={col} aria-labelledby="book-day">
          <h2 id="book-day" className="text-[17px] font-semibold">
            {clinic ?? "Pick a clinic"}
          </h2>
          <div className="grid grid-cols-4 gap-2 min-[500px]:grid-cols-5">
            {clinicDays.map((d) => {
              const places = d.sessions.reduce((n, s) => n + s.placesLeft, 0);
              const full = places <= 0;
              const date = new Date(`${d.key}T12:00:00Z`);
              return (
                <button
                  key={d.key}
                  type="button"
                  disabled={full}
                  aria-pressed={dayKey === d.key}
                  aria-label={`${date.toUTCString().slice(0, 11)}: ${full ? "full" : `${places} places left`}`}
                  onClick={() => {
                    setDayKey(d.key);
                    setSession(
                      d.sessions.length === 1 && !d.sessions[0]!.slot ? d.sessions[0]! : null,
                    );
                  }}
                  className={cn(
                    "focus-visible:outline-pw-focus flex min-h-16 flex-col items-center justify-center rounded-2xl text-[13px] focus-visible:outline-2",
                    dayKey === d.key
                      ? "bg-pw-act text-pw-on-act"
                      : full
                        ? "bg-pw-surface-2 text-pw-ink-4 line-through"
                        : "bg-pw-surface-2",
                  )}
                >
                  <span className="text-[11px] font-semibold">
                    {date.toUTCString().slice(0, 3).toUpperCase()}
                  </span>
                  <span className="font-pw text-[20px] font-semibold">{date.getUTCDate()}</span>
                  <span className="text-[11px]">{full ? "Full" : `${places} left`}</span>
                </button>
              );
            })}
          </div>
          {open && (open.sessions.length > 1 || open.sessions.some((s) => s.slot)) ? (
            <fieldset className="flex flex-wrap gap-2">
              <legend className="text-pw-ink-3 mb-2 text-[13px] font-semibold">
                Choose a time
              </legend>
              {open.sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={session?.id === s.id}
                  disabled={s.placesLeft <= 0}
                  onClick={() => setSession(s)}
                  className={cn(buttonClass(session?.id === s.id ? "primary" : "outline", "m"))}
                >
                  {s.doors ?? s.part}
                </button>
              ))}
            </fieldset>
          ) : null}
        </section>

        <aside
          className={cn(col, "min-[1100px]:sticky min-[1100px]:top-24")}
          aria-labelledby="book-summary"
        >
          <h2 id="book-summary" className="text-[17px] font-semibold">
            Summary
          </h2>
          <dl className="flex flex-col gap-1 text-[14px]">
            <div className="flex justify-between gap-3">
              <dt className="text-pw-ink-3">For</dt>
              <dd>{who.find((w) => w.id === member)?.label}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-pw-ink-3">Clinic</dt>
              <dd>{clinic ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-pw-ink-3">Day</dt>
              <dd>{dayKey ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-pw-ink-3">When</dt>
              <dd>{session ? (session.doors ?? session.part) : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 font-semibold">
              <dt>Fee</dt>
              <dd className="tabular-nums">{feeText(fee)}</dd>
            </div>
          </dl>
          {fee ? (
            <PayChoice
              value={savedMsisdn ? choice : "hospital"}
              onChange={setChoice}
              network={network}
              maskedNumber={savedMsisdn ? maskMsisdn(savedMsisdn) : "No number on this account"}
              onChangeNumber={() => setNetwork((n) => (n === "mtn" ? "airtel" : "mtn"))}
            />
          ) : null}
          {error ? (
            <p className="text-pw-ink text-[14px] font-semibold" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!session || busy}
            onClick={confirm}
            className={buttonClass("primary", "l", !session)}
          >
            {momo && fee
              ? P.confirm.pay.replace("{amount}", feeText(fee).replace("UGX ", ""))
              : P.confirm.book}
          </button>
          {!session ? (
            <p className="text-pw-ink-3 text-[12px]">Pick a clinic, a day and a time to confirm.</p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
