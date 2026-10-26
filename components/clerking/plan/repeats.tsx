"use client";

import type { RepeatsPayload, RepeatTerms } from "@/lib/clerking/plan/payload";
import type { PlanRxRepeats } from "@/lib/prescribing/plan-rx";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { NETWORK_B, PHARMACY_NETWORK_COPY } from "@/content/pharmacy-network";
import { stopRepeats } from "@/lib/emr/actions/repeats";
import { addDays } from "@/lib/pharmacy/stores/ledger";
import { longDate } from "@/lib/prescribing/repeats";
import { cn } from "@/lib/utils";
import { DraftLabel, inputClass, Tag, Toggle } from "./parts";

/**
 * Pharmacy Phase 4, 5.2: the Repeats step for one line, after the checks. Every figure is typed by the prescriber;
 * the system computes no quantity and no date. Shown only where the signed repeat list allows the medicine.
 */

export interface RepeatsDraft {
  on: boolean;
  n: string;
  d: string;
  notAfter: string;
  reviewBy: string;
}
export const NO_REPEATS: RepeatsDraft = { on: false, n: "", d: "", notAfter: "", reviewBy: "" };

type Bounds = NonNullable<RepeatsPayload["bounds"]>;

const whole = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : NaN);

/** Day / month / year boxes (no calendar, as onboarding's): the draft keeps "y-m-d" as typed; `iso` reads it. */
const parts = (v: string) =>
  v.split("-").concat("", "", "").slice(0, 3) as [string, string, string];
export function iso(v: string): string | null {
  const [y, m, d] = parts(v).map(whole);
  if (!(y! >= 2000 && m! >= 1 && m! <= 12 && d! >= 1 && d! <= 31)) return null;
  const out = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return new Date(`${out}T00:00:00Z`).toISOString().slice(0, 10) === out ? out : null;
}
function DateBoxes({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [y, m, d] = parts(value);
  const set = (i: 0 | 1 | 2, x: string) => {
    const next = [y, m, d];
    next[i] = x.replace(/\D/g, "");
    onChange(next.join("-"));
  };
  const box = (i: 0 | 1 | 2, label: string, v: string, max: number, w: string) => (
    <input
      id={i === 2 ? id : `${id}-${i}`}
      aria-label={label}
      placeholder={label}
      inputMode="numeric"
      maxLength={max}
      value={v}
      onChange={(e) => set(i, e.target.value)}
      className={cn(inputClass, w, "text-center tabular-nums")}
    />
  );
  return (
    <span className="flex gap-2">
      {box(2, "Day", d, 2, "w-16")}
      {box(1, "Month", m, 2, "w-16")}
      {box(0, "Year", y, 4, "w-24")}
    </span>
  );
}

/** The typed terms, or why they cannot be added; null when repeats are off. Mirrors RP-2 (the server re-checks). */
export function readRepeats(
  r: RepeatsDraft,
  b: Bounds,
  today: string,
): { terms: PlanRxRepeats | null; error: string | null } {
  if (!r.on) return { terms: null, error: null };
  const n = whole(r.n);
  const d = whole(r.d);
  if (!(n >= 1 && n <= b.maxSupplies))
    return { terms: null, error: `Further supplies: 1 to ${b.maxSupplies}.` };
  if (!(d >= b.minIntervalDays))
    return { terms: null, error: `Days apart: at least ${b.minIntervalDays}.` };
  const last = addDays(today, b.maxPeriodDays);
  const notAfter = iso(r.notAfter);
  if (!notAfter || notAfter <= today || notAfter > last)
    return { terms: null, error: `Not after: a date after today, up to ${longDate(last)}.` };
  const typedReview = r.reviewBy.replace(/-/g, "") !== "";
  const reviewBy = typedReview ? iso(r.reviewBy) : null;
  if (typedReview && (!reviewBy || reviewBy < today || reviewBy > notAfter))
    return { terms: null, error: "Review by: a date from today to the last repeat date." };
  return {
    terms: {
      furtherSupplies: n,
      minIntervalDays: d,
      notAfter,
      reviewBy,
    },
    error: null,
  };
}

export function RepeatsField({
  bounds,
  today,
  value,
  onChange,
}: {
  bounds: Bounds;
  today: string;
  value: RepeatsDraft;
  onChange: (r: RepeatsDraft) => void;
}) {
  const ids = { n: useId(), d: useId(), notAfter: useId(), reviewBy: useId() };
  const { terms, error } = readRepeats(value, bounds, today);
  const set = (p: Partial<RepeatsDraft>) => onChange({ ...value, ...p });
  const field = (id: string, label: string, input: React.ReactNode) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-caption text-muted-foreground">
        {label}
      </label>
      {input}
    </div>
  );
  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Repeats">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-muted-foreground">Repeats</span>
        <Toggle on={value.on} onPress={() => set({ on: !value.on })}>
          {value.on ? "Repeats on" : "No repeats"}
        </Toggle>
        {PHARMACY_NETWORK_COPY.status === "draft" ? (
          <DraftLabel>Wording not signed</DraftLabel>
        ) : null}
      </div>
      {value.on ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {field(
            ids.n,
            `Further supplies (up to ${bounds.maxSupplies})`,
            <input
              id={ids.n}
              inputMode="numeric"
              value={value.n}
              onChange={(e) => set({ n: e.target.value })}
              className={inputClass}
            />,
          )}
          {field(
            ids.d,
            `At least … days apart (at least ${bounds.minIntervalDays})`,
            <input
              id={ids.d}
              inputMode="numeric"
              value={value.d}
              onChange={(e) => set({ d: e.target.value })}
              className={inputClass}
            />,
          )}
          {field(
            ids.notAfter,
            "Not after",
            <DateBoxes
              id={ids.notAfter}
              value={value.notAfter}
              onChange={(notAfter) => set({ notAfter })}
            />,
          )}
          {field(
            ids.reviewBy,
            "Review by (optional)",
            <DateBoxes
              id={ids.reviewBy}
              value={value.reviewBy}
              onChange={(reviewBy) => set({ reviewBy })}
            />,
          )}
        </div>
      ) : null}
      {terms ? (
        <p className="text-body-s text-foreground">
          {NETWORK_B.repeatsStep(
            terms.furtherSupplies,
            terms.minIntervalDays,
            longDate(terms.notAfter),
          )}
        </p>
      ) : error ? (
        <p className="text-body-s text-muted-foreground">{error}</p>
      ) : null}
    </div>
  );
}

