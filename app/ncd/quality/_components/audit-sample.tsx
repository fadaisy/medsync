"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Seg } from "../../visit/[visitId]/_components/controls";
import { fmtDate } from "../../_components/kit";
import { drawSampleAction, recordAgreementAction } from "../actions";

type Row = { id: string; personId: string; visitDate: string; name: string; registryNumber: string; fields: Record<string, boolean> | null };
type Field = { key: string; label: string };

/** G4: the month's audit sample, the field-level check of each sampled visit, and the agreement rate. */
export function AuditSample({
  month,
  monthLabel,
  seed,
  canCheck,
  fields,
  agreement,
  rows,
}: {
  month: string;
  monthLabel: string;
  seed: string;
  canCheck: boolean;
  fields: Field[];
  agreement: { agree: number; checked: number; rate: number | null };
  rows: Row[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const draw = () =>
    start(async () => {
      const r = await drawSampleAction(month);
      setMsg(r.ok ? `${r.value.sampled} of ${r.value.visits} visits sampled.` : r.message);
    });
  return (
    <section aria-labelledby="audit-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="audit-h" className="text-heading-s font-medium">
            Audit sample · {monthLabel}
          </h2>
          <p className="text-caption text-muted-foreground">
            5% of the month&apos;s closed visits, at least 10, drawn from the seed <span className="font-mono">{seed}</span>. The same seed always draws the same visits.
          </p>
        </div>
        <label className="ml-auto flex flex-col gap-1">
          <span className="text-label">Month</span>
          <input type="month" value={month} onChange={(e) => e.target.value && router.push(`/ncd/quality?month=${e.target.value}`)} className="border-input h-9 rounded-lg border bg-transparent px-2 text-[14px]" />
        </label>
        {canCheck ? (
          <Button variant="secondary" disabled={pending} onClick={draw}>
            {rows.length ? "Redraw (same visits)" : "Draw the sample"}
          </Button>
        ) : null}
      </div>
      <p className="text-body-s">
        Agreement with the source:{" "}
        <span className="font-mono tabular-nums">
          {agreement.rate == null ? "not checked yet" : `${Math.round(agreement.rate * 100)}% (${agreement.agree} of ${agreement.checked} fields)`}
        </span>
      </p>
      {msg ? (
        <p role="status" className="text-body-s">
          {msg}
        </p>
      ) : null}
      {rows.length ? (
        <ul className="border-border divide-border divide-y border-y">
          {rows.map((r) => (
            <SampleRow key={r.id} row={r} fields={fields} canCheck={canCheck} />
          ))}
        </ul>
      ) : (
        <p className="text-body-s text-muted-foreground">No sample drawn for this month.</p>
      )}
    </section>
  );
}

function SampleRow({ row, fields, canCheck }: { row: Row; fields: Field[]; canCheck: boolean }) {
  const [values, setValues] = useState<Record<string, boolean>>(row.fields ?? {});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await recordAgreementAction({ sampleId: row.id, fields: values });
      setMsg(r.ok ? "Saved." : r.message);
    });
  return (
    <li className="flex flex-col gap-3 px-1 py-3">
      <div className="flex flex-wrap items-center gap-x-4">
        <span className="font-medium">{row.name}</span>
        <span className="text-caption text-muted-foreground font-mono">{row.registryNumber}</span>
        <span className="text-caption text-muted-foreground">Visit {fmtDate(row.visitDate)}</span>
        <span className="text-caption text-ink-700 ml-auto">{row.fields ? "Checked" : "Not checked"}</span>
      </div>
      {canCheck ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <Seg
                key={f.key}
                label={`${f.label} (${row.registryNumber})`}
                value={f.key in values ? (values[f.key] ? "yes" : "no") : null}
                onChange={(v) => setValues((s) => ({ ...s, [f.key]: v === "yes" }))}
                options={[
                  ["yes", `${f.label}: agrees`],
                  ["no", `${f.label}: differs`],
                ]}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="secondary" disabled={pending || !Object.keys(values).length} onClick={save}>
              Save check
            </Button>
            {msg ? (
              <span role="status" className="text-caption">
                {msg}
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </li>
  );
}
