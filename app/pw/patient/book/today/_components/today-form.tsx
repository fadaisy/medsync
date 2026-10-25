"use client";

import type { Clinic } from "@/lib/patient-web/book-data";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clockOf } from "@patient-core/book-days";
import { feeText } from "@patient-core/fees";
import { ArrowRightIcon, SmartphoneIcon, WalletIcon } from "lucide-react";

import { Button, ButtonLink, Card, ICON, Note, TextLink } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { BOOK_COPY as C, TODAY_COPY as T } from "@/content/patient/book";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { giveUpPlaceAction, payAction, saveMyPlaceAction } from "@/lib/patient-web/book-actions";
import { cn } from "@/lib/utils";
import { SentTicket } from "../../_components/ticket-bits";
import { HonestNote, StepTitle } from "../../_components/why-coming";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pw-focus";

type Pay = "momo" | "desk";
type Issued = {
  fee: number | null;
  feeLabel: string | null;
  paid: boolean;
  demo: boolean;
  at: string;
};

export function TodayForm({
  unseen,
  today,
  hospitalName,
  patient,
  patientCode,
  clinics,
  fromHome,
  submissionId,
  live,
  paymentsOn,
}: {
  unseen: number;
  today: string;
  hospitalName: string;
  patient: string;
  patientCode: string | null;
  clinics: Clinic[];
  fromHome: string | null;
  submissionId: string | null;
  live: { id: string; status: string; clinic: string | null } | null;
  paymentsOn: boolean;
}) {
  const router = useRouter();
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [pay, setPay] = useState<Pay>("momo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(false);
  // The place saved here: the fee and the simulated payment (W3: nothing is kept on the device).
  const [issued, setIssued] = useState<Issued | null>(null);

  if (live && !left)
    return (
      <Held
        live={live}
        unseen={unseen}
        today={today}
        hospitalName={hospitalName}
        patient={patient}
        patientCode={patientCode}
        issued={issued}
        onPaid={(demo) => setIssued((i) => (i ? { ...i, paid: true, demo } : i))}
        onLeft={() => {
          setLeft(true);
          setIssued(null);
          router.refresh();
        }}
      />
    );

  const clinic =
    clinics.find((c) => c.id === clinicId) ?? clinics.find((c) => c.id === fromHome) ?? clinics[0];
  const fee = clinic?.fee ?? null;
  const money = clinic?.feeLabel ?? feeText(fee);
  const save = fee && pay === "momo" ? T.pay(feeText(fee)) : T.save;

  const onSave = async () => {
    if (!clinic || busy) return;
    setBusy(true);
    setError(null);
    const res = await saveMyPlaceAction({ departmentId: clinic.id, submissionId }).catch(() => ({
      ok: false as const,
      error: PATIENT_WEB_COPY.offline,
    }));
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    let paid = false;
    let demo = false;
    if (fee && pay === "momo") {
      const p = await payAction(fee).catch(() => null);
      if (p?.ok) [paid, demo] = [true, p.demo];
    }
    setIssued({ fee, feeLabel: clinic.feeLabel, paid, demo, at: new Date().toISOString() });
    setLeft(false);
    setBusy(false);
    router.refresh();
  };

  return (
    <>
      <PageHeader
        back={{ href: "/patient/book", label: T.back }}
        overline={T.overline(today)}
        area="visits"
        title={T.title}
        unseen={unseen}
      />
      <div className="flex max-w-2xl flex-col gap-6">
        {left ? <Note tone="info">{T.removed}</Note> : null}

        <section className="flex flex-col gap-2">
          <StepTitle>{T.clinicsOpen}</StepTitle>
          {clinics.length === 0 ? (
            <Note>{T.noClinic}</Note>
          ) : (
            <div role="radiogroup" aria-label={T.clinicsOpen} className="flex flex-wrap gap-2">
              {clinics.map((c) => {
                const on = c.id === clinic?.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={T.clinicOpenLabel(c.name)}
                    onClick={() => setClinicId(c.id)}
                    className={cn(
                      "rounded-pw-row flex min-h-[52px] min-w-32 flex-col gap-0.5 px-3 py-2.5 text-left",
                      FOCUS,
                      on ? "bg-pw-act text-pw-on-act" : "bg-pw-surface shadow-pw-card",
                    )}
                  >
                    <span className="text-[15px] font-semibold">{c.name}</span>
                    <span
                      className={cn(
                        "text-[13px] font-medium",
                        on ? "text-pw-on-act" : "text-pw-ink-2",
                      )}
                    >
                      {T.openNow}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <HonestNote after={T.honestAfter} />

        {fee ? (
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <StepTitle>{T.payment}</StepTitle>
              <p className="text-[22px] font-bold tabular-nums">{money}</p>
            </div>
            <div role="radiogroup" aria-label={T.payment} className="grid grid-cols-2 gap-2">
              {(
                [
                  ["momo", T.momoTitle, T.momoLine],
                  ["desk", T.deskTitle, T.deskLine],
                ] as const
              ).map(([k, title, line]) => (
                <PayTile
                  key={k}
                  on={pay === k}
                  onPick={() => setPay(k)}
                  title={title}
                  line={line}
                />
              ))}
            </div>
            {pay === "momo" ? (
              <div className="bg-pw-surface-2 text-pw-ink-2 rounded-pw-row flex items-start gap-3 p-4 text-[15px] font-medium">
                <SmartphoneIcon className="mt-0.5 size-5 shrink-0" {...ICON} />
                {paymentsOn ? T.momoPrompt : T.demoPayment}
              </div>
            ) : null}
            <p className="text-pw-ink-3 text-[13px] font-medium">{T.feeSet}</p>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <StepTitle>{T.bring}</StepTitle>
          <ul className="flex flex-wrap gap-1.5">
            {T.bringItems.map((b) => (
              <li
                key={b}
                className="bg-pw-surface ring-pw-line flex min-h-[34px] items-center rounded-full px-3 text-[15px] ring-1 ring-inset"
              >
                {b}
              </li>
            ))}
          </ul>
        </section>

        {error ? (
          <p role="alert" className="text-pw-ink text-[15px] font-semibold">
            {error}
          </p>
        ) : null}
        <Button
          busy={busy}
          disabledReason={clinic ? undefined : T.noClinic}
          onClick={() => void onSave()}
        >
          {save}
          <ArrowRightIcon className="size-5" {...ICON} />
        </Button>
        <TextLink href="/patient/book/day" className="self-center">
          {T.cannotCome}
        </TextLink>
      </div>
    </>
  );
}

/** The saved place: where it stands, the ticket, and giving it up. No count, no position (L8). */
function Held({
  live,
  unseen,
  today,
  hospitalName,
  patient,
  patientCode,
  issued,
  onPaid,
  onLeft,
}: {
  live: { id: string; status: string; clinic: string | null };
  unseen: number;
  today: string;
  hospitalName: string;
  patient: string;
  patientCode: string | null;
  issued: Issued | null;
  onPaid: (demo: boolean) => void;
  onLeft: () => void;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const stage = T.stage[live.status] ?? T.inTheLine;

  return (
    <>
      <PageHeader
        back={{ href: "/patient/book", label: T.back }}
        overline={T.savedOverline}
        area="visits"
        title={stage}
        unseen={unseen}
      />
      <div className="flex max-w-2xl flex-col gap-5">
        <SentTicket
          kind="queue"
          title={hospitalName}
          status={stage}
          codeLabel={T.code}
          code={patientCode}
          details={[
            { label: T.clinic, value: live.clinic ?? T.todaysClinic },
            { label: T.room, value: T.askAtDesk },
            { label: T.date, value: issued ? T.joined(today, clockOf(issued.at)) : today },
            { label: T.patient, value: patient },
            { label: T.time, value: T.notPromised },
          ]}
          pay={
            issued && issued.fee
              ? {
                  fee: issued.fee,
                  feeLabel: issued.feeLabel,
                  paid: issued.paid,
                  demo: issued.demo,
                  paying,
                  onPayNow: () => {
                    setPaying(true);
                    void payAction(issued.fee).then((r) => {
                      setPaying(false);
                      if (r.ok) onPaid(r.demo);
                      else setErr(r.error);
                    });
                  },
                }
              : undefined
          }
        />
        <Card className="flex flex-col gap-2">
          <p className="text-base font-semibold">{stage}</p>
          {live.status === "declared" ? (
            <p className="text-pw-ink-2 text-[15px] leading-[21px]">{T.showCode}</p>
          ) : null}
          <p className="text-pw-ink-2 text-[15px] leading-[21px]">
            <strong className="text-pw-ink font-bold">{C.honest}</strong>
          </p>
          <Button tone="outline" size="s" className="self-start" onClick={() => router.refresh()}>
            {T.checkAgain}
          </Button>
        </Card>
        {err ? (
          <p role="alert" className="text-pw-ink text-[15px] font-semibold">
            {err}
          </p>
        ) : null}
        <Button
          tone="outline"
          busy={leaving}
          onClick={() => {
            setLeaving(true);
            setErr(null);
            void giveUpPlaceAction(live.id)
              .catch(() => ({ ok: false as const, error: PATIENT_WEB_COPY.offline }))
              .then((r) => {
                setLeaving(false);
                if (r.ok) onLeft();
                else setErr(r.error);
              });
          }}
        >
          {T.giveUp}
        </Button>
        <ButtonLink href="/patient">{T.done}</ButtonLink>
      </div>
    </>
  );
}

function PayTile({
  on,
  onPick,
  title,
  line,
}: {
  on: boolean;
  onPick: () => void;
  title: string;
  line: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={`${title}. ${line}`}
      onClick={onPick}
      className={cn(
        "rounded-pw-row flex flex-col items-start gap-1.5 p-3 text-left ring-inset",
        FOCUS,
        on ? "bg-pw-accent-tint ring-pw-accent ring-2" : "bg-pw-surface ring-pw-line ring-1",
      )}
    >
      <span className="bg-pw-surface-2 text-pw-ink grid size-8 place-items-center rounded-full">
        <WalletIcon className="size-4" {...ICON} />
      </span>
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="text-pw-ink-2 text-[13px] font-medium">{line}</span>
    </button>
  );
}
