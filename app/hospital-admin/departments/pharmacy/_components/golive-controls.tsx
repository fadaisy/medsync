"use client";

import { useId, useState, useTransition } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import {
  FormDialog,
  FormField,
  formText,
  SELECT_CLASS,
  TEXTAREA_CLASS,
} from "@/components/medsync/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GOLIVE as G } from "@/content/pharmacy-golive";
import * as actions from "../actions";

/**
 * The going-live and pharmacy-settings controls (5.13, wireframe §13). Every pop-up is a centred
 * dialog (ADR 0161); a refusal comes back in words, amber with its icon. The server holds every
 * two-person rule: these controls only choose which button to show.
 */

type Result = { ok: boolean; error?: string };
const answer = (r: Result) =>
  r.ok ? ({ ok: true } as const) : ({ ok: false, error: r.error ?? G.failed } as const);
const today = () => new Date().toLocaleDateString("en-CA");

/** A button that runs one action and says what happened. */
function useRun() {
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<Result>, okText: string) =>
    start(async () => {
      const r = await fn();
      setSaid(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? G.failed });
    });
  const said_ = (
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
  );
  return { pending, run, said: said_ };
}

/* ─── The switch ────────────────────────────────────────────────────── */

export function SwitchControls({
  pointId,
  live,
  ready,
  request,
}: {
  pointId: string;
  live: boolean;
  ready: boolean;
  request: { id: string; action: "switch_on" | "switch_off"; at: string; mine: boolean } | null;
}) {
  const { pending, run, said } = useRun();
  const R = G.request;
  if (request) {
    const on = request.action === "switch_on";
    return (
      <div className="flex flex-col gap-2">
        <StatusWord tone="caution">{R.waiting(on ? "on" : "off", request.at)}</StatusWord>
        {request.mine ? <p className="text-body-s">{R.mine}</p> : null}
        <div className="flex flex-wrap gap-2">
          {request.mine ? null : (
            <Button
              type="button"
              className="min-h-11"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    on
                      ? actions.approveGoLive({ requestId: request.id })
                      : actions.approveSwitchOff({ requestId: request.id }),
                  on ? R.switchedOn : R.switchedOff,
                )
              }
            >
              {on ? R.approveOn : R.approveOff}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={pending}
            onClick={() =>
              run(() => actions.withdrawGoLiveRequest({ requestId: request.id }), R.withdrawn)
            }
          >
            {R.withdraw}
          </Button>
        </div>
        {said}
      </div>
    );
  }
  if (live) return <SwitchOffDialog pointId={pointId} />;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className="min-h-11"
          disabled={!ready || pending}
          onClick={() => run(() => actions.requestGoLive({ pointId }), R.requested)}
        >
          {R.on}
        </Button>
        {ready ? null : <span className="text-body-s text-muted-foreground">{R.onClosed}</span>}
      </div>
      {said}
    </div>
  );
}

function SwitchOffDialog({ pointId }: { pointId: string }) {
  const id = useId();
  const R = G.request;
  return (
    <div>
      <FormDialog
        label={R.off}
        title={R.off}
        submit={R.off}
        cancel={G.cancel}
        onSave={async (f) =>
          answer(await actions.requestSwitchOff({ pointId, reason: formText(f, "reason") }))
        }
      >
        <FormField label={R.reason} id={id} hint={R.reasonHint}>
          <textarea
            id={id}
            name="reason"
            minLength={10}
            maxLength={500}
            required
            className={TEXTAREA_CLASS}
          />
        </FormField>
      </FormDialog>
    </div>
  );
}

/* ─── Condition actions ─────────────────────────────────────────────── */

