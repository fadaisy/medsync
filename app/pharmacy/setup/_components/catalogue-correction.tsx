"use client";

import { useId, useState } from "react";
import { XIcon } from "lucide-react";

import { Label } from "@/components/ui/label";
import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { STOCK_UP_POLISH } from "@/content/pharmacy-stock-up-polish";
import { PharmacyDialog } from "../../_components/pharmacy-dialog";
import { proposeCorrectionAction } from "../../catalogue-actions";

const K = STOCK_UP_POLISH.correction;
const P = CATALOGUE.page;
const SELECT =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 w-full rounded-md border px-2.5 outline-none";

type Option = { code: string; label: string };

/**
 * Owner item 10: correct a medicine's form and routes from the signed lists only (no free text). Sent as a
 * `correction` proposal; the catalogue team's two curators apply it. Strength, level and VEN stay read-only.
 */
export function CatalogueCorrection({
  medicineId,
  healthSupply,
  formCode,
  routeCodes,
  forms,
  routes,
}: {
  medicineId: string;
  healthSupply: boolean;
  formCode: string | null;
  routeCodes: readonly string[];
  forms: readonly Option[];
  routes: readonly Option[];
}) {
  const ids = { form: useId(), add: useId() };
  const [form, setForm] = useState(formCode ?? "");
  const [chosen, setChosen] = useState<string[]>([...routeCodes]);
  const label = (code: string) => routes.find((r) => r.code === code)?.label ?? code;
  return (
    <PharmacyDialog
      label={K.edit}
      title={K.title}
      description={K.lead}
      submit={K.send}
      cancelLabel={CATALOGUE.cancel}
      width="medium"
      onOpen={() => {
        setForm(formCode ?? "");
        setChosen([...routeCodes]);
      }}
      onSave={() => proposeCorrectionAction({ medicineId, formCode: form || null, routes: chosen })}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {healthSupply ? null : (
          <div className="flex flex-col gap-1">
            <Label htmlFor={ids.form}>{P.form}</Label>
            <select
              id={ids.form}
              className={SELECT}
              required
              value={form}
              onChange={(e) => setForm(e.target.value)}
            >
              <option value="" disabled>
                {K.chooseForm}
              </option>
              {forms.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="text-label text-foreground mb-1">{P.routes}</legend>
          {chosen.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {chosen.map((c) => (
                <li
                  key={c}
                  className="bg-muted text-body-s text-foreground inline-flex h-8 items-center gap-1 rounded-full pr-1 pl-3"
                >
                  {label(c)}
                  <button
                    type="button"
                    aria-label={K.removeRoute(label(c))}
                    onClick={() => setChosen((x) => x.filter((y) => y !== c))}
                    className="hover:bg-ink-200 focus-visible:shadow-focus grid size-6 place-items-center rounded-full outline-none"
                  >
                    <XIcon aria-hidden className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-s text-muted-foreground">{K.noRoute}</p>
          )}
          <Label htmlFor={ids.add} className="sr-only">
            {K.addRoute}
          </Label>
          <select
            id={ids.add}
            className={SELECT}
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) setChosen((x) => (x.includes(v) ? x : [...x, v]));
            }}
          >
            <option value="">{K.addRoute}</option>
            {routes
              .filter((r) => !chosen.includes(r.code))
              .map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
          </select>
        </fieldset>
      </div>
      <p className="text-caption text-muted-foreground">{K.fixed}</p>
    </PharmacyDialog>
  );
}
