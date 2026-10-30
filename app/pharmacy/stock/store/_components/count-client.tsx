"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { LabButton } from "@/components/tide/work/button";
import { DialogTitle } from "@/components/ui/dialog";
import { COUNT } from "@/content/pharmacy-rework-daily";
import { fill } from "@/content/pharmacy-workspace-v2";
import { FEWER, MORE } from "@/lib/pharmacy/derive/count";
import { cn } from "@/lib/utils";
import {
  approveCount,
  saveCountLine,
  sendCountBack,
  sendCountForApproval,
  startCount,
} from "../count-actions";

const T = COUNT;

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (
    fn: () => Promise<{ ok: boolean; error?: string; id?: string }>,
    then?: (id?: string) => void,
  ) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? null);
      if (then) then(r.id);
      else router.refresh();
    });
  return { pending, error, run, router };
}

const Err = ({ error }: { error: string | null }) =>
  error ? (
    <p role="alert" className="text-body-s text-foreground font-semibold">
      {error}
    </p>
  ) : null;

export function StartCount({
  places,
  today,
}: {
  places: { id: string; name: string }[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const { pending, error, run, router } = useAct();
  return (
    <>
      <LabButton variant="primary" onClick={() => setOpen(true)}>
        {T.start}
      </LabButton>
      <EditorDialog open={open} onOpenChange={setOpen} width="medium">
        <div className="flex flex-col gap-3 px-6 py-5">
          <DialogTitle>{T.startTitle}</DialogTitle>
          <p className="text-body-s text-ink-600">{T.where}</p>
          <div className="flex flex-wrap gap-2">
            {places.map((p) => (
              <LabButton
                key={p.id}
                variant="secondary"
                busy={pending}
                onClick={() =>
                  run(
                    () =>
                      startCount({
                        clientKey: crypto.randomUUID(),
                        locationId: p.id,
                        label: fill(T.label, { place: p.name, date: today }),
                      }),
                    (id) => router.push(`/pharmacy/stock/store?tab=count&count=${id}`),
                  )
                }
              >
                {p.name}
              </LabButton>
            ))}
          </div>
          <Err error={error} />
        </div>
      </EditorDialog>
    </>
  );
}

interface Line {
  batchId: string;
  packSize: number;
  countedPacks: number | null;
  countedUnits: number | null;
  reason: string | null;
  product: string;
  unit: string;
  batchNumber: string;
  expiry: string;
}

function Stepper({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number | null;
  onChange: (n: number) => void;
  disabled: boolean;
}) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <span className="text-body-s text-ink-600 me-1">{label}</span>
      <button
        type="button"
        disabled={disabled || v === 0}
        onClick={() => onChange(v - 1)}
        className="bg-tide-sunken size-11 rounded-full text-[18px] disabled:opacity-40"
        aria-label={`${label} −1`}
      >
        −
      </button>
      <input
        inputMode="numeric"
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ""));
          if (Number.isFinite(n)) onChange(n);
        }}
        className="bg-card h-11 w-16 rounded-[10px] text-center tabular-nums shadow-[inset_0_0_0_1px_var(--color-ink-300)]"
        aria-label={label}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(v + 1)}
        className="bg-tide-sunken size-11 rounded-full text-[18px] disabled:opacity-40"
        aria-label={`${label} +1`}
      >
        +
      </button>
    </div>
  );
}

