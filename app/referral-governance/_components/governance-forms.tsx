"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FIELD_ALLOW_LIST } from "@/lib/exchange/partners";
import {
  endDesignationAction,
  saveGovernanceConfigAction,
  setDesignationAction,
  signGovernanceConfigAction,
} from "@/lib/lab/governance-actions";
import { kampalaToday } from "@/lib/lab/referral-words";
import { inputClass, Pop, selectClass } from "../../lab/_components/pop";
import { Field, Said, useAct } from "../../lab/setup/criticals/_components/setup-forms";
import { SignButton } from "../../lab/setup/drafts/_components/sign-button";

/* The referral governance desk's forms (Lab Phase 4 P8, A6; PT-2, PT-3, D-LAB4-07, D-LAB4-21). */

const FIELD_WORDS: Record<(typeof FIELD_ALLOW_LIST)[number], string> = {
  hospital_number: "Hospital number",
  name: "Name",
  birth_date: "Date of birth",
  sex: "Sex",
  nin: "National ID number",
  lab_number: "Our lab number",
  specimen_type: "Specimen type",
  collected_at: "When collected",
  test: "Test",
};
const BASIS = {
  s7_2_a: "s.7(2)(a) authorised or required by law",
  s7_2_b_i: "s.7(2)(b)(i) a public duty",
  s7_2_d: "s.7(2)(d) medical purposes",
  s7_2_e: "s.7(2)(e) a legal obligation",
} as const;

/** PT-3, S2: the field list. Diagnosis, phone and address are not choices: they can never be sent. */
export function FieldsDialog({
  partnerId,
  partnerName,
  fields,
  clinicalQuestion,
}: {
  partnerId: string;
  partnerName: string;
  fields: string[];
  clinicalQuestion: boolean;
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<string[]>(fields);
  const [q, setQ] = useState(clinicalQuestion);
  const save = () =>
    act(async () => {
      const r = await saveGovernanceConfigAction({
        kind: "partner_fields",
        key: partnerId,
        payload: { fields: f, clinicalQuestion: q },
      });
      if (r.ok) setOpen(false);
      return r;
    }, "Draft saved. The data protection lead signs it.");
  return (
    <Pop
      label="Fields we send"
      sr={partnerName}
      title={`What we send ${partnerName}`}
      lede="Diagnosis, phone number and address are never sent."
      open={open}
      setOpen={setOpen}
      action={
        <Button type="button" onClick={save} disabled={pending}>
          Save draft
        </Button>
      }
    >
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Fields</legend>
        {FIELD_ALLOW_LIST.map((k) => (
          <label key={k} className="text-body-s flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={f.includes(k)}
              onChange={() => setF((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]))}
            />
            {FIELD_WORDS[k]}
          </label>
        ))}
      </fieldset>
      <label className="text-body-s flex items-center gap-2">
        <input
          type="checkbox"
          className="size-4"
          checked={q}
          onChange={(e) => setQ(e.target.checked)}
        />
        The doctor&apos;s clinical question (do not write the diagnosis in it)
      </label>
      <Said message={message} />
    </Pop>
  );
}