export function LegalAnswerDialog() {
  const L = G.legal;
  const ids = {
    q: useId(),
    answer: useId(),
    ref: useId(),
    by: useId(),
    on: useId(),
    interim: useId(),
  };
  return (
    <FormDialog
      label={L.action}
      title={L.title}
      submit={L.save}
      cancel={G.cancel}
      width="wide"
      onSave={async (f) =>
        answer(
          await actions.recordLegalAnswer({
            question: Number(formText(f, "question")),
            answer: formText(f, "answer"),
            sourceRef: formText(f, "sourceRef"),
            givenBy: formText(f, "givenBy"),
            givenOn: formText(f, "givenOn"),
            interim: f.get("interim") === "on",
          }),
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label={L.question} id={ids.q}>
          <select id={ids.q} name="question" className={SELECT_CLASS} required>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={L.sourceRef} id={ids.ref}>
          <Input
            id={ids.ref}
            name="sourceRef"
            minLength={3}
            maxLength={500}
            required
            className="min-h-11"
          />
        </FormField>
        <FormField label={L.givenBy} id={ids.by}>
          <Input
            id={ids.by}
            name="givenBy"
            minLength={2}
            maxLength={200}
            required
            className="min-h-11"
          />
        </FormField>
        <FormField label={L.givenOn} id={ids.on}>
          <Input
            id={ids.on}
            name="givenOn"
            type="date"
            max={today()}
            required
            className="min-h-11"
          />
        </FormField>
        <label
          htmlFor={ids.interim}
          className="text-body-s inline-flex min-h-11 items-center gap-2 self-end"
        >
          <input id={ids.interim} type="checkbox" name="interim" defaultChecked />
          {L.interim}
        </label>
        <div className="sm:col-span-3">
          <FormField label={L.answer} id={ids.answer}>
            <textarea
              id={ids.answer}
              name="answer"
              minLength={3}
              maxLength={4000}
              required
              className={TEXTAREA_CLASS}
            />
          </FormField>
        </div>
      </div>
    </FormDialog>
  );
}

export function BriefingDialog({ pointId }: { pointId: string }) {
  const B = G.briefing;
  const ids = { audience: useId(), held: useId(), notes: useId() };
  return (
    <FormDialog
      label={B.action}
      title={B.title}
      submit={B.save}
      cancel={G.cancel}
      onSave={async (f) =>
        answer(
          await actions.recordBriefing({
            pointId,
            audience: formText(f, "audience"),
            heldOn: formText(f, "heldOn"),
            notes: formText(f, "notes") || null,
          }),
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={B.audience} id={ids.audience}>
          <select id={ids.audience} name="audience" className={SELECT_CLASS} required>
            <option value="pharmacy">{B.pharmacy}</option>
            <option value="prescribers">{B.prescribers}</option>
          </select>
        </FormField>
        <FormField label={B.heldOn} id={ids.held}>
          <Input
            id={ids.held}
            name="heldOn"
            type="date"
            max={today()}
            required
            className="min-h-11"
          />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label={B.notes} id={ids.notes}>
            <textarea id={ids.notes} name="notes" maxLength={1000} className={TEXTAREA_CLASS} />
          </FormField>
        </div>
      </div>
    </FormDialog>
  );
}

/** RD-5: the note is recorded on the first point, the one whose pilot it describes. */
export function PilotNoteDialog({ pointId }: { pointId: string }) {
  const P = G.pilot;
  const id = useId();
  return (
    <FormDialog
      label={P.action}
      title={P.title}
      description={P.hint}
      submit={P.save}
      cancel={G.cancel}
      onSave={async (f) =>
        answer(await actions.recordPilotNote({ pointId, note: formText(f, "note") }))
      }
    >
      <FormField label={P.note} id={id}>
        <textarea
          id={id}
          name="note"
          minLength={20}
          maxLength={4000}
          required
          className={TEXTAREA_CLASS}
        />
      </FormField>
    </FormDialog>
  );
}

/* ─── Settings ──────────────────────────────────────────────────────── */

export function PointSettingsForm({
  pointId,
  initial,
}: {
  pointId: string;
  initial: {
    phone: string | null;
    labelMode: "printed" | "by_hand";
    countFreshnessDays: number | null;
  };
}) {
  const S = G.pointSettings;
  const ids = { phone: useId(), fresh: useId() };
  const { pending, run, said } = useRun();
  return (
    <form
      className="border-border flex flex-col gap-3 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const fresh = formText(f, "fresh");
        run(
          () =>
            actions.updatePointSettings({
              pointId,
              phone: formText(f, "phone") || null,
              labelMode: formText(f, "labelMode"),
              countFreshnessDays: fresh ? Number(fresh) : null,
            }),
          S.saved,
        );
      }}
    >
      <h2 className="text-heading-s">{S.heading}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={S.phone} id={ids.phone} hint={S.phoneHint}>
          <Input
            id={ids.phone}
            name="phone"
            type="tel"
            defaultValue={initial.phone ?? ""}
            maxLength={20}
            className="min-h-11"
          />
        </FormField>
        <FormField label={S.freshness} id={ids.fresh}>
          <Input
            id={ids.fresh}
            name="fresh"
            type="number"
            min={1}
            max={365}
            defaultValue={initial.countFreshnessDays ?? ""}
            className="min-h-11 w-28"
          />
        </FormField>
        <fieldset className="flex flex-col gap-1 sm:col-span-2">
          <legend className="text-caption mb-1 font-medium">{S.labelMode}</legend>
          {(
            [
              ["printed", S.printed],
              ["by_hand", S.byHand],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className="text-body-s inline-flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="labelMode"
                value={v}
                defaultChecked={initial.labelMode === v}
              />
              {label}
            </label>
          ))}
        </fieldset>
      </div>
      <div>
        <Button type="submit" variant="secondary" className="min-h-11" disabled={pending}>
          {S.save}
        </Button>
      </div>
      {said}
    </form>
  );
}

export function HospitalSettingsForm({
  initial,
  smsAllowed,
}: {
  initial: {
    individualInpatientSupply: boolean;
    paymentStatusRequired: boolean;
    expiryLookaheadDays: number | null;
    liveSms: boolean;
  };
  smsAllowed: boolean;
}) {
  const H = G.hospital;
  const id = useId();
  const { pending, run, said } = useRun();
  const box = (name: string, label: string, checked: boolean, disabled = false) => (
    <label className="text-body-s inline-flex min-h-11 items-center gap-2">
      <input type="checkbox" name={name} defaultChecked={checked} disabled={disabled} />
      {label}
    </label>
  );
  return (
    <form
      className="border-border flex flex-col gap-3 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const days = formText(f, "lookahead");
        run(
          () =>
            actions.updatePharmacySettings({
              individualInpatientSupply: f.get("inpatient") === "on",
              paymentStatusRequired: f.get("payment") === "on",
              expiryLookaheadDays: days ? Number(days) : null,
              liveSms: smsAllowed || initial.liveSms ? f.get("sms") === "on" : false,
            }),
          H.saved,
        );
      }}
    >
      {box("inpatient", H.inpatient, initial.individualInpatientSupply)}
      {box("payment", H.payment, initial.paymentStatusRequired)}
      {box("sms", H.sms, initial.liveSms, !smsAllowed && !initial.liveSms)}
      {!smsAllowed && !initial.liveSms ? (
        <StatusWord tone="caution">{H.smsBlocked}</StatusWord>
      ) : null}
      <FormField label={H.lookahead} id={id}>
        <Input
          id={id}
          name="lookahead"
          type="number"
          min={1}
          max={730}
          defaultValue={initial.expiryLookaheadDays ?? ""}
          className="min-h-11 w-28"
        />
      </FormField>
      <div>
        <Button type="submit" variant="secondary" className="min-h-11" disabled={pending}>
          {H.save}
        </Button>
      </div>
      {said}
    </form>
  );
}

