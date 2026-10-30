"use client";

import { useState } from "react";

import { FreshFactor, needsFreshFactor } from "@/components/medsync/fresh-factor";
import { Input } from "@/components/ui/input";
import { LABWS2_QUALITY } from "@/content/lab-workspace-v2-quality";
import {
  addNcActionAction,
  authoriseResumptionAction,
  closeNonconformityAction,
  decideLookbackItemAction,
  openNonconformityAction,
  updateNcActionAction,
} from "@/lib/lab/qc-actions";
import { QUALITY } from "../_lib/copy";
import { inputClass, Pop, selectClass } from "../../_components/pop";
import { LabButton } from "@/components/tide/work/button";
import { DateField } from "../../_components/v2/fields";
import { Field, Said, useAct } from "../../setup/criticals/_components/setup-forms";
import { ActButton } from "./act-button";

type Result = { ok: true } | { ok: false; error: string };
const N = QUALITY.nc;
const area =
  "border-input bg-card text-body-s focus-visible:shadow-focus rounded-sm border px-2.5 py-2 outline-none";

/** NC-1: a nonconformity a person opens (equipment, complaint, specimen, other). */
export function OpenNcDialog({ machines }: { machines: { id: string; model: string }[] }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ source: "complaint", title: "", what: "", risk: "", deviceId: "" });
  const save = () =>
    act(async () => {
      const r = await openNonconformityAction({
        source: f.source,
        title: f.title,
        whatHappened: f.what,
        riskText: f.risk.trim() || null,
        deviceId: f.deviceId || null,
      });
      if (r.ok) setOpen(false);
      return r;
    }, "Opened.");
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={N.open}
        title={N.open}
        width="wide"
        open={open}
        setOpen={setOpen}
        action={
          <ActButton variant="primary" type="button" onClick={save} busy={pending}>
            {N.open}
          </ActButton>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={N.source}>
            <select
              value={f.source}
              onChange={(e) => setF({ ...f, source: e.target.value })}
              className={selectClass}
            >
              {(["equipment", "complaint", "specimen", "other"] as const).map((k) => (
                <option key={k} value={k}>
                  {N.sources[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={N.titleField}>
            <Input
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
              maxLength={160}
              className={inputClass}
            />
          </Field>
          <Field label={N.machine}>
            <select
              value={f.deviceId}
              onChange={(e) => setF({ ...f, deviceId: e.target.value })}
              className={selectClass}
            >
              <option value="">None</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.model}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={N.whatField}>
          <textarea
            value={f.what}
            onChange={(e) => setF({ ...f, what: e.target.value })}
            rows={3}
            maxLength={2000}
            className={area}
          />
        </Field>
        <Field label={N.riskField}>
          <textarea
            value={f.risk}
            onChange={(e) => setF({ ...f, risk: e.target.value })}
            rows={2}
            maxLength={2000}
            className={area}
          />
        </Field>
      </Pop>
      <Said message={message} />
    </div>
  );
}

export function AddActionDialog({ ncId }: { ncId: string }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ what: "", who: "", by: "" });
  const save = () =>
    act(async () => {
      const r = await addNcActionAction({ ncId, ...f });
      if (r.ok) setOpen(false);
      return r;
    }, "Action added.");
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={N.addAction}
        title={N.addAction}
        open={open}
        setOpen={setOpen}
        action={
          <ActButton variant="primary" type="button" onClick={save} busy={pending}>
            {N.addAction}
          </ActButton>
        }
      >
        <Field label={N.what}>
          <Input
            value={f.what}
            onChange={(e) => setF({ ...f, what: e.target.value })}
            maxLength={300}
            className={inputClass}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={N.who}>
            <Input
              value={f.who}
              onChange={(e) => setF({ ...f, who: e.target.value })}
              maxLength={120}
              className={inputClass}
            />
          </Field>
          <DateField
            label={N.by}
            value={f.by}
            onChange={(v) => setF({ ...f, by: v })}
            allowFuture
          />
        </div>
      </Pop>
      <Said message={message} />
    </div>
  );
}

