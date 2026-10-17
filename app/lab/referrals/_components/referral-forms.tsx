"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REJECTION_REASON_TEXT } from "@/lib/emr/orders";
import {
  markLostAction,
  recordReferralEventAction,
  requestCancelAction,
} from "@/lib/lab/referral-actions";
import { inputClass, Pop, selectClass } from "../../_components/pop";
import { Field, Said, useAct } from "../../setup/criticals/_components/setup-forms";

/* The selected referral's actions (Lab Phase 4 §5.3; RF-4, RF-8, RF-9, RF-10, EX-7). Each says who said so and
   from what; a status dated earlier than the last one applied is kept but does not move the referral. */

const UPDATES = {
  at_hub: "At the hub",
  received_by_lab: "Received at the reference lab",
  accepted: "Accepted by the reference lab",
  in_progress: "Testing",
  on_hold: "On hold at the reference lab",
  rejected: "Rejected by the reference lab",
  failed: "Could not be done",
  cancelled: "Cancelled (the reference lab confirmed)",
} as const;
const DOCS = {
  rider_log: "The rider's log book",
  phone_call: "A phone call",
  signed_manifest: "The signed manifest",
  their_portal: "Their portal or dashboard",
  their_paper: "Their paper",
  sms: "An SMS",
  in_person: "In person",
  other: "Other",
} as const;
const localNow = () => {
  const d = new Date(Date.now() + 3 * 3_600_000);
  return d.toISOString().slice(0, 16);
};
const fromLocal = (v: string) => new Date(`${v}:00+03:00`).toISOString();

export function UpdateDialog({ referralId, number }: { referralId: string; number: string }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    kind: "at_hub",
    at: localNow(),
    document: "rider_log",
    reason: "",
    note: "",
  });
  const save = () =>
    act(async () => {
      const r = await recordReferralEventAction({
        referralId,
        kind: f.kind,
        eventAt: fromLocal(f.at),
        document: f.document,
        reasonCode: f.kind === "rejected" ? f.reason || null : null,
        note: f.note.trim() || null,
      });
      if (r.ok) setOpen(false);
      return r;
    }, "Update recorded.");
  return (
    <Pop
      label="Record an update"
      sr={number}
      title={`Update · ${number}`}
      lede="Say what happened, when, and where you learnt it."
      open={open}
      setOpen={setOpen}
      width="wide"
      action={
        <Button type="button" onClick={save} disabled={pending}>
          Record
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="What happened">
          <select
            value={f.kind}
            onChange={(e) => setF({ ...f, kind: e.target.value })}
            className={selectClass}
          >
            {Object.entries(UPDATES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="When (Kampala time)">
          <Input
            type="datetime-local"
            value={f.at}
            onChange={(e) => setF({ ...f, at: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Who said so">
          <select
            value={f.document}
            onChange={(e) => setF({ ...f, document: e.target.value })}
            className={selectClass}
          >
            {Object.entries(DOCS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {f.kind === "rejected" ? (
        <Field label="Why they rejected it">
          <select
            value={f.reason}
            onChange={(e) => setF({ ...f, reason: e.target.value })}
            className={selectClass}
          >
            <option value="">Choose</option>
            {Object.entries(REJECTION_REASON_TEXT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Note (optional)">
        <Input
          value={f.note}
          onChange={(e) => setF({ ...f, note: e.target.value })}
          maxLength={1000}
          className={inputClass}
        />
      </Field>
      <Said message={message} />
    </Pop>
  );
}

export function CallDialog({ referralId, number }: { referralId: string; number: string }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <Pop
      label="Note a call"
      sr={number}
      title={`Call · ${number}`}
      lede="Who you spoke to and what they said."
      open={open}
      setOpen={setOpen}
      action={
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const r = await recordReferralEventAction({
                referralId,
                kind: "call",
                eventAt: new Date().toISOString(),
                document: "phone_call",
                reasonCode: null,
                note,
              });
              if (r.ok) setOpen(false);
              return r;
            }, "Call noted.")
          }
        >
          Note
        </Button>
      }
    >
      <Field label="The call">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          className={inputClass}
        />
      </Field>
      <Said message={message} />
    </Pop>
  );
}

export function CancelDialog({ referralId, number }: { referralId: string; number: string }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <Pop
      label="Note the doctor's cancel"
      variant="ghost"
      sr={number}
      title={`Cancel · ${number}`}
      lede="Before handover it is cancelled; after it, the reference lab decides. A result that still comes back files with the cancel noted."
      open={open}
      setOpen={setOpen}
      action={
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const r = await requestCancelAction({ referralId, note });
              if (r.ok) setOpen(false);
              return r;
            }, "Cancel noted.")
          }
        >
          Note cancel
        </Button>
      }
    >
      <Field label="Who asked, and how the reference lab was told">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          className={inputClass}
        />
      </Field>
      <Said message={message} />
    </Pop>
  );
}

export function LostDialog({ referralId, number }: { referralId: string; number: string }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <Pop
      label="Mark lost"
      variant="ghost"
      sr={number}
      title={`Lost · ${number}`}
      lede="Marking lost opens a nonconformity and tells the doctor, who decides on a new sample."
      open={open}
      setOpen={setOpen}
      action={
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const r = await markLostAction({ referralId, callNote: note });
              if (r.ok) setOpen(false);
              return r;
            }, "Marked lost.")
          }
        >
          Mark lost
        </Button>
      }
    >
      <Field label="The call you made to look for it">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          className={inputClass}
        />
      </Field>
      <Said message={message} />
    </Pop>
  );
}