/** PT-2: the legal record under the Data Protection and Privacy Act 2019 (the data protection lead signs). */
export function LegalDialog({
  partnerId,
  partnerName,
  abroad,
}: {
  partnerId: string;
  partnerName: string;
  abroad: boolean;
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    basis: "s7_2_d",
    ref: "",
    signedOn: "",
    reviewOn: "",
    processor: false,
    cross: abroad,
    safeguards: "",
    consent: false,
    pdpo: "",
    renew: "",
    breach: "",
  });
  const save = () =>
    act(async () => {
      const r = await saveGovernanceConfigAction({
        kind: "partner_legal",
        key: partnerId,
        payload: {
          basis: f.basis,
          ...(f.ref
            ? { agreement: { ref: f.ref, signedOn: f.signedOn, reviewOn: f.reviewOn } }
            : {}),
          processorTerms: f.processor,
          crossBorder: f.cross,
          ...(f.safeguards ? { safeguards: { ref: f.safeguards } } : {}),
          perPatientConsent: f.consent,
          pdpo: { ref: f.pdpo, renewOn: f.renew },
          breachContact: f.breach,
        },
      });
      if (r.ok) setOpen(false);
      return r;
    }, "Draft saved. The data protection lead signs it.");
  const t = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <Pop
      label="Legal record"
      sr={partnerName}
      title={`Legal record · ${partnerName}`}
      lede="Paper referrals to a public reference lab need the basis recorded; electronic sending needs all of it and a signed agreement."
      open={open}
      setOpen={setOpen}
      width="wide"
      action={
        <Button type="button" onClick={save} disabled={pending}>
          Save draft
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Legal basis">
          <select className={selectClass} value={f.basis} onChange={t("basis")}>
            {Object.entries(BASIS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Agreement reference">
          <Input className={inputClass} value={f.ref} onChange={t("ref")} />
        </Field>
        <Field label="Agreement signed on">
          <Input type="date" className={inputClass} value={f.signedOn} onChange={t("signedOn")} />
        </Field>
        <Field label="Agreement review date">
          <Input type="date" className={inputClass} value={f.reviewOn} onChange={t("reviewOn")} />
        </Field>
        <Field label="Hospital's PDPO registration">
          <Input className={inputClass} value={f.pdpo} onChange={t("pdpo")} />
        </Field>
        <Field label="PDPO renewal date">
          <Input type="date" className={inputClass} value={f.renew} onChange={t("renew")} />
        </Field>
        <Field label="Partner's breach contact">
          <Input className={inputClass} value={f.breach} onChange={t("breach")} />
        </Field>
        <Field label="Cross-border safeguards (reference)">
          <Input className={inputClass} value={f.safeguards} onChange={t("safeguards")} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="text-body-s flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4"
            checked={f.processor}
            onChange={(e) => setF({ ...f, processor: e.target.checked })}
          />
          Processor terms in the agreement (s.21)
        </label>
        <label className="text-body-s flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4"
            checked={f.cross}
            onChange={(e) => setF({ ...f, cross: e.target.checked })}
          />
          Data leaves Uganda (s.19)
        </label>
        <label className="text-body-s flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4"
            checked={f.consent}
            onChange={(e) => setF({ ...f, consent: e.target.checked })}
          />
          Instead, each patient&apos;s consent is recorded on the referral
        </label>
      </div>
      <Said message={message} />
    </Pop>
  );
}

export function SignGovernance({
  kind,
  configId,
  authoredByMe,
  label,
}: {
  kind: "partner_legal" | "partner_fields" | "referral_wording";
  configId: string;
  authoredByMe: boolean;
  label: string;
}) {
  return (
    <SignButton
      label={label}
      okText="Signed."
      authoredByMe={authoredByMe}
      noteLabel="You wrote this draft: say why no one else holding this designation can sign it"
      onSign={(exceptionNote) => signGovernanceConfigAction({ kind, configId, exceptionNote })}
    />
  );
}

/** D-LAB4-07: the IPC lead's wording for a high-risk specimen, and the site procedure it points at. */
export function WordingDialog({ text, procedureRef }: { text: string; procedureRef: string }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ text, ref: procedureRef });
  return (
    <Pop
      label="High-risk wording"
      title="High-risk referral wording"
      lede="What the lab reads when a high-risk specimen is on To refer. The CSO countersigns it."
      open={open}
      setOpen={setOpen}
      width="wide"
      action={
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const r = await saveGovernanceConfigAction({
                kind: "referral_wording",
                key: "high_risk",
                payload: { highRisk: f.text, procedureRef: f.ref },
              });
              if (r.ok) setOpen(false);
              return r;
            }, "Draft saved.")
          }
        >
          Save draft
        </Button>
      }
    >
      <textarea
        className="border-input bg-card text-body-s min-h-32 rounded-sm border p-2"
        value={f.text}
        onChange={(e) => setF({ ...f, text: e.target.value })}
      />
      <Field label="The site's outbreak procedure (reference)">
        <Input
          className={inputClass}
          value={f.ref}
          onChange={(e) => setF({ ...f, ref: e.target.value })}
        />
      </Field>
      <Said message={message} />
    </Pop>
  );
}

/** The hospital admin names the data protection lead and the IPC lead. */
export function DesignateDialog({
  role,
  people,
}: {
  role: "data_protection_lead" | "ipc_lead";
  people: { id: string; name: string }[];
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const today = kampalaToday();
  const label =
    role === "data_protection_lead" ? "Name the data protection lead" : "Name the IPC lead";
  return (
    <Pop
      label={label}
      title={label}
      open={open}
      setOpen={setOpen}
      action={
        <Button
          type="button"
          disabled={pending || !userId}
          onClick={() =>
            act(async () => {
              const r = await setDesignationAction({ role, userId, startsOn: today });
              if (r.ok) setOpen(false);
              return r;
            }, "Named.")
          }
        >
          Name
        </Button>
      }
    >
      <Field label="Person">
        <select className={selectClass} value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Choose</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Said message={message} />
    </Pop>
  );
}

export function EndDesignation({ id, name }: { id: string; name: string }) {
  const { pending, message, act } = useAct();
  const today = kampalaToday();
  return (
    <span className="inline-flex flex-col">
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 sm:min-h-8"
        disabled={pending}
        onClick={() => act(() => endDesignationAction({ id, endsOn: today }), "Ended today.")}
      >
        End <span className="sr-only">{name}</span>
      </Button>
      <Said message={message} />
    </span>
  );
}
