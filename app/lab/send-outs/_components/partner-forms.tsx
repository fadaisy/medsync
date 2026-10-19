"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { monthTitle } from "@/lib/lab/field-kit";
import {
  savePartnerAction,
  savePartnerConfigAction,
  signPartnerConfigAction,
} from "@/lib/lab/referral-actions";
import { inputClass, Pop, selectClass } from "../../_components/pop";
import { LabButton } from "../../_components/v2/button";
import { DateField, PickField } from "../../_components/v2/fields";
import { Field, Said, useAct } from "../../setup/criticals/_components/setup-forms";
import { SignButton } from "../../setup/drafts/_components/sign-button";

/* Partners, their tests and packing, the legal record and the field list (Lab Phase 4 §5.10; PT-1..PT-3). Every
   value is typed by the person who signs it; nothing is proposed. */

const KINDS = {
  national_reference: "National reference lab",
  public_lab: "Public lab",
  private_lab: "Private lab",
  abroad: "Lab outside Uganda",
  outbreak: "Outbreak destination",
  hub: "Hub",
} as const;
export interface PartnerFormValue {
  id?: string;
  name: string;
  kind: keyof typeof KINDS;
  transport: { code: string; words: string }[];
  resultsReturn: { channel: "paper" | "portal_print" | "sms" | "electronic"; words: string }[];
  contacts: { role: string; name: string; phone?: string | null }[];
  active: boolean;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "x$1")
    .slice(0, 30) || "item";

