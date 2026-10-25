"use client";

import { Input } from "@/components/ui/input";
import { REACTIONS_UI as U } from "@/content/pharmacy-clinical";
import { DateField } from "../../../../lab/_components/v2/fields";
import {
  Field,
  SELECT,
  StoreDialog,
  str,
  TARGET,
} from "../../../store/places/_components/store-kit";
import { recordSuspectedReaction } from "../../actions";

const F = U.fields;

function Pick({
  id,
  options,
  blank,
}: {
  id: string;
  options: Record<string, string>;
  blank?: string;
}) {
  return (
    <select id={id} name={id} className={SELECT} required={!blank}>
      {blank ? <option value="">{blank}</option> : null}
      {Object.entries(options).map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

/**
 * 5.6 / AR-1, AR-2: record one event against this patient. One suspected medicine per record here.
 * ponytail: one suspect per form; the write takes up to ten, add rows when a second suspect is asked for.
 */
export function RecordReactionDialog({
  patientUserId,
  medicines,
}: {
  patientUserId: string;
  medicines: readonly { id: string; name: string }[];
}) {
  return (
    <StoreDialog
      label={U.record}
      title={U.record}
      description={
        <>
          <strong>{U.emergency}</strong> {U.willDo}
        </>
      }
      submit={U.save}
      width="wide"
      onSave={(clientKey, d) => {
        const id = str(d, "medicine");
        const other = str(d, "other");
        const name = id ? (medicines.find((m) => m.id === id)?.name ?? id) : other;
        return recordSuspectedReaction({
          clientKey,
          patientUserId,
          kind: str(d, "kind"),
          medicines: name
            ? [{ medicineId: id || null, name, productId: null, batchId: null, main: true }]
            : [],
          reactionText: str(d, "reaction"),
          manifestation: str(d, "manifestation") || null,
          startedOn: str(d, "started") || null,
          seriousness: d.getAll("seriousness").map(String),
          outcome: str(d, "outcome"),
          actionTaken: str(d, "action"),
          rechallenge: str(d, "rechallenge"),
          reporter: str(d, "reporter"),
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={F.kind} id="kind">
          <Pick id="kind" options={U.kinds} />
        </Field>
        <Field label={F.medicine} id="medicine">
          <Pick
            id="medicine"
            options={Object.fromEntries(medicines.map((m) => [m.id, m.name]))}
            blank="—"
          />
        </Field>
        <Field label={F.other} id="other">
          <Input id="other" name="other" maxLength={160} className={TARGET} />
        </Field>
        <DateField label={F.started} name="started" />
        <div className="sm:col-span-2">
          <Field label={F.reaction} id="reaction">
            <textarea
              id="reaction"
              name="reaction"
              required
              minLength={2}
              maxLength={2000}
              rows={3}
              className={SELECT}
            />
          </Field>
        </div>
        <Field label={F.manifestation} id="manifestation">
          <Pick id="manifestation" options={U.manifestations} blank="—" />
        </Field>
        <Field label={F.reporter} id="reporter">
          <Pick id="reporter" options={U.reporters} />
        </Field>
        <fieldset className="flex flex-col gap-1 sm:col-span-2">
          <legend className="text-body-s mb-1">{F.seriousness}</legend>
          {Object.entries(U.seriousness).map(([v, l]) => (
            <label key={v} className="text-body-s flex min-h-11 items-center gap-2">
              <input type="checkbox" name="seriousness" value={v} />
              {l}
            </label>
          ))}
        </fieldset>
        <Field label={F.outcome} id="outcome">
          <Pick id="outcome" options={U.outcomes} />
        </Field>
        <Field label={F.action} id="action">
          <Pick id="action" options={U.actions} />
        </Field>
        <Field label={F.rechallenge} id="rechallenge">
          <Pick id="rechallenge" options={U.rechallenges} />
        </Field>
      </div>
    </StoreDialog>
  );
}
