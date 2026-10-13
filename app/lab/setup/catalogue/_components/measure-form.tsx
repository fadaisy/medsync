"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveMeasureAction } from "@/lib/lab/measures-actions";
import { METHOD_WORDS } from "../_lib/methods";
import { Field, Said, useAct } from "../../criticals/_components/setup-forms";

const selectClass =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 rounded-sm border px-2 outline-none sm:min-h-9";

/**
 * One component's measurement facts (§5.6 panel; UN-1, UN-4, UN-6, UN-7). Saving any change makes
 * the next version: results already entered keep the unit and version they were entered with.
 */
export function MeasureForm({
  testId,
  conceptId,
  title,
  current,
  units,
  methodRegister,
}: {
  testId: string;
  conceptId: string;
  title: string;
  current: {
    resultType: "number" | "coded" | "text";
    unitUcum: string | null;
    decimalPlaces: number | null;
    loincCode: string | null;
    entryCheckLow: string | null;
    entryCheckHigh: string | null;
    version: number | null;
    methodCode: string | null;
    idmsTraceable: boolean | null;
  };
  units: { code: string; display: string; words: string }[];
  /** Lab catalogue v2 is on here: the method register shows. */
  methodRegister: boolean;
}) {
  const { pending, message, act } = useAct();
  const [resultType, setResultType] = useState(current.resultType);
  const [unit, setUnit] = useState(current.unitUcum ?? "");
  const [decimals, setDecimals] = useState(
    current.decimalPlaces === null ? "" : String(current.decimalPlaces),
  );
  const [loinc, setLoinc] = useState(current.loincCode ?? "");
  const [low, setLow] = useState(current.entryCheckLow ?? "");
  const [high, setHigh] = useState(current.entryCheckHigh ?? "");
  const [method, setMethod] = useState(current.methodCode ?? "");
  const [idms, setIdms] = useState(current.idmsTraceable ?? false);
  const number = resultType === "number";
  const creatinine = conceptId === "obs.creatinine";
  const save = () =>
    act(
      () =>
        saveMeasureAction({
          testId,
          conceptId,
          resultType,
          unitUcum: number ? unit || null : null,
          decimalPlaces: number && decimals !== "" ? Number(decimals) : null,
          loincCode: loinc.trim() || null,
          entryCheckLow: number && low.trim() ? low.trim() : null,
          entryCheckHigh: number && high.trim() ? high.trim() : null,
          // With the register off the stored method rides through unchanged.
          methodCode: methodRegister ? method || null : current.methodCode,
          idmsTraceable: methodRegister ? (creatinine ? idms : null) : current.idmsTraceable,
        }),
      current.version
        ? `Saved as version ${current.version + 1}. Results already entered keep version ${current.version}.`
        : "Saved.",
    );
  return (
    <section
      aria-labelledby="measure-heading"
      className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
    >
      <h2 id="measure-heading" className="text-heading-s">
        {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Result type">
          <select
            name="resultType"
            value={resultType}
            onChange={(e) => setResultType(e.target.value as typeof resultType)}
            className={selectClass}
          >
            <option value="number">Number</option>
            <option value="coded">Positive or negative</option>
            <option value="text">Text</option>
          </select>
        </Field>
        {number ? (
          <>
            <Field label="Unit">
              <select
                name="unitUcum"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className={selectClass}
              >
                <option value="">Choose a unit</option>
                {units.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.display} ({u.words})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Decimal places">
              <Input
                name="decimalPlaces"
                value={decimals}
                onChange={(e) => setDecimals(e.target.value)}
                inputMode="numeric"
                className="min-h-11 w-24 font-mono tabular-nums sm:min-h-9"
              />
            </Field>
          </>
        ) : null}
      </div>
      <Field label="LOINC code (optional; checked against the imported table)">
        <Input
          name="loincCode"
          value={loinc}
          onChange={(e) => setLoinc(e.target.value)}
          className="min-h-11 w-40 font-mono sm:min-h-9"
        />
      </Field>
      {methodRegister ? (
        <div className="flex flex-col gap-2">
          <Field label="Method">
            <select
              name="methodCode"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className={`${selectClass} w-fit`}
            >
              <option value="">None</option>
              {Object.entries(METHOD_WORDS).map(([code, words]) => (
                <option key={code} value={code}>
                  {words}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-body-s text-muted-foreground">
            A method change is a new version: results keep the method they were entered with.
          </p>
          {creatinine ? (
            <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-9">
              <input
                type="checkbox"
                name="idmsTraceable"
                checked={idms}
                onChange={(e) => setIdms(e.target.checked)}
                className="size-4 accent-teal-600"
              />
              Traceable to IDMS
            </label>
          ) : null}
        </div>
      ) : null}
      {number ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-body-s text-muted-foreground">
            Entry check (optional): a value outside asks for a confirm
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Entry check low"
              name="entryCheckLow"
              value={low}
              onChange={(e) => setLow(e.target.value)}
              inputMode="decimal"
              className="min-h-11 w-28 text-right font-mono tabular-nums sm:min-h-9"
            />
            <span aria-hidden>–</span>
            <Input
              aria-label="Entry check high"
              name="entryCheckHigh"
              value={high}
              onChange={(e) => setHigh(e.target.value)}
              inputMode="decimal"
              className="min-h-11 w-28 text-right font-mono tabular-nums sm:min-h-9"
            />
          </div>
        </fieldset>
      ) : null}
      <p className="text-body-s text-muted-foreground">
        {current.version
          ? `Version ${current.version}. A change makes version ${current.version + 1}; results already entered keep theirs. Nothing is converted.`
          : "Not set yet: this component cannot be resulted until it has a unit."}
      </p>
      <div>
        <Button type="button" onClick={save} disabled={pending}>
          Save
        </Button>
      </div>
      <Said message={message} />
    </section>
  );
}