export function PartnerDialog({ initial }: { initial?: PartnerFormValue }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: initial?.name ?? "",
    kind: initial?.kind ?? "private_lab",
    transport: initial?.transport.map((t) => t.words).join("\n") ?? "",
    results: initial?.resultsReturn.map((r) => r.words).join("\n") ?? "",
    contact: initial?.contacts[0]?.name ?? "",
    phone: initial?.contacts[0]?.phone ?? "",
    active: initial?.active ?? true,
  });
  const lines = (s: string) =>
    s
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  const save = () =>
    act(async () => {
      const r = await savePartnerAction({
        ...(initial?.id ? { id: initial.id } : {}),
        name: f.name,
        kind: f.kind,
        transport: lines(f.transport).map((w) => ({ code: slug(w), words: w })),
        resultsReturn: lines(f.results).map((w) => ({
          channel: /electronic|system/i.test(w)
            ? "electronic"
            : /sms/i.test(w)
              ? "sms"
              : /portal|dashboard|print/i.test(w)
                ? "portal_print"
                : "paper",
          words: w,
        })),
        contacts: f.contact.trim()
          ? [{ role: "Lab contact", name: f.contact.trim(), phone: f.phone.trim() || null }]
          : [],
        active: f.active,
      });
      if (r.ok) setOpen(false);
      return r;
    }, "Saved.");
  return (
    <Pop
      label={initial ? "Edit partner" : "Add a partner"}
      sr={initial?.name}
      variant={initial ? "ghost" : "secondary"}
      title={initial ? initial.name : "Add a partner"}
      lede="Who they are, how specimens travel there, and how results come back."
      open={open}
      setOpen={setOpen}
      width="wide"
      action={
        <LabButton type="button" onClick={save} variant="primary" busy={pending}>
          Save
        </LabButton>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input
            className={inputClass}
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            maxLength={120}
          />
        </Field>
        <Field label="Kind">
          <select
            className={selectClass}
            value={f.kind}
            onChange={(e) => setF({ ...f, kind: e.target.value as keyof typeof KINDS })}
          >
            {Object.entries(KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="How specimens travel there (one per line)">
          <textarea
            className="border-input bg-card text-body-s min-h-20 rounded-sm border p-2"
            value={f.transport}
            onChange={(e) => setF({ ...f, transport: e.target.value })}
          />
        </Field>
        <Field label="How results come back (one per line)">
          <textarea
            className="border-input bg-card text-body-s min-h-20 rounded-sm border p-2"
            value={f.results}
            onChange={(e) => setF({ ...f, results: e.target.value })}
          />
        </Field>
        <Field label="Their lab contact">
          <Input
            className={inputClass}
            value={f.contact}
            onChange={(e) => setF({ ...f, contact: e.target.value })}
            maxLength={120}
          />
        </Field>
        <Field label="Their phone">
          <Input
            className={inputClass}
            value={f.phone ?? ""}
            onChange={(e) => setF({ ...f, phone: e.target.value })}
            maxLength={40}
          />
        </Field>
      </div>
      {initial ? (
        <label className="text-body-s flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4"
            checked={f.active}
            onChange={(e) => setF({ ...f, active: e.target.checked })}
          />
          Active (new specimens may be sent here)
        </label>
      ) : null}
      <Said message={message} />
    </Pop>
  );
}

type Test = {
  testCode: string;
  theirCode: string;
  category: string;
  value: string;
  unit: "" | "hours" | "days" | "working_days";
  ids: string;
  requirements: string;
};

/** PT-1, S1: the lab lead's draft of a partner's tests: their code, the stated turnaround with its unit, what they need. */
export function TestsDialog({
  partnerId,
  partnerName,
  tests,
  menu,
}: {
  partnerId: string;
  partnerName: string;
  tests: Test[];
  menu: { code: string; display: string }[];
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const blank: Test = {
    testCode: "",
    theirCode: "",
    category: "",
    value: "",
    unit: "",
    ids: "",
    requirements: "",
  };
  const [rows, setRows] = useState<Test[]>(tests.length ? tests : [blank]);
  const [source, setSource] = useState({ doc: "", date: "" });
  const set = (i: number, k: keyof Test, v: string) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const save = () =>
    act(async () => {
      const r = await savePartnerConfigAction({
        kind: "partner_tests",
        key: partnerId,
        payload: {
          tests: rows
            .filter((t) => t.testCode && t.theirCode)
            .map((t) => ({
              testCode: t.testCode,
              theirCode: t.theirCode,
              category: t.category || "general",
              ...(t.value && t.unit
                ? { turnaround: { value: Number(t.value), unit: t.unit } }
                : {}),
              requiredIds: t.ids
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean)
                .map((w) => ({ key: slug(w), words: w, symbologies: [] })),
              ...(t.requirements.trim() ? { requirements: t.requirements.trim() } : {}),
            })),
          holidays: [],
          source,
        },
      });
      if (r.ok) setOpen(false);
      return r;
    }, "Draft saved. The laboratory lead signs it.");
  return (
    <Pop
      label="Edit tests"
      sr={partnerName}
      title={`Tests at ${partnerName}`}
      lede="From their price list or test guide. Turnaround is their stated figure; leave it empty if they state none (never overdue then)."
      open={open}
      setOpen={setOpen}
      width="wide"
      action={
        <LabButton type="button" onClick={save} variant="primary" busy={pending}>
          Save draft
        </LabButton>
      }
    >
      {rows.map((t, i) => (
        <div key={i} className="border-border grid gap-2 rounded-md border p-3 sm:grid-cols-6">
          <Field label="Our test">
            <select
              className={selectClass}
              value={t.testCode}
              onChange={(e) => set(i, "testCode", e.target.value)}
            >
              <option value="">Choose</option>
              {menu.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.display}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Their code">
            <Input
              className={inputClass}
              value={t.theirCode}
              onChange={(e) => set(i, "theirCode", e.target.value)}
            />
          </Field>
          <Field label="Specimen category">
            <Input
              className={inputClass}
              value={t.category}
              onChange={(e) => set(i, "category", e.target.value)}
            />
          </Field>
          <Field label="Stated turnaround">
            <Input
              type="number"
              min={0}
              className={inputClass}
              value={t.value}
              onChange={(e) => set(i, "value", e.target.value)}
            />
          </Field>
          <Field label="Unit">
            <select
              className={selectClass}
              value={t.unit}
              onChange={(e) => set(i, "unit", e.target.value)}
            >
              <option value="">Not stated</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
              <option value="working_days">Working days</option>
            </select>
          </Field>
          <Field label="Identifiers they need (comma-separated)">
            <Input
              className={inputClass}
              value={t.ids}
              onChange={(e) => set(i, "ids", e.target.value)}
            />
          </Field>
        </div>
      ))}
      <Button type="button" variant="ghost" onClick={() => setRows((r) => [...r, blank])}>
        Add a test
      </Button>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Source (their list or guide)">
          <Input
            className={inputClass}
            value={source.doc}
            onChange={(e) => setSource({ ...source, doc: e.target.value })}
          />
        </Field>
        <DateField
          label="Its date"
          value={source.date}
          onChange={(date) => setSource({ ...source, date })}
        />
      </div>
      <Said message={message} />
    </Pop>
  );
}

/** PT-1: the packing checklist for one specimen category, as the destination asks (the lab lead signs). */
export function PackingDialog({
  partnerId,
  partnerName,
  category,
  items,
}: {
  partnerId: string;
  partnerName: string;
  category: string;
  items: string[];
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(items.join("\n"));
  const [source, setSource] = useState({ doc: "", date: "" });
  const save = () =>
    act(async () => {
      const lines = text
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      const r = await savePartnerConfigAction({
        kind: "partner_packing",
        key: `${partnerId}:${category}`,
        payload: { category, items: lines.map((w) => ({ key: slug(w), words: w })), source },
      });
      if (r.ok) setOpen(false);
      return r;
    }, "Draft saved. The laboratory lead signs it.");
  return (
    <Pop
      label={`Packing: ${category}`}
      sr={partnerName}
      title={`Packing for ${partnerName} · ${category}`}
      lede="One item per line, as the destination asks (and the WHO transport guidance)."
      open={open}
      setOpen={setOpen}
      action={
        <LabButton type="button" onClick={save} variant="primary" busy={pending}>
          Save draft
        </LabButton>
      }
    >
      <textarea
        className="border-input bg-card text-body-s min-h-28 rounded-sm border p-2"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Source">
          <Input
            className={inputClass}
            value={source.doc}
            onChange={(e) => setSource({ ...source, doc: e.target.value })}
          />
        </Field>
        <DateField
          label="Its date"
          value={source.date}
          onChange={(date) => setSource({ ...source, date })}
        />
      </div>
      <Said message={message} />
    </Pop>
  );
}

/** Signing a draft: the one person the kind names, with a fresh second factor (D-LAB1-12 carried over). */
export function SignDraft({
  kind,
  configId,
  authoredByMe,
  label,
}: {
  kind: "partner_tests" | "partner_packing" | "referral_ops";
  configId: string;
  authoredByMe: boolean;
  label: string;
}) {
  return (
    <SignButton
      label={label}
      okText="Signed."
      authoredByMe={authoredByMe}
      noteLabel="You wrote this draft: say why no one else can sign it"
      onSign={(exceptionNote) => signPartnerConfigAction({ kind, configId, exceptionNote })}
    />
  );
}

/** Months to pick from (two years back, one ahead), newest first, keeping a stored value outside that window. */
function monthOptions(current: string) {
  const now = new Date();
  const keys = Array.from({ length: 36 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 12 - i, 1));
    return d.toISOString().slice(0, 7);
  });
  if (current && !keys.includes(current)) keys.push(current);
  return keys.map((k) => ({
    value: k,
    label: monthTitle(Number(k.slice(0, 4)), Number(k.slice(5))),
  }));
}

/** Operational referral settings (never clinical): the presence window, the stop after a review date, the 10.4 switch. */
export function SettingsDialog({
  initial,
}: {
  initial: { presenceMinutes: number | null; stop: number | null; from: string | null };
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    presence: String(initial.presenceMinutes ?? ""),
    stop: String(initial.stop ?? ""),
    from: initial.from ?? "",
  });
  const save = () =>
    act(async () => {
      const r = await savePartnerConfigAction({
        kind: "referral_ops",
        key: "settings",
        payload: {
          presenceMinutes: Number(f.presence),
          stopSendingDaysAfterReview: Number(f.stop),
          ...(f.from ? { hmis104RecordsFrom: f.from } : {}),
        },
      });
      if (r.ok) setOpen(false);
      return r;
    }, "Draft saved. Sign it to put it in force.");
  return (
    <Pop
      label="Referral settings"
      title="Referral settings (operational)"
      lede="Not clinical: how recent another person's lab work must be to count them on duty, and when electronic sending stops after a review date passes."
      open={open}
      setOpen={setOpen}
      action={
        <LabButton type="button" onClick={save} variant="primary" busy={pending}>
          Save draft
        </LabButton>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="On duty if active within (minutes)">
          <Input
            type="number"
            className={inputClass}
            value={f.presence}
            onChange={(e) => setF({ ...f, presence: e.target.value })}
          />
        </Field>
        <Field label="Stop electronic sending (days after review date)">
          <Input
            type="number"
            className={inputClass}
            value={f.stop}
            onChange={(e) => setF({ ...f, stop: e.target.value })}
          />
        </Field>
        <PickField
          label="HMIS 10.4 from records from (month)"
          options={monthOptions(f.from)}
          value={f.from}
          onChange={(from) => setF({ ...f, from })}
        />
      </div>
      <Said message={message} />
    </Pop>
  );
}
