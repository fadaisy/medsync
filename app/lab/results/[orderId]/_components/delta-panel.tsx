"use client";

import type { FlagRow } from "@/lib/lab/delta-read";
import { useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fill, LAB5 } from "@/content/lab-phase-5";
import { recordDeltaOutcomeAction } from "@/lib/lab/delta-actions";
import { inputClass, newKey, Pop, selectClass } from "../../../_components/pop";
import { Field, Said, useAct } from "../../../setup/criticals/_components/setup-forms";

/* Delta checks on result entry (Lab Phase 5 §5.6, artboard 6; DL-4..DL-7): each fired rule with both values, the
   change and the interval, the context recorded between them, and the technologist's decision. */

const OUTCOME_WORDS: Record<string, string> = {
  physiological_or_treatment: "Explained by the illness or its treatment",
  transfusion_or_dialysis: "Explained by a transfusion or dialysis",
  confirmed_same_patient: "Confirmed this patient's sample with the ward",
  contamination_suspected: "Contamination suspected",
  previous_specimen_suspect: "The previous specimen is the suspect one",
  recollect: "Hold and ask for a new sample",
  mislabel_confirmed: "Wrong sample confirmed (mislabel)",
};
const hours = (h: string | null) => {
  const n = Number(h ?? 0);
  return n >= 48 ? `${Math.round(n / 24)} days` : `${Math.round(n)} hours`;
};

export function DeltaPanel({
  flags,
  component,
}: {
  flags: FlagRow[];
  component: Record<string, string>;
}) {
  const open = flags.filter((f) => !f.outcome);
  if (!flags.length) return null;
  return (
    <section aria-label="Delta checks" className="flex flex-col gap-3">
      <div
        role={open.length ? "alert" : undefined}
        className="bg-status-caution-bg border-status-caution-fg text-body-s dark:text-status-caution-fg flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-amber-800"
      >
        <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <div className="flex flex-col gap-1">
          <p className="font-medium">
            {flags.length} {flags.length === 1 ? "delta check" : "delta checks"}
            {open.length ? ` · ${open.length} waiting for your decision` : " · all decided"}
          </p>
          <p>{LAB5.deltaNote}</p>
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {flags.map((f) => {
          const name = f.conceptId ? (component[f.conceptId] ?? f.conceptId) : "Several components";
          return (
            <li
              key={f.id}
              className="border-border bg-card text-body-s flex flex-col gap-2 rounded-lg border p-4"
            >
              <p className="font-medium">
                {f.kind === "delta"
                  ? fill(LAB5.deltaCheck, {
                      Component: name,
                      interval: hours(f.intervalHours),
                      meaning: f.meaning,
                    })
                  : `${f.kind === "panel" ? "Panel rule" : "Pattern rule"} ${f.ruleKey}: ${f.meaning}.`}
              </p>
              {f.kind === "delta" ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                  <dt className="text-muted-foreground">Previous</dt>
                  <dd className="font-mono tabular-nums">
                    {f.previousValue} {f.unit}
                  </dd>
                  <dt className="text-muted-foreground">Now</dt>
                  <dd className="font-mono tabular-nums">
                    {f.currentValue} {f.unit}
                  </dd>
                  <dt className="text-muted-foreground">Change</dt>
                  <dd className="font-mono tabular-nums">
                    {Number(f.changeAbs).toFixed(1)} {f.unit}
                    {f.changePct ? ` (${Number(f.changePct).toFixed(1)} %)` : ""}
                  </dd>
                  <dt className="text-muted-foreground">Between them</dt>
                  <dd>{hours(f.intervalHours)}</dd>
                </dl>
              ) : null}
              {f.context.length ? (
                <p>
                  Recorded between the two results: {f.context.length}{" "}
                  {f.context.length === 1 ? "procedure" : "procedures"}. The rule still fired.
                </p>
              ) : null}
              <p className="text-muted-foreground">
                Rule {f.ruleKey} v{f.ruleVersion}. Check the previous specimen too.
              </p>
              {f.outcome ? (
                <StatusWord>{`Decided: ${OUTCOME_WORDS[f.outcome.outcome]}`}</StatusWord>
              ) : (
                <DecideDialog flagId={f.id} name={name} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DecideDialog({ flagId, name }: { flagId: string; name: string }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ outcome: "", withWhom: "", note: "" });
  const [clientKey] = useState(newKey);
  return (
    <Pop
      label="Record your decision"
      sr={name}
      variant="primary"
      title={`Delta check: ${name}`}
      lede="What you checked is required. A new sample rejects this one; a confirmed mislabel opens a nonconformity."
      open={open}
      setOpen={setOpen}
      width="wide"
      action={
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const r = await recordDeltaOutcomeAction({
                flagId,
                outcome: f.outcome,
                withWhom: f.outcome === "confirmed_same_patient" ? f.withWhom || null : null,
                note: f.note,
                clientKey,
              });
              if (r.ok) setOpen(false);
              return r;
            }, "Recorded.")
          }
        >
          Record
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your decision">
          <select
            className={selectClass}
            value={f.outcome}
            onChange={(e) => setF({ ...f, outcome: e.target.value })}
          >
            <option value="">Choose</option>
            {Object.entries(OUTCOME_WORDS).map(([v, w]) => (
              <option key={v} value={v}>
                {w}
              </option>
            ))}
          </select>
        </Field>
        {f.outcome === "confirmed_same_patient" ? (
          <Field label="Confirmed with">
            <Input
              className={inputClass}
              value={f.withWhom}
              maxLength={120}
              onChange={(e) => setF({ ...f, withWhom: e.target.value })}
            />
          </Field>
        ) : null}
      </div>
      <Field label="What you checked">
        <Input
          className={inputClass}
          value={f.note}
          maxLength={1000}
          onChange={(e) => setF({ ...f, note: e.target.value })}
        />
      </Field>
      <Said message={message} />
    </Pop>
  );
}