export function ActionState({
  ncId,
  actionId,
  what,
}: {
  ncId: string;
  actionId: string;
  what: string;
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const update = (state: "done" | "cancelled") =>
    act(async () => {
      const r = await updateNcActionAction({
        ncId,
        actionId,
        state,
        reason: state === "cancelled" ? reason : null,
      });
      if (r.ok) setOpen(false);
      return r;
    }, "Updated.");
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ActButton
        type="button"
        variant="secondary"
        className="min-h-11 sm:min-h-8"
        busy={pending}
        onClick={() => update("done")}
      >
        {N.done}
        <span className="sr-only">: {what}</span>
      </ActButton>
      <Pop
        label={N.cancel}
        sr={what}
        variant="ghost"
        title={N.cancel}
        lede={what}
        open={open}
        setOpen={setOpen}
        action={
          <ActButton
            variant="primary"
            type="button"
            onClick={() => update("cancelled")}
            busy={pending}
          >
            {N.cancel}
          </ActButton>
        }
      >
        <Field label="Reason">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            className={inputClass}
          />
        </Field>
      </Pop>
      <Said message={message} />
    </div>
  );
}

/** LB-3: one decision per result; Amend is recorded once the result has been amended (Phase 1 path). */
export function DecideItem({ itemId, label }: { itemId: string; label: string }) {
  const { pending, message, act } = useAct();
  const [d, setD] = useState("");
  const L = QUALITY.lookBack;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={`${L.choose}: ${label}`}
        value={d}
        onChange={(e) => setD(e.target.value)}
        className={selectClass}
      >
        <option value="">{L.choose}</option>
        {Object.entries(L.decisions).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <LabButton
        type="button"
        size="sm"
        busy={pending}
        disabledReason={d ? null : LABWS2_QUALITY.sweep.decideFirst}
        onClick={() =>
          act(() => decideLookbackItemAction({ itemId, decision: d }), L.decisions[d] ?? "")
        }
      >
        {L.record}
        <span className="sr-only">: {label}</span>
      </LabButton>
      <Said message={message} />
    </div>
  );
}

export function ResumeButton({
  ncId,
  disabledReason,
}: {
  ncId: string;
  disabledReason: string | null;
}) {
  const { pending, message, act } = useAct();
  return (
    <div className="flex flex-col gap-1">
      <LabButton
        type="button"
        busy={pending}
        disabledReason={disabledReason}
        reasonPlacement="below"
        onClick={() => act(() => authoriseResumptionAction({ ncId }), N.resumed)}
      >
        {N.authorise}
      </LabButton>
      <Said message={message} />
    </div>
  );
}

/** NC-4: cause, effectiveness and the lead's signature (fresh second factor). */
export function CloseForm({ ncId }: { ncId: string }) {
  const { pending, message, act, setMessage } = useAct();
  const [cause, setCause] = useState("");
  const [plan, setPlan] = useState("");
  const [met, setMet] = useState(false);
  const [fresh, setFresh] = useState(false);
  const close = () =>
    act(async (): Promise<Result> => {
      const r = await closeNonconformityAction({
        ncId,
        causeCategory: cause,
        effectivenessPlan: plan,
        effectivenessMet: met,
      });
      if (needsFreshFactor(r)) {
        setFresh(true);
        return { ok: false, error: "Enter your authenticator code to sign." };
      }
      return r;
    }, "Closed.");
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body-s text-muted-foreground">{N.cause}</legend>
        <div className="flex flex-wrap gap-3">
          {Object.entries(N.causes).map(([k, v]) => (
            <label key={k} className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
              <input
                type="radio"
                name={`cause-${ncId}`}
                checked={cause === k}
                onChange={() => setCause(k)}
              />
              {v}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={N.effectiveness}>
        <Input
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          maxLength={1000}
          className={inputClass}
        />
      </Field>
      <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
        <input type="checkbox" checked={met} onChange={(e) => setMet(e.target.checked)} />
        {N.effectivenessMet}
      </label>
      <p className="text-caption text-muted-foreground">{N.closeNote}</p>
      {fresh ? (
        <FreshFactor
          onCancel={() => setFresh(false)}
          onConfirmed={() => {
            setFresh(false);
            setMessage(null);
            close();
          }}
        />
      ) : (
        <ActButton
          variant="primary"
          type="button"
          className="min-h-11 w-fit sm:min-h-9"
          busy={pending}
          onClick={close}
        >
          {N.sign}
        </ActButton>
      )}
      <Said message={message} />
    </div>
  );
}
