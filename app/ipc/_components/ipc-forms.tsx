"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LAB5 } from "@/content/lab-phase-5";
import {
  checkAlertEntryAction,
  clearPatientFlagAction,
  recordIpcActionAction,
  saveAlertEntryAction,
  signAlertEntryAction,
  viewRestrictedAlertAction,
} from "@/lib/ipc/actions";
import { inputClass, newKey, Pop, selectClass } from "../../lab/_components/pop";
import { Field, Said, useAct } from "../../lab/setup/criticals/_components/setup-forms";
import { SignButton } from "../../lab/setup/drafts/_components/sign-button";

/* The infection prevention workspace's dialogs (Lab Phase 5 §5.10, §5.11; IC-5, IC-6, IC-8). Centred pop-ups only. */

export interface AlertView {
  id: string;
  name: string;
  mrn: string;
  ageSex: string;
  place: string;
  admitted: string | null;
  condition: string;
  precaution: string;
  stopLine: string;
  specimen: string | null;
  released: string | null;
  route: string;
  screening: boolean;
  referralState: string | null;
  restricted: boolean;
  closed: boolean;
}

export function AlertDialog({ a, canAct }: { a: AlertView; canAct: boolean }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    kind: "",
    type: "",
    where: "",
    reason: "",
    count: "",
    note: "",
    to: "",
    channel: "",
  });
  const [clientKey, setClientKey] = useState(newKey);
  const detail = () =>
    f.kind === "precautions_started"
      ? { type: f.type, where: f.where }
      : f.kind === "not_needed"
        ? { reason: f.reason }
        : f.kind === "contacts_listed"
          ? { count: Number(f.count), note: f.note }
          : f.kind === "notified"
            ? { to: f.to, channel: f.channel }
            : {};
  return (
    <Pop
      label="Open"
      sr={`${a.condition}, ${a.mrn}`}
      title={a.condition}
      lede={LAB5.ipcMinimum}
      open={open}
      setOpen={(o) => {
        setOpen(o);
        if (o && a.restricted) void viewRestrictedAlertAction({ alertId: a.id });
      }}
      width="wide"
      action={
        canAct && f.kind ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              act(async () => {
                const r = await recordIpcActionAction({
                  alertId: a.id,
                  kind: f.kind,
                  detail: detail(),
                  clientKey,
                });
                if (r.ok) {
                  setClientKey(newKey());
                  setOpen(false);
                }
                return r;
              }, "Recorded.")
            }
          >
            Record
          </Button>
        ) : null
      }
    >
      <dl className="text-body-s grid grid-cols-[10rem_minmax(0,1fr)] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Patient</dt>
        <dd>
          {a.name} · <span className="font-mono">{a.mrn}</span> · {a.ageSex}
        </dd>
        <dt className="text-muted-foreground">Place</dt>
        <dd>{a.place}</dd>
        <dt className="text-muted-foreground">Admitted</dt>
        <dd>{a.admitted ?? "Not admitted"}</dd>
        <dt className="text-muted-foreground">Specimen · released</dt>
        <dd>
          {a.specimen ?? "—"} · {a.released ?? "at referral"}
        </dd>
        <dt className="text-muted-foreground">Suggested precaution</dt>
        <dd>
          {a.precaution}. {a.stopLine}
        </dd>
        {a.screening ? (
          <>
            <dt className="text-muted-foreground">Screening</dt>
            <dd>
              {LAB5.screeningResult} Confirmatory specimen:{" "}
              {a.referralState
                ? `referred (${a.referralState.replace(/_/g, " ")})`
                : "not referred"}
            </dd>
          </>
        ) : null}
        {a.route === "notify_now" || a.route === "weekly_item" ? (
          <>
            <dt className="text-muted-foreground">Also goes to</dt>
            <dd>
              The surveillance focal person (
              {a.route === "notify_now" ? "notify now" : "weekly IDSR item"})
            </dd>
          </>
        ) : null}
      </dl>
      {canAct && !a.closed ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="What was done">
            <select
              className={selectClass}
              value={f.kind}
              onChange={(e) => setF({ ...f, kind: e.target.value })}
            >
              <option value="">Choose</option>
              <option value="precautions_started">Precautions started</option>
              <option value="already_in_precautions">Already in precautions</option>
              <option value="not_needed">Not needed</option>
              <option value="contacts_listed">Contacts listed</option>
              <option value="notified">Notified</option>
            </select>
          </Field>
          {f.kind === "precautions_started" ? (
            <>
              <Field label="Precaution">
                <select
                  className={selectClass}
                  value={f.type}
                  onChange={(e) => setF({ ...f, type: e.target.value })}
                >
                  <option value="">Choose</option>
                  {[
                    "airborne",
                    "droplet",
                    "contact",
                    "contact_if_incontinent",
                    "isolation",
                    "standard",
                  ].map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Where">
                <select
                  className={selectClass}
                  value={f.where}
                  onChange={(e) => setF({ ...f, where: e.target.value })}
                >
                  <option value="">Choose</option>
                  <option value="side_room">Side room</option>
                  <option value="cohort_bay">Cohort bay</option>
                  <option value="no_side_room_free">No side room free</option>
                </select>
              </Field>
            </>
          ) : f.kind === "not_needed" ? (
            <Field label="Why">
              <Input
                className={inputClass}
                value={f.reason}
                onChange={(e) => setF({ ...f, reason: e.target.value })}
                maxLength={300}
              />
            </Field>
          ) : f.kind === "contacts_listed" ? (
            <>
              <Field label="How many contacts">
                <Input
                  className={inputClass}
                  inputMode="numeric"
                  value={f.count}
                  onChange={(e) => setF({ ...f, count: e.target.value })}
                />
              </Field>
              <Field label="Note">
                <Input
                  className={inputClass}
                  value={f.note}
                  onChange={(e) => setF({ ...f, note: e.target.value })}
                  maxLength={300}
                />
              </Field>
            </>
          ) : f.kind === "notified" ? (
            <>
              <Field label="Who">
                <Input
                  className={inputClass}
                  value={f.to}
                  onChange={(e) => setF({ ...f, to: e.target.value })}
                  maxLength={120}
                />
              </Field>
              <Field label="How">
                <select
                  className={selectClass}
                  value={f.channel}
                  onChange={(e) => setF({ ...f, channel: e.target.value })}
                >
                  <option value="">Choose</option>
                  <option value="phone">Phone</option>
                  <option value="in_person">In person</option>
                  <option value="eidsr">eIDSR</option>
                  <option value="form">Paper form</option>
                </select>
              </Field>
            </>
          ) : null}
        </div>
      ) : null}
      {f.kind === "precautions_started" ? <p className="text-body-s">{LAB5.patientFlag}</p> : null}
      <Said message={message} />
    </Pop>
  );
}

