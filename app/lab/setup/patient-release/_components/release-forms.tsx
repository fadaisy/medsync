"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { savePatientReleaseDraftAction } from "@/lib/lab/patient-release-actions";
import { inputClass, Pop, selectClass } from "../../../_components/pop";
import { Field, Said, useAct } from "../../criticals/_components/setup-forms";

/* What patients see (Lab Phase 5 §5.5): the laboratory lead's drafts. Every setting, window and word is the lead's,
   with its source; MedSync proposes none. Another lead signs, the CSO countersigns. Centred pop-ups only. */

const GROUPS = [
  ["routine", "Routine results"],
  ["critical", "Critical results"],
  ["referred", "Results from a reference lab"],
  ["bedside", "Bedside (point-of-care) results"],
  ["corrected", "Corrected results"],
] as const;
const list = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
const int = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));

function DraftPop({
  label,
  title,
  lede,
  draft,
  children,
}: {
  label: string;
  title: string;
  lede: string;
  draft: () => { kind: string; key: string; payload: unknown };
  children: ReactNode;
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  return (
    <Pop
      label={label}
      title={title}
      lede={lede}
      width="wide"
      open={open}
      setOpen={setOpen}
      action={
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const r = await savePatientReleaseDraftAction(draft());
              if (r.ok) setOpen(false);
              return r;
            }, "Draft saved. Another laboratory lead signs it.")
          }
        >
          Save draft
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
      <Said message={message} />
    </Pop>
  );
}

function Source({
  doc,
  date,
  set,
}: {
  doc: string;
  date: string;
  set: (k: "doc" | "date", v: string) => void;
}) {
  return (
    <>
      <Field label="Source document">
        <Input className={inputClass} value={doc} onChange={(e) => set("doc", e.target.value)} />
      </Field>
      <Field label="Source date">
        <Input className={inputClass} value={date} onChange={(e) => set("date", e.target.value)} />
      </Field>
    </>
  );
}

export function ReleaseTableDialog() {
  const [g, setG] = useState(
    Object.fromEntries(GROUPS.map(([k]) => [k, { inApp: "never", sms: false }])) as Record<
      string,
      { inApp: string; sms: boolean }
    >,
  );
  const [f, setF] = useState({ hold: "", aged: "", doc: "", date: "" });
  return (
    <DraftPop
      label="Release table"
      title="Release table"
      lede="For each kind of result: when the patient may see it in the app, and whether a results-ready message is sent. Never is the starting point."
      draft={() => ({
        kind: "patient_release",
        key: "hospital",
        payload: {
          groups: g,
          holdMaxDays: int(f.hold),
          agedWindowDays: int(f.aged),
          source: { doc: f.doc, date: f.date },
        },
      })}
    >
      {GROUPS.map(([k, name]) => (
        <fieldset key={k} className="border-border flex flex-col gap-2 rounded-md border p-3">
          <legend className="text-body-s px-1">{name}</legend>
          <select
            aria-label={`${name}: in the app`}
            className={selectClass}
            value={g[k]!.inApp}
            onChange={(e) => setG({ ...g, [k]: { ...g[k]!, inApp: e.target.value } })}
          >
            <option value="never">Never in the app</option>
            <option value="after_review">After the clinician reviews it</option>
            <option value="after_told">After the clinician has spoken to them</option>
          </select>
          <label className="text-body-s flex items-center gap-2">
            <input
              type="checkbox"
              checked={g[k]!.sms}
              onChange={(e) => setG({ ...g, [k]: { ...g[k]!, sms: e.target.checked } })}
            />
            Send a results-ready message
          </label>
        </fieldset>
      ))}
      <Field label="Longest hold, in days">
        <Input
          className={inputClass}
          inputMode="numeric"
          value={f.hold}
          onChange={(e) => setF({ ...f, hold: e.target.value })}
        />
      </Field>
      <Field label="Unreviewed after, in days (listed for the clinician and head)">
        <Input
          className={inputClass}
          inputMode="numeric"
          value={f.aged}
          onChange={(e) => setF({ ...f, aged: e.target.value })}
        />
      </Field>
      <Source doc={f.doc} date={f.date} set={(k, v) => setF({ ...f, [k]: v })} />
    </DraftPop>
  );
}

export function MinorsDialog() {
  const [under12, setUnder12] = useState<string[]>([]);
  const [teen, setTeen] = useState<string[]>([]);
  const [own, setOwn] = useState(false);
  const [ref, setRef] = useState("");
  const pick = (v: string[], set: (x: string[]) => void, k: string, on: boolean) =>
    set(on ? [...v, k] : v.filter((x) => x !== k));
  return (
    <DraftPop
      label="Minors rule"
      title="Minors rule"
      lede="What a verified guardian sees, and whether a 12 to 17-year-old sees their own results, as the hospital's legal opinion says."
      draft={() => ({
        kind: "minors_rule",
        key: "hospital",
        payload: {
          under12Guardian: under12,
          adolescentGuardian: teen,
          adolescentOwnAccess: own,
          legalOpinionRef: ref,
        },
      })}
    >
      {(
        [
          ["Guardian of a child under 12 sees", under12, setUnder12],
          ["Guardian of a 12 to 17-year-old sees", teen, setTeen],
        ] as const
      ).map(([legend, v, set]) => (
        <fieldset key={legend} className="border-border flex flex-col gap-1 rounded-md border p-3">
          <legend className="text-body-s px-1">{legend}</legend>
          {GROUPS.map(([k, name]) => (
            <label key={k} className="text-body-s flex items-center gap-2">
              <input
                type="checkbox"
                checked={v.includes(k)}
                onChange={(e) => pick([...v], set, k, e.target.checked)}
              />
              {name}
            </label>
          ))}
        </fieldset>
      ))}
      <label className="text-body-s flex items-center gap-2">
        <input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} />A 12 to
        17-year-old sees their own results
      </label>
      <Field label="Legal opinion reference">
        <Input className={inputClass} value={ref} onChange={(e) => setRef(e.target.value)} />
      </Field>
    </DraftPop>
  );
}

