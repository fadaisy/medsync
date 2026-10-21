"use client";

import type { Person } from "../../_components/supply-kit";
import type { PackKind } from "@/lib/pharmacy/stores/packs";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  CSO_ALONE,
  PACK_FIELDS as L,
  PACK_TEXT,
  PACKS,
  PACK_REFERENCE as R,
} from "@/content/pharmacy-stores-supply";
import { AttestBox } from "../../_components/supply-kit";
import { Field, SELECT, StoreDialog, TARGET } from "../../places/_components/store-kit";
import { attestSigner, saveSignedPack, signPack } from "../actions";

/**
 * The pack dialogs (Appendix D): a draft is written in fields (or, for the lists and maps, as written JSON in the
 * shape its reader expects); no field is pre-filled with a figure, and the sourced national figure sits beside the
 * field as a reference (Law 6). Signing: the first signer and a second signer, or the CSO alone (D-PH2-22).
 */

type FieldDef = {
  key: string;
  label: string;
  type: "int" | "number" | "text" | "lines" | "select" | "multi";
  options?: readonly (readonly [string, string])[];
  nullable?: boolean;
  reference?: string;
};

const VEN = [
  ["V", L.ven.V],
  ["E", L.ven.E],
  ["N", L.ven.N],
] as const;

/** The structured packs; every other kind is written as JSON. */
const FORMS: Partial<Record<PackKind, readonly FieldDef[]>> = {
  order_parameters: [
    { key: "cycleMonths", label: L.cycleMonths, type: "int", reference: R.cycle },
    { key: "maxMonths", label: L.maxMonths, type: "number", reference: R.maxMonths },
    {
      key: "minMonths",
      label: L.minMonths,
      type: "number",
      nullable: true,
      reference: R.minMonths,
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
      reference: R.reviewWindow,
    },
    { key: "minHistoryDays", label: L.minHistoryDays, type: "int" },
    { key: "unclassedTrimAs", label: L.unclassedTrimAs, type: "select", options: VEN },
    { key: "budgetSource", label: L.budgetSource, type: "text", nullable: true },
  ],
  tracer_list: [
    { key: "source", label: L.source, type: "text", reference: R.tracer },
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
      reference: R.dayRule,
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

function PackField({ f, draft }: { f: FieldDef; draft: unknown }) {
  const id = useId();
  const own = valueAt(draft, f.key);
  const hint = f.reference ? PACKS.reference(f.reference) : undefined;
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
      </Field>
    );
  return (
    <Field label={f.label} id={id} hint={hint}>
      <Input
        id={id}
        name={f.key}
        inputMode={f.type === "text" ? undefined : "decimal"}
        defaultValue={own === undefined || own === null || own === "not_kept" ? "" : String(own)}
        className={TARGET}
      />
      {f.key === "emergencyOrderPointMonths" ? (
        <label className="text-body-s flex min-h-11 items-center gap-2">
          <input type="checkbox" name={`${f.key}__none`} defaultChecked={own === "not_kept"} />
          {PACKS.noEmergencyOrderPoint}
        </label>
      ) : null}
    </Field>
  );
}

export function PackDraftDialog({ kind, draft }: { kind: PackKind; draft: unknown }) {
  const jsonId = useId();
  const name = PACK_TEXT[kind].name;
  const fields = FORMS[kind];
  return (
    <StoreDialog
      label={PACKS.edit}
      title={PACKS.editTitle(name)}
      description={PACKS.intro}
      submit={PACKS.edit}
      width="wide"
      onSave={(clientKey, data) =>
        saveSignedPack({ clientKey, kind, content: contentOf(kind, data) })
      }
    >
      {fields ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <PackField key={f.key} f={f} draft={draft} />
          ))}
        </div>
      ) : (
        <Field label={PACKS.content} id={jsonId} hint={PACKS.jsonHint}>
          <textarea
            id={jsonId}
            name="json"
            rows={14}
            defaultValue={draft ? JSON.stringify(draft, null, 2) : ""}
            className="border-input bg-card text-body-s rounded-md border p-2.5 font-mono"
          />
        </Field>
      )}
    </StoreDialog>
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