export function ClearFlagDialog({
  patientUserId,
  entryKey,
  label,
}: {
  patientUserId: string;
  entryKey: string;
  label: string;
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Pop
      label="Clear"
      sr={label}
      variant="ghost"
      title={`Clear the flag: ${label}`}
      lede="Only infection prevention clears a flag, with the reason (for example the clearance criterion your policy sets). The history stays."
      open={open}
      setOpen={setOpen}
      action={
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const r = await clearPatientFlagAction({ patientUserId, entryKey, reason });
              if (r.ok) setOpen(false);
              return r;
            }, "Cleared.")
          }
        >
          Clear the flag
        </Button>
      }
    >
      <Field label="Why">
        <Input
          className={inputClass}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
        />
      </Field>
      <Said message={message} />
    </Pop>
  );
}

const PRECAUTIONS = [
  "airborne",
  "droplet",
  "contact",
  "contact_if_incontinent",
  "isolation",
  "standard",
];
export function EntryDialog({
  tests,
}: {
  tests: {
    code: string;
    name: string;
    concept: string;
    answers: { code: string; label: string }[];
  }[];
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    key: "",
    condition: "",
    trigger: "result",
    test: "",
    answers: [] as string[],
    scope: "every_ward",
    precaution: "airborne",
    stopLine: "",
    precSource: "",
    ipcAlert: true,
    route: "none",
    idsrItem: "",
    reference: "",
    confirmation: false,
    source: "",
  });
  const test = tests.find((t) => t.code === f.test);
  return (
    <Pop
      label="Add an entry"
      title="Alert list entry"
      lede="Every precaution comes with its source (CDC Isolation Precautions Appendix A, reconciled with the Uganda IPC Guidelines 2025). Every IDSR route names its item and table."
      open={open}
      setOpen={setOpen}
      width="wide"
      action={
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const r = await saveAlertEntryAction({
                key: f.key.trim().toLowerCase(),
                payload: {
                  condition: f.condition,
                  trigger:
                    f.trigger === "outbreak_referral"
                      ? { kind: "outbreak_referral" }
                      : {
                          kind: "result",
                          testCode: f.test,
                          concept: test?.concept ?? "",
                          answers: f.answers,
                        },
                  scope: f.scope,
                  precaution: { type: f.precaution, stopLine: f.stopLine, source: f.precSource },
                  ipcAlert: f.ipcAlert,
                  route: {
                    kind: f.route,
                    idsrItem: f.idsrItem || null,
                    reference: f.reference || null,
                  },
                  confirmationNeeded: f.confirmation,
                  source: f.source,
                },
              });
              if (r.ok) setOpen(false);
              return r;
            }, "Saved as a draft. Sign it; a laboratory lead countersigns it.")
          }
        >
          Save draft
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Key (for example rr_tb)">
          <Input
            className={inputClass}
            value={f.key}
            onChange={(e) => setF({ ...f, key: e.target.value })}
            maxLength={40}
          />
        </Field>
        <Field label="Condition">
          <Input
            className={inputClass}
            value={f.condition}
            onChange={(e) => setF({ ...f, condition: e.target.value })}
            maxLength={120}
          />
        </Field>
        <Field label="Raised by">
          <select
            className={selectClass}
            value={f.trigger}
            onChange={(e) => setF({ ...f, trigger: e.target.value })}
          >
            <option value="result">A released result</option>
            <option value="outbreak_referral">An outbreak referral</option>
          </select>
        </Field>
        {f.trigger === "result" ? (
          <Field label="Test">
            <select
              className={selectClass}
              value={f.test}
              onChange={(e) => setF({ ...f, test: e.target.value, answers: [] })}
            >
              <option value="">Choose</option>
              {tests.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Where it alerts">
          <select
            className={selectClass}
            value={f.scope}
            onChange={(e) => setF({ ...f, scope: e.target.value })}
          >
            <option value="every_ward">Every ward</option>
            <option value="high_risk_units">High-risk units only</option>
          </select>
        </Field>
        <Field label="Suggested precaution">
          <select
            className={selectClass}
            value={f.precaution}
            onChange={(e) => setF({ ...f, precaution: e.target.value })}
          >
            {PRECAUTIONS.map((p) => (
              <option key={p} value={p}>
                {p.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {test ? (
        <fieldset className="text-body-s flex flex-wrap gap-3">
          <legend className="text-muted-foreground mb-1">Answers that raise it</legend>
          {test.answers.map((x) => (
            <label key={x.code} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.answers.includes(x.code)}
                onChange={(e) =>
                  setF({
                    ...f,
                    answers: e.target.checked
                      ? [...f.answers, x.code]
                      : f.answers.filter((y) => y !== x.code),
                  })
                }
              />
              {x.label}
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Stop line (when precautions end)">
          <Input
            className={inputClass}
            value={f.stopLine}
            onChange={(e) => setF({ ...f, stopLine: e.target.value })}
            maxLength={300}
          />
        </Field>
        <Field label="Precaution source (document and page)">
          <Input
            className={inputClass}
            value={f.precSource}
            onChange={(e) => setF({ ...f, precSource: e.target.value })}
            maxLength={300}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="IDSR route">
          <select
            className={selectClass}
            value={f.route}
            onChange={(e) => setF({ ...f, route: e.target.value })}
          >
            <option value="none">None</option>
            <option value="notify_now">Notify now</option>
            <option value="weekly_item">Weekly IDSR item</option>
            <option value="programme_route">Programme route</option>
          </select>
        </Field>
        {f.route === "notify_now" || f.route === "weekly_item" ? (
          <>
            <Field label="IDSR item">
              <Input
                className={inputClass}
                value={f.idsrItem}
                onChange={(e) => setF({ ...f, idsrItem: e.target.value })}
                maxLength={120}
              />
            </Field>
            <Field label="IDSR table and row">
              <Input
                className={inputClass}
                value={f.reference}
                onChange={(e) => setF({ ...f, reference: e.target.value })}
                maxLength={200}
              />
            </Field>
          </>
        ) : null}
      </div>
      <div className="text-body-s flex flex-wrap gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={f.ipcAlert}
            onChange={(e) => setF({ ...f, ipcAlert: e.target.checked })}
          />
          IPC acts on it
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={f.confirmation}
            onChange={(e) => setF({ ...f, confirmation: e.target.checked })}
          />
          A screening result: confirmation needed
        </label>
      </div>
      <Field label="Source of the entry">
        <Input
          className={inputClass}
          value={f.source}
          onChange={(e) => setF({ ...f, source: e.target.value })}
          maxLength={300}
        />
      </Field>
      <Said message={message} />
    </Pop>
  );
}

export function SignEntry({
  configId,
  as,
  authoredByMe,
}: {
  configId: string;
  as: "ipc_lead" | "lab_counter";
  authoredByMe: boolean;
}) {
  return (
    <SignButton
      label={as === "ipc_lead" ? "Sign" : "Countersign"}
      okText={
        as === "ipc_lead"
          ? "Signed. A laboratory lead countersigns it."
          : "Countersigned. The entry is in force."
      }
      authoredByMe={authoredByMe}
      noteLabel="You wrote this draft: say why no one else can sign"
      onSign={(exceptionNote) => signAlertEntryAction({ configId, as, exceptionNote })}
    />
  );
}

export function CheckEntry({ configId }: { configId: string }) {
  const { pending, message, act } = useAct();
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        className="min-h-11 w-fit sm:min-h-8"
        disabled={pending}
        onClick={() =>
          act(
            () => checkAlertEntryAction({ configId, note: null }),
            "Checked against the IDSR guidelines.",
          )
        }
      >
        Checked against IDSR
      </Button>
      <Said message={message} />
    </div>
  );
}
