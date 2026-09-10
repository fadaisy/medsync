"use client";

import type { LabWorklistItem } from "@/lib/lab-tech/worklist";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { enterLabResultAction, rejectLabResultAction, releaseLabResultAction } from "../actions";

/**
 * Row actions for a worklist order: enter a result (value/unit/specimen),
 * then DELIBERATELY release it (entered ≠ released) or reject it (recollect).
 * Only rendered when the lab workflow is live. Decision-support / data-entry —
 * nothing is auto-entered; the critical flag (if any) is computed server-side.
 */
export function ResultRowActions({ item }: { item: LabWorklistItem }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "enter" | "reject">("idle");

  const [value, setValue] = useState(item.resultValue ?? "");
  const [unit, setUnit] = useState(item.resultUnit ?? "");
  const [specimenType, setSpecimenType] = useState("");
  const [specimenId, setSpecimenId] = useState("");
  const [refRange, setRefRange] = useState("");
  const [reason, setReason] = useState("");

  const entered = item.resultStatus === "entered";
  const rejected = item.resultStatus === "rejected";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setErr(r.error ?? "Action failed.");
      else {
        setMode("idle");
        router.refresh();
      }
    });
  }

  const save = () =>
    run(() =>
      enterLabResultAction({
        orderId: item.orderId,
        value: value.trim(),
        unit: unit.trim() || undefined,
        specimenType: specimenType.trim() || undefined,
        specimenId: specimenId.trim() || undefined,
        referenceRangeText: refRange.trim() || undefined,
        loincCode: item.loincCode ?? undefined,
      }),
    );
  const release = () =>
    item.resultId && run(() => releaseLabResultAction({ resultId: item.resultId! }));
  const doReject = () =>
    item.resultId &&
    run(() => rejectLabResultAction({ resultId: item.resultId!, reason: reason.trim() }));

  const btn =
    "tap rounded-md px-2 py-1 text-[11.5px] font-medium disabled:opacity-50 transition-colors";

  return (
    <div className="flex flex-col items-end gap-1.5">
      {/* Current entered value + release/reject */}
      {entered ? (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            entered: {item.resultValue}
            {item.resultUnit ? ` ${item.resultUnit}` : ""} · not released
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={release}
            className={`${btn} bg-brand-600 hover:bg-brand-700 text-white`}
          >
            Release
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setMode(mode === "reject" ? "idle" : "reject")}
            className={`${btn} border-border text-muted-foreground hover:text-foreground border`}
          >
            Reject
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setMode(mode === "enter" ? "idle" : "enter")}
            className={`${btn} text-muted-foreground hover:text-foreground`}
          >
            Edit
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-1.5">
          {rejected ? (
            <span className="text-muted-foreground rounded bg-red-50 px-1.5 py-0.5 text-[10.5px] text-red-700 dark:bg-red-950/30 dark:text-red-300">
              rejected — recollect
            </span>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={() => setMode(mode === "enter" ? "idle" : "enter")}
            className={`${btn} bg-brand-600 hover:bg-brand-700 text-white`}
          >
            {rejected ? "Re-enter" : "Enter result"}
          </button>
        </div>
      )}

      {/* Reject reason */}
      {mode === "reject" ? (
        <div className="flex items-center gap-1.5">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (e.g. haemolysed — recollect)"
            className="border-border bg-background w-56 rounded-md border px-2 py-1 text-[11.5px] outline-none"
          />
          <button
            type="button"
            disabled={pending || reason.trim().length < 3}
            onClick={doReject}
            className={`${btn} bg-red-600 text-white hover:bg-red-700`}
          >
            Confirm reject
          </button>
        </div>
      ) : null}

      {/* Entry form */}
      {mode === "enter" ? (
        <div className="border-border bg-muted/20 flex flex-col gap-1.5 rounded-lg border p-2">
          <div className="flex flex-wrap gap-1.5">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Value*"
              className="border-border bg-background w-24 rounded-md border px-2 py-1 text-[11.5px] outline-none"
            />
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Unit"
              className="border-border bg-background w-20 rounded-md border px-2 py-1 text-[11.5px] outline-none"
            />
            <input
              value={refRange}
              onChange={(e) => setRefRange(e.target.value)}
              placeholder="Reference range"
              className="border-border bg-background w-32 rounded-md border px-2 py-1 text-[11.5px] outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <input
              value={specimenType}
              onChange={(e) => setSpecimenType(e.target.value)}
              placeholder="Specimen type"
              className="border-border bg-background w-28 rounded-md border px-2 py-1 text-[11.5px] outline-none"
            />
            <input
              value={specimenId}
              onChange={(e) => setSpecimenId(e.target.value)}
              placeholder="Specimen ID"
              className="border-border bg-background w-28 rounded-md border px-2 py-1 text-[11.5px] outline-none"
            />
            <button
              type="button"
              disabled={pending || value.trim().length < 1}
              onClick={save}
              className={`${btn} bg-brand-600 hover:bg-brand-700 text-white`}
            >
              {entered ? "Save" : "Enter (unreleased)"}
            </button>
          </div>
        </div>
      ) : null}

      {err ? (
        <span className="text-[10.5px] text-red-600 dark:text-red-400" role="alert">
          {err}
        </span>
      ) : null}
    </div>
  );
}