/** D-PH1-05: one admin asks, a different admin approves; off needs one. */
export function WithoutPharmacist({
  state,
}: {
  state: "off" | "on" | "requested" | "requested_by_me";
}) {
  const W = G.hospital.without;
  const { pending, run, said } = useRun();
  const step = (s: "request" | "approve" | "off", label: string) => (
    <Button
      type="button"
      variant="secondary"
      className="min-h-11"
      disabled={pending}
      onClick={() => run(() => actions.setSupplyWithoutPharmacist({ step: s }), W.done)}
    >
      {label}
    </Button>
  );
  return (
    <div className="border-border flex flex-col gap-2 rounded-lg border p-4">
      <p className="text-body-s flex flex-wrap items-center gap-2">
        <span className="font-medium">{W.heading}</span>
        {state === "on" ? (
          <StatusWord>{W.on}</StatusWord>
        ) : state === "off" ? (
          <StatusWord>{W.off}</StatusWord>
        ) : (
          <StatusWord tone="caution">{W.requested}</StatusWord>
        )}
      </p>
      <p className="text-body-s text-muted-foreground">{W.lead}</p>
      <div className="flex flex-wrap gap-2">
        {state === "off" ? step("request", W.request) : null}
        {state === "requested" ? step("approve", W.approve) : null}
        {state !== "off" ? step("off", W.turnOff) : null}
      </div>
      {said}
    </div>
  );
}
