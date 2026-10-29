"use client";

import type { Person } from "../../_components/supply-kit";
import type { TemplateField } from "@/lib/pharmacy/stores/pack-templates";
import type { PackKind } from "@/lib/pharmacy/stores/packs";
import { useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { ALL_PACK_TEXT as PACK_TEXT } from "@/content/pharmacy-network";
import { STOCK_UP_POLISH } from "@/content/pharmacy-stock-up-polish";
import { CSO_ALONE, PACK_FIELDS as L, PACKS } from "@/content/pharmacy-stores-supply";
import {
  basisOf,
  PACK_TEMPLATES,
  PACK_TEMPLATES_COPY,
  startingDraft,
} from "@/lib/pharmacy/stores/pack-templates";
import { AttestBox } from "../../_components/supply-kit";
import { Field, SELECT, StoreDialog, TARGET } from "../../places/_components/store-kit";
import { attestSigner, saveSignedPack, signPack } from "../actions";

/**
 * The pack dialogs (Appendix D): a draft is written in fields (or, for the lists and maps, as written JSON in the
 * shape its reader expects). ADR 0469 (owner, 29 Oct 2026; supersedes Law 6's "nothing is pre-filled"): with no draft
 * and no version in force, the dialog opens with MedSync's starting draft, each field saying where its value comes
 * from. Saving and signing are unchanged. Signing: the first signer and a second signer, or the CSO alone (D-PH2-22).
 */
const S = STOCK_UP_POLISH.packs;

type FieldDef = {
  key: string;
  label: string;
  type: "int" | "number" | "text" | "lines" | "select" | "multi";
  options?: readonly (readonly [string, string])[];
  nullable?: boolean;
};

const VEN = [
  ["V", L.ven.V],
  ["E", L.ven.E],
  ["N", L.ven.N],
] as const;

/** The structured packs; every other kind is written as JSON. */
const FORMS: Partial<Record<PackKind, readonly FieldDef[]>> = {
  order_parameters: [
    { key: "cycleMonths", label: L.cycleMonths, type: "int" },
    { key: "maxMonths", label: L.maxMonths, type: "number" },
    {
      key: "minMonths",
      label: L.minMonths,
      type: "number",
      nullable: true,
    },
    {
      key: "emergencyOrderPointMonths",
      label: L.emergencyOrderPointMonths,
      type: "number",
      nullable: true,
    },
    {
      key: "reviewWindowMonths",
      label: L.reviewWindowMonths,
      type: "int",
    },
    { key: "minHistoryDays", label: L.minHistoryDays, type: "int" },
    { key: "unclassedTrimAs", label: L.unclassedTrimAs, type: "select", options: VEN },
    { key: "budgetSource", label: L.budgetSource, type: "text", nullable: true },
  ],
  tracer_list: [
    { key: "source", label: L.source, type: "text" },
    { key: "medicineIds", label: L.medicines, type: "lines" },
  ],
  cart_lookahead: [{ key: "days", label: L.days, type: "int" }],
  month_end_rules: [
    { key: "countWindow.daysBefore", label: L.daysBefore, type: "int" },
    { key: "countWindow.daysAfter", label: L.daysAfter, type: "int" },
    { key: "outOfStockShare", label: L.outOfStockShare, type: "number" },
    { key: "largeDifferenceUnits", label: L.largeDifferenceUnits, type: "int" },
    {
      key: "reportLocationKinds",
      label: L.reportKinds,
      type: "multi",
      options: [
        ["store", "Stores"],
        ["dispensing_point", "Dispensing points"],
        ["ward", "Wards"],
        ["cart", "Carts"],
      ],
    },
  ],
  ward_rules: [
    { key: "confirmationWindowHours", label: L.confirmationWindowHours, type: "int" },
    {
      key: "allocationRule",
      label: L.allocationRule,
      type: "select",
      options: [["first_expiry", L.firstExpiry]],
    },
  ],
  recall_template: [{ key: "body", label: L.body, type: "text" }],
  stockout_day_rule: [
    {
      key: "rule",
      label: L.rule,
      type: "select",
      options: Object.entries(L.dayRules) as [string, string][],
    },
  ],
  message_name: [{ key: "name", label: L.name, type: "text" }],
};

const setPath = (o: Record<string, unknown>, path: string, v: unknown) => {
  const [head, ...rest] = path.split(".");
  if (!rest.length) o[head!] = v;
  else setPath((o[head!] ??= {}) as Record<string, unknown>, rest.join("."), v);
};

/** The content a form gives; an empty field stays empty (never a default), and the server's schema decides. */
function contentOf(kind: PackKind, data: FormData): unknown {
  const fields = FORMS[kind];
  if (!fields) {
    const raw = String(data.get("json") ?? "").trim();
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = String(data.get(f.key) ?? "").trim();
    if (f.type === "multi") setPath(out, f.key, data.getAll(f.key).map(String));
    else if (f.type === "lines") setPath(out, f.key, v.split(/\s+/).filter(Boolean));
    else if (v === "")
      setPath(
        out,
        f.key,
        // Law 6: "not kept" is an answer the signer ticks, never what an empty field means.
        f.key === "emergencyOrderPointMonths"
          ? data.get(`${f.key}__none`)
            ? "not_kept"
            : undefined
          : f.nullable
            ? null
            : undefined,
      );
    else if (f.type === "int" || f.type === "number") setPath(out, f.key, Number(v));
    else setPath(out, f.key, v);
  }
  return out;
}

const valueAt = (o: unknown, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (x, k) => (x && typeof x === "object" ? (x as Record<string, unknown>)[k] : undefined),
      o,
    );

/** The small line under a field: where MedSync's value comes from. */
const basisLine = (b: TemplateField) =>
  b.basis === "national"
    ? S.basis.national(b.source)
    : b.basis === "medsync"
      ? S.basis.medsync(b.reason)
      : S.basis.hospital(b.reason);

/** The basis is shown while the value is still MedSync's (or the hospital's to choose); a changed value is theirs. */
function basisHint(kind: PackKind, path: string, start: unknown, fromTemplate: boolean) {
  const b = basisOf(kind, path);
  if (!b) return undefined;
  const same = JSON.stringify(valueAt(start, path) ?? null) === JSON.stringify(b.value);
  return fromTemplate || same ? basisLine(b) : undefined;
}

function PackField({
  kind,
  f,
  draft,
  fromTemplate,
  choices,
}: {
  kind: PackKind;
  f: FieldDef;
  draft: unknown;
  fromTemplate: boolean;
  choices: readonly string[];
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const own = valueAt(draft, f.key);
  const hint = basisHint(kind, f.key, draft, fromTemplate);
  const unmapped = (basisOf(kind, f.key) as { unmapped?: string[] } | undefined)?.unmapped;
  if (f.type === "select")
    return (
      <Field label={f.label} id={id} hint={hint}>
        <select
          id={id}
          name={f.key}
          className={SELECT}
          defaultValue={typeof own === "string" ? own : ""}
          required
        >
          <option value="" disabled>
            —
          </option>
          {f.options!.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
    );
  if (f.type === "multi")
    return (
      <fieldset className="flex flex-col gap-1">
        <legend className="text-body-s">{f.label}</legend>
        {f.options!.map(([v, l]) => (
          <label key={v} className="text-body-s inline-flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              name={f.key}
              value={v}
              defaultChecked={Array.isArray(own) && own.includes(v)}
            />
            {l}
          </label>
        ))}
        {hint ? <p className="text-caption text-muted-foreground">{hint}</p> : null}
      </fieldset>
    );
  if (f.type === "lines")
    return (
      <Field label={f.label} id={id} hint={hint}>
        <textarea
          id={id}
          name={f.key}
          rows={6}
          defaultValue={Array.isArray(own) ? own.join("\n") : ""}
          className="border-input bg-card text-body-s rounded-md border p-2.5 font-mono"
        />
        {unmapped?.length ? (
          <p className="text-caption text-muted-foreground">{S.unmapped(unmapped.join("; "))}</p>
        ) : null}
      </Field>
    );
  return (
    <Field label={f.label} id={id} hint={hint}>
      <Input
        ref={input}
        id={id}
        name={f.key}
        inputMode={f.type === "text" ? undefined : "decimal"}
        defaultValue={own === undefined || own === null || own === "not_kept" ? "" : String(own)}
        className={TARGET}
      />
      {choices.length ? (
        <span className="flex flex-wrap gap-2">
          {choices.map((c) => (
            <button
              key={c}
              type="button"
              className="border-border text-body-s text-foreground hover:bg-ink-50 min-h-11 rounded-md border px-3"
              onClick={() => {
                if (input.current) input.current.value = c;
                input.current?.focus();
              }}
            >
              {S.choose(c)}
            </button>
          ))}
        </span>
      ) : null}
      {f.key === "emergencyOrderPointMonths" ? (
        <label className="text-body-s flex min-h-11 items-center gap-2">
          <input type="checkbox" name={`${f.key}__none`} defaultChecked={own === "not_kept"} />
          {PACKS.noEmergencyOrderPoint}
        </label>
      ) : null}
    </Field>
  );
}

/**
 * Write a draft. Opens with the hospital's draft, else the version in force, else MedSync's starting draft
 * (`startingDraft`). `choices` adds one-click answers only the page knows (the hospital's name), by field.
 */
export function PackDraftDialog({
  kind,
  draft,
  signed = null,
  choices = {},
}: {
  kind: PackKind;
  draft: unknown;
  signed?: unknown;
  choices?: Partial<Record<string, readonly string[]>>;
}) {
  const jsonId = useId();
  const name = PACK_TEXT[kind].name;
  const fields = FORMS[kind];
  const start = startingDraft(kind, {
    draft: draft == null ? null : { content: draft },
    signed: signed == null ? null : { content: signed },
  });
  const fromTemplate = start.from === "template";
  const choicesFor = (path: string) => {
    const b = basisOf(kind, path);
    return [...(choices[path] ?? []), ...(b?.basis === "hospital" ? (b.choices ?? []) : [])];
  };
  return (
    <StoreDialog
      label={PACKS.edit}
      title={PACKS.editTitle(name)}
      description={S.intro}
      submit={PACKS.edit}
      width="wide"
      onSave={(clientKey, data) =>
        saveSignedPack({ clientKey, kind, content: contentOf(kind, data) })
      }
    >
      {start.from === "draft" ? null : (
        <p className="text-body-s text-ink-700">
          {fromTemplate
            ? `${S.fromTemplate}${PACK_TEMPLATES_COPY.status === "draft" ? ` ${S.unsigned}` : ""}`
            : S.fromSigned}
        </p>
      )}
      {fields ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <PackField
              key={f.key}
              kind={kind}
              f={f}
              draft={start.content}
              fromTemplate={fromTemplate}
              choices={choicesFor(f.key)}
            />
          ))}
        </div>
      ) : (
        <>
          <Field label={PACKS.content} id={jsonId} hint={PACKS.jsonHint}>
            <textarea
              id={jsonId}
              name="json"
              rows={14}
              defaultValue={start.content ? JSON.stringify(start.content, null, 2) : ""}
              className="border-input bg-card text-body-s rounded-md border p-2.5 font-mono"
            />
          </Field>
          <JsonBasis kind={kind} start={start.content} fromTemplate={fromTemplate} />
        </>
      )}
    </StoreDialog>
  );
}

