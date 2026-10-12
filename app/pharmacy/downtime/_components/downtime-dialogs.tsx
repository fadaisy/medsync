"use client";

import { useId } from "react";

import {
  FormDialog,
  FormField,
  formText,
  SELECT_CLASS,
  TEXTAREA_CLASS,
} from "@/components/medsync/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DOWNTIME_PAGE as D } from "@/content/pharmacy-golive";
import * as actions from "../actions";

/**
 * Downtime set-up dialogs (5.12, wireframe §12.2): Print blank sheets, Record a downtime (the
 * in-charge), Void a sheet number (the in-charge), Record a drill. Each a centred `medium` dialog.
 */

const today = () => new Date().toLocaleDateString("en-CA");
const answer = (r: { ok: boolean; error?: string }) =>
  r.ok ? ({ ok: true } as const) : ({ ok: false, error: r.error ?? D.failed } as const);

export function PrintSheetsDialog() {
  const id = useId();
  return (
    <FormDialog
      label={D.print.action}
      title={D.print.title}
      description={D.print.hint}
      submit={D.print.save}
      cancel={D.cancel}
      variant="primary"
      onSave={async (f) => {
        const r = await actions.reserveSheetNumbers({ count: Number(formText(f, "count")) });
        // A full load: the sheets open on their own page, ready to print.
        if (r.ok && r.data)
          window.location.assign(
            `/pharmacy/downtime/sheets/${r.data.numbers[0]}/${r.data.numbers.at(-1)}`,
          );
        return answer(r);
      }}
    >
      <FormField label={D.print.count} id={id}>
        <Input
          id={id}
          name="count"
          type="number"
          min={1}
          max={200}
          defaultValue={10}
          required
          className="min-h-11 w-28 font-mono"
        />
      </FormField>
    </FormDialog>
  );
}

export function RecordDowntimeDialog({ unused }: { unused: { number: number; label: string }[] }) {
  const ids = { starts: useId(), ends: useId(), reason: useId(), note: useId() };
  return (
    <FormDialog
      label={D.period.action}
      title={D.period.title}
      submit={D.period.save}
      cancel={D.cancel}
      onSave={async (f) =>
        answer(
          await actions.recordDowntime({
            startsAt: new Date(formText(f, "startsAt")).toISOString(),
            endsAt: new Date(formText(f, "endsAt")).toISOString(),
            reason: formText(f, "reason"),
            note: formText(f, "note") || null,
            sheets: f.getAll("sheet").map(Number),
          }),
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={D.period.starts} id={ids.starts}>
          <Input
            id={ids.starts}
            name="startsAt"
            type="datetime-local"
            required
            className="min-h-11"
          />
        </FormField>
        <FormField label={D.period.ends} id={ids.ends}>
          <Input id={ids.ends} name="endsAt" type="datetime-local" required className="min-h-11" />
        </FormField>
        <FormField label={D.period.reason} id={ids.reason}>
          <select id={ids.reason} name="reason" className={SELECT_CLASS} required>
            {Object.entries(D.reasons).map(([code, word]) => (
              <option key={code} value={code}>
                {word}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={D.period.note} id={ids.note}>
          <Input id={ids.note} name="note" maxLength={500} className="min-h-11" />
        </FormField>
        <fieldset className="flex flex-col gap-1 sm:col-span-2">
          <legend className="text-caption mb-1.5 font-medium">{D.period.sheets}</legend>
          {unused.length === 0 ? (
            <p className="text-body-s text-muted-foreground">{D.period.noSheets}</p>
          ) : (
            <div className="grid max-h-56 grid-cols-2 gap-x-4 overflow-y-auto sm:grid-cols-4">
              {unused.map((s) => (
                <label
                  key={s.number}
                  className="text-body-s inline-flex min-h-11 items-center gap-2 font-mono"
                >
                  <input type="checkbox" name="sheet" value={s.number} />
                  {s.label}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      </div>
    </FormDialog>
  );
}

export function VoidSheetDialog({ unused }: { unused: { number: number; label: string }[] }) {
  const ids = { sheet: useId(), reason: useId() };
  return (
    <FormDialog
      label={D.void.action}
      title={D.void.title}
      submit={D.void.save}
      cancel={D.cancel}
      variant="ghost"
      onSave={async (f) =>
        answer(
          await actions.voidSheetNumber({
            number: Number(formText(f, "number")),
            reason: formText(f, "reason"),
          }),
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={D.void.sheet} id={ids.sheet}>
          <select id={ids.sheet} name="number" className={SELECT_CLASS} required>
            {unused.map((s) => (
              <option key={s.number} value={s.number}>
                {s.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={D.void.reason} id={ids.reason}>
          <Input
            id={ids.reason}
            name="reason"
            minLength={3}
            maxLength={200}
            required
            className="min-h-11"
          />
        </FormField>
      </div>
    </FormDialog>
  );
}

export function RecordDrillDialog() {
  const ids = { held: useId(), who: useId(), what: useId(), problems: useId() };
  return (
    <FormDialog
      label={D.drill.action}
      title={D.drill.title}
      description={D.drill.hint}
      submit={D.drill.save}
      cancel={D.cancel}
      onSave={async (f) =>
        answer(
          await actions.recordDrill({
            heldOn: formText(f, "heldOn"),
            participants: formText(f, "participants"),
            whatWasDone: formText(f, "whatWasDone"),
            problems: formText(f, "problems") || null,
          }),
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={D.drill.heldOn} id={ids.held}>
          <Input
            id={ids.held}
            name="heldOn"
            type="date"
            max={today()}
            defaultValue={today()}
            required
            className="min-h-11"
          />
        </FormField>
        <FormField label={D.drill.participants} id={ids.who}>
          <Input id={ids.who} name="participants" maxLength={500} required className="min-h-11" />
        </FormField>
        <FormField label={D.drill.what} id={ids.what}>
          <textarea
            id={ids.what}
            name="whatWasDone"
            maxLength={1000}
            required
            className={TEXTAREA_CLASS}
          />
        </FormField>
        <FormField label={D.drill.problems} id={ids.problems}>
          <textarea id={ids.problems} name="problems" maxLength={1000} className={TEXTAREA_CLASS} />
        </FormField>
      </div>
    </FormDialog>
  );
}

export function PrintButton() {
  return (
    <Button type="button" className="min-h-11" onClick={() => window.print()}>
      {D.sheet.printButton}
    </Button>
  );
}