/** One batch: packs and loose units, saved as you type (resumable). Blind: no record shown. */
export function CountLine({
  sheetId,
  line,
  editable,
}: {
  sheetId: string;
  line: Line;
  editable: boolean;
}) {
  const [packs, setPacks] = useState(line.countedPacks);
  const [units, setUnits] = useState(line.countedUnits);
  const [state, setState] = useState<"idle" | "saved" | string>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = (p: number | null, u: number | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await saveCountLine({
        sheetId,
        batchId: line.batchId,
        packSize: line.packSize,
        countedPacks: p,
        countedUnits: u,
        reason: line.reason,
      });
      setState(r.ok ? "saved" : (r.error ?? ""));
    }, 400);
  };
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="font-semibold">{line.product}</div>
        <div className="text-body-s text-ink-600">
          {line.batchNumber} · {fill(T.expires, { date: line.expiry })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {line.packSize > 1 ? (
          <Stepper
            label={fill(T.packs, { n: line.packSize })}
            value={packs}
            disabled={!editable}
            onChange={(n) => {
              setPacks(n);
              save(n, units);
            }}
          />
        ) : null}
        <Stepper
          label={fill(T.loose, { unit: line.unit })}
          value={units}
          disabled={!editable}
          onChange={(n) => {
            setUnits(n);
            save(packs, n);
          }}
        />
        <span aria-live="polite" className="text-body-s text-ink-600 min-w-12">
          {state === "idle" ? "" : state === "saved" ? T.saved : state}
        </span>
      </div>
    </li>
  );
}

/** Once every line is counted: a reason chip per difference, by direction. */
export function DiffReasons({
  sheetId,
  lines,
  diffs,
}: {
  sheetId: string;
  lines: Line[];
  diffs: {
    batchId: string;
    counted: number;
    recorded: number;
    diff: number;
    reason: string | null;
  }[];
}) {
  const { pending, error, run } = useAct();
  return (
    <section
      className="bg-card shadow-tide-card flex flex-col gap-3 rounded-[18px] p-4"
      aria-labelledby="count-diffs"
    >
      <h2 id="count-diffs" className="text-heading-s">
        {T.diffsTitle}
      </h2>
      <p className="text-body-s text-ink-600">{T.diffsLead}</p>
      {diffs.map((d) => {
        const l = lines.find((x) => x.batchId === d.batchId)!;
        return (
          <div key={d.batchId} className="flex flex-col gap-2">
            <div>
              <span className="font-semibold">{l.product}</span>{" "}
              <span className="text-body-s text-ink-600">
                {l.batchNumber} · {fill(T.diff, { counted: d.counted, recorded: d.recorded })}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(d.diff < 0 ? FEWER : MORE).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={d.reason === r}
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      saveCountLine({
                        sheetId,
                        batchId: l.batchId,
                        packSize: l.packSize,
                        countedPacks: l.countedPacks,
                        countedUnits: l.countedUnits,
                        reason: r,
                      }),
                    )
                  }
                  className={cn(
                    "min-h-11 rounded-full px-3.5 text-[13.5px] font-medium",
                    d.reason === r
                      ? "bg-primary text-primary-foreground"
                      : "bg-tide-sunken text-ink-800",
                  )}
                >
                  {T.reasons[r]}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <Err error={error} />
    </section>
  );
}

export function SheetActions({
  sheetId,
  status,
  blockers,
  mayApprove,
}: {
  sheetId: string;
  status: string;
  blockers: { uncounted: number; unexplained: number };
  mayApprove: boolean;
}) {
  const { pending, error, run } = useAct();
  return (
    <div className="flex flex-col gap-2">
      {status === "counting" ? (
        <div>
          <LabButton
            variant="primary"
            busy={pending}
            disabledReason={
              blockers.uncounted
                ? fill(T.sendBlocked, { n: blockers.uncounted })
                : blockers.unexplained
                  ? fill(T.explainBlocked, { n: blockers.unexplained })
                  : null
            }
            onClick={() => run(() => sendCountForApproval({ sheetId }))}
          >
            {T.send}
          </LabButton>
        </div>
      ) : status === "approval" ? (
        <>
          <p className="text-body-s text-ink-700">{T.waiting}</p>
          {mayApprove ? (
            <div className="flex flex-wrap gap-2">
              <LabButton
                variant="primary"
                busy={pending}
                onClick={() => run(() => approveCount({ sheetId }))}
              >
                {T.approve}
              </LabButton>
              <LabButton
                variant="secondary"
                busy={pending}
                onClick={() => run(() => sendCountBack({ sheetId }))}
              >
                {T.sendBack}
              </LabButton>
            </div>
          ) : null}
        </>
      ) : status === "done" ? (
        <p className="text-body-s text-ink-700">{T.approved}</p>
      ) : null}
      <Err error={error} />
    </div>
  );
}