/** 5.2: a placed line's repeats on the problem card, with Stop (a prescriber, with a reason). */
export function RepeatsLine({
  terms,
  who,
  prescriptionId,
  canWrite,
}: {
  terms: RepeatTerms;
  who: NonNullable<RepeatsPayload["who"]>;
  prescriptionId: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const reasonId = useId();
  if (terms.stopped)
    return (
      <Tag>
        {NETWORK_B.repeatsStopped(
          terms.stopped.cadre ?? "a prescriber",
          longDate(terms.stopped.on),
        )}
      </Tag>
    );
  if (terms.ended) return <Tag>Repeats ended with the line</Tag>;
  const stop = () =>
    start(async () => {
      const r = await stopRepeats({ ...who, prescriptionId, reason });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      router.refresh();
    });
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Tag>{`Repeats: ${terms.furtherSupplies}, ${terms.minIntervalDays} days apart, until ${longDate(terms.notAfter)}`}</Tag>
      {canWrite ? (
        <EditorDialog
          width="medium"
          open={open}
          onOpenChange={setOpen}
          trigger={
            <DialogTrigger render={<Button size="sm" variant="ghost" />}>
              Stop repeats
            </DialogTrigger>
          }
        >
          <SheetHeader>
            <SheetTitle>Stop the repeats</SheetTitle>
            <SheetDescription>
              No further supply is made against these repeats. The line itself is not changed.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-2">
            <label htmlFor={reasonId} className="text-caption text-muted-foreground">
              Why the repeats stop
            </label>
            <textarea
              id={reasonId}
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              className={cn(inputClass, "min-h-20 py-2")}
            />
            {error ? (
              <p role="status" className="text-body-s">
                {error}
              </p>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={pending || reason.trim().length < 2} onClick={stop}>
              Stop repeats
            </Button>
          </SheetFooter>
        </EditorDialog>
      ) : null}
    </span>
  );
}