/** For a pack written as JSON: each part's basis, by its place in the content. */
function JsonBasis({
  kind,
  start,
  fromTemplate,
}: {
  kind: PackKind;
  start: unknown;
  fromTemplate: boolean;
}) {
  const lines = Object.keys(PACK_TEMPLATES.packs[kind] ?? {})
    .map((path) => [path, basisHint(kind, path, start, fromTemplate)] as const)
    .filter((l): l is readonly [string, string] => !!l[1]);
  if (!lines.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-caption text-foreground">{S.fieldBasis}</p>
      <ul className="text-caption text-muted-foreground flex flex-col gap-1">
        {lines.map(([path, line]) => (
          <li key={path}>
            <span className="font-mono">{path}</span>: {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SignPackDialog({
  kind,
  packId,
  me,
  people,
}: {
  kind: PackKind;
  packId: string;
  me: Person;
  people: readonly Person[];
}) {
  const [first, setFirst] = useState<{ id: string; who: string } | null>(null);
  const [second, setSecond] = useState<{ id: string; who: string } | null>(null);
  const [alone, setAlone] = useState(false);
  const [a, b] = PACK_TEXT[kind].signers;
  return (
    <StoreDialog
      label={PACKS.sign}
      title={PACKS.signTitle(PACK_TEXT[kind].name)}
      description={PACKS.signIntro}
      submit={PACKS.sign}
      variant="primary"
      width="wide"
      onOpen={() => {
        setFirst(null);
        setSecond(null);
        setAlone(false);
      }}
      onSave={async (clientKey) => {
        if (!first) return { ok: false, code: "invalid", error: PACKS.refused.attestation };
        if (!alone && !second)
          return { ok: false, code: "invalid", error: PACKS.refused.needSecond };
        return signPack({
          clientKey,
          packId,
          firstAttestationId: first.id,
          second: alone ? { exception: CSO_ALONE } : { attestationId: second!.id },
        });
      }}
    >
      <AttestBox
        people={[me]}
        action="sign_pack"
        attest={attestSigner}
        done={first}
        onDone={setFirst}
        label={`${PACKS.firstSigner}: ${alone ? PACKS.csoRole : a}`}
      />
      <label className="text-body-s inline-flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={alone} onChange={(e) => setAlone(e.target.checked)} />
        {PACKS.alone}
      </label>
      {alone ? null : (
        <AttestBox
          people={people.filter((p) => p.userId !== me.userId)}
          action="sign_pack"
          attest={attestSigner}
          done={second}
          onDone={setSecond}
          label={`${PACKS.secondSigner}: ${b}`}
        />
      )}
    </StoreDialog>
  );
}