export function SmsTemplateDialog() {
  const [f, setF] = useState({ language: "en", text: "", senderId: "" });
  return (
    <DraftPop
      label="Results-ready message"
      title="Results-ready message"
      lede="One message per language. It names only the hospital ({Hospital}), never a test, value, clinic or link, and says how to stop."
      draft={() => ({ kind: "sms_template", key: f.language, payload: f })}
    >
      <Field label="Language code (en, lg, sw)">
        <Input
          className={inputClass}
          value={f.language}
          onChange={(e) => setF({ ...f, language: e.target.value.trim().toLowerCase() })}
        />
      </Field>
      <Field label="Sender ID">
        <Input
          className={inputClass}
          maxLength={11}
          value={f.senderId}
          onChange={(e) => setF({ ...f, senderId: e.target.value })}
        />
      </Field>
      <Field label="Message">
        <textarea
          className="border-input min-h-24 rounded-md border px-3 py-2"
          maxLength={300}
          value={f.text}
          onChange={(e) => setF({ ...f, text: e.target.value })}
        />
      </Field>
    </DraftPop>
  );
}

export function FloorAdditionsDialog() {
  const [codes, setCodes] = useState("");
  const [reason, setReason] = useState("");
  return (
    <DraftPop
      label="Never in the app: add tests"
      title="Add tests that are never shown in the app"
      lede="These join HIV, pregnancy, tissue and cytology. A test can be added here; none can be taken off the floor."
      draft={() => ({
        kind: "patient_floor_additions",
        key: "hospital",
        payload: { testCodes: list(codes), reason },
      })}
    >
      <Field label="Test codes, one per line (test.…)">
        <textarea
          className="border-input min-h-24 rounded-md border px-3 py-2 font-mono"
          value={codes}
          onChange={(e) => setCodes(e.target.value)}
        />
      </Field>
      <Field label="Reason">
        <Input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </DraftPop>
  );
}

export function PlainWordsDialog() {
  const [f, setF] = useState({
    concept: "",
    language: "en",
    what: "",
    short: "",
    within: "",
    higher: "",
    lower: "",
    noRange: "",
    method: "",
    score: "",
    translator: "",
    backTranslator: "",
    reviewer: "",
    banned: "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const text = (k: keyof typeof f, label: string) => (
    <Field label={label}>
      <textarea
        className="border-input min-h-16 rounded-md border px-3 py-2"
        value={f[k]}
        onChange={set(k)}
      />
    </Field>
  );
  return (
    <DraftPop
      label="Plain words"
      title="Plain words for one test"
      lede="What the patient reads beside one result, per language. No diagnosis, dose, treatment instruction or reassurance that depends on the value."
      draft={() => ({
        kind: "plain_words",
        key: `${f.concept}:${f.language}`,
        payload: {
          concept: f.concept,
          language: f.language,
          whatThisTestIs: f.what,
          shortLine: f.short,
          action: { within: f.within, higher: f.higher, lower: f.lower, noRange: f.noRange },
          harmAnchor: null,
          calculated: [],
          readability: { method: f.method, score: Number(f.score) },
          translation:
            f.language === "en"
              ? null
              : {
                  translator: f.translator,
                  backTranslator: f.backTranslator,
                  reviewer: f.reviewer,
                },
          bannedPhrases: list(f.banned),
        },
      })}
    >
      <Field label="Component concept (obs.…)">
        <Input className={inputClass} value={f.concept} onChange={set("concept")} />
      </Field>
      <Field label="Language code">
        <Input className={inputClass} value={f.language} onChange={set("language")} />
      </Field>
      {text("what", "What this test is")}
      {text("short", "One short line")}
      {text("within", "If within the usual range")}
      {text("higher", "If higher")}
      {text("lower", "If lower")}
      {text("noRange", "If there is no range")}
      <Field label="Readability method">
        <Input className={inputClass} value={f.method} onChange={set("method")} />
      </Field>
      <Field label="Readability score">
        <Input className={inputClass} inputMode="decimal" value={f.score} onChange={set("score")} />
      </Field>
      {f.language !== "en" ? (
        <>
          <Field label="Translator">
            <Input className={inputClass} value={f.translator} onChange={set("translator")} />
          </Field>
          <Field label="Back translator">
            <Input
              className={inputClass}
              value={f.backTranslator}
              onChange={set("backTranslator")}
            />
          </Field>
          <Field label="Reviewer">
            <Input className={inputClass} value={f.reviewer} onChange={set("reviewer")} />
          </Field>
        </>
      ) : null}
      {text("banned", "Banned phrases, one per line")}
    </DraftPop>
  );
}
