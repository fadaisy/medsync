"use client";

import type { FluidKind } from "@/lib/emr/charts/fluids";
import type { FluidEntryView } from "@/lib/emr/charts/payload";
import type { FluidErrorReason, RouteDetail } from "@/lib/emr/write/fluid-balance";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { createIntentKeys, UNKNOWN_OUTCOME } from "@/components/emr/desk/flows";
import { EmrDialog } from "@/components/emr/emr-dialog";
import { StatusWord } from "@/components/emr/status-word";
import { Tag } from "@/components/medsync/tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { correctFluidEntry, recordFluidEntry } from "@/lib/emr/actions/fluid-balance";
import { formatClock, formatHourSpan } from "@/lib/emr/charts/scale";
import { cn } from "@/lib/utils";

/**
 * The nurse's fluid balance entry (ADR 0189 §8): what it is (IV in, oral in, urine out, other
 * out), the volume in mL or urine "Not measured", when it went in or out (now by default; the
 * hour it counts in is shown), and for IV in the prescription it ran from. Below, the entries that
 * stand, each with Correct and Entered in error: both write a new row, the old one is kept.
 * One client key per intent, so a retried tap replays and never records twice.
 */

const KIND_WORD: Record<FluidKind, string> = {
  iv_in: "IV in",
  oral_in: "Oral in",
  urine_out: "Urine out",
  other_out: "Other out",
};
const KINDS = Object.keys(KIND_WORD) as FluidKind[];
const ROUTES: Partial<Record<FluidKind, { id: RouteDetail; word: string }[]>> = {
  oral_in: [
    { id: "oral", word: "Oral" },
    { id: "ng", word: "NG tube" },
  ],
  other_out: [
    { id: "vomit", word: "Vomit" },
    { id: "drain", word: "Drain" },
    { id: "stool", word: "Stool" },
    { id: "other", word: "Other" },
  ],
};
const ROUTE_WORD: Record<string, string> = Object.fromEntries(
  Object.values(ROUTES).flatMap((rs) => rs.map((r) => [r.id, r.word])),
);
const ERROR_REASONS: { id: FluidErrorReason; word: string }[] = [
  { id: "wrong_patient", word: "Wrong patient" },
  { id: "duplicate", word: "Recorded twice" },
  { id: "wrong_kind", word: "Wrong kind of entry" },
  { id: "other", word: "Other" },
];

/** "36,5" and "36.5" are the same number; blank is not a number. */
function parseMl(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** The latest moment at or before now whose clock reads `hhmm` (so 23:30 typed at 00:10 is last night). */
function atClock(hhmm: string, now: Date): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const [h, min] = formatClock(now).split(":").map(Number);
  let back = h! * 60 + min! - (Number(m[1]) * 60 + Number(m[2]));
  if (back < 0) back += 24 * 60;
  const t = now.getTime() - (now.getTime() % 60000) - back * 60000;
  return new Date(t);
}

/** The start of the hour (or 4-hour block) a time counts in, for the words under the time field. */
function blockStart(at: Date, stepHours: 1 | 4): Date {
  const [h, m] = formatClock(at).split(":").map(Number);
  const back = ((h! % stepHours) * 60 + m!) * 60000;
  return new Date(at.getTime() - (at.getTime() % 60000) - back);
}

const CHIP =
  "text-body-s inline-flex min-h-11 items-center rounded-full border px-3 sm:min-h-8 outline-none focus-visible:shadow-focus transition-[background-color,border-color,color] duration-100 ease-expo-out";
const chipState = (on: boolean) =>
  on
    ? "border-teal-600 bg-teal-50 text-teal-800"
    : "border-border text-foreground bg-card hover:bg-ink-50";

function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; word: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(CHIP, chipState(value === o.id))}
        >
          {o.word}
        </button>
      ))}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="text-body-s grid gap-x-4 gap-y-1 sm:grid-cols-[8rem_1fr] sm:items-start">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-muted-foreground sm:pt-1.5">
          {label}
        </label>
      ) : (
        <span className="text-muted-foreground sm:pt-1.5">{label}</span>
      )}
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
    </div>
  );
}

type Message = { ok: boolean; text: string } | null;

function MessageLine({ message }: { message: Message }) {
  return (
    <span role="status" aria-live="polite" className="text-body-s">
      {message ? (
        message.ok ? (
          message.text
        ) : (
          <StatusWord tone="caution">{message.text}</StatusWord>
        )
      ) : null}
    </span>
  );
}

export function FluidBalanceEntry({
  patientUserId,
  encounterId,
  ivLines,
  entries,
  stepHours,
}: {
  patientUserId: string;
  encounterId: string;
  /** This visit's IV fluids (the prescriptions an IV in may name). */
  ivLines: readonly { key: string; label: string }[];
  /** The entries that stand, newest first (from the fluid balance payload). */
  entries: readonly FluidEntryView[];
  stepHours: 1 | 4;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const keys = useMemo(() => createIntentKeys(() => crypto.randomUUID()), []);
  const [kind, setKind] = useState<FluidKind | null>(null);
  const [volume, setVolume] = useState("");
  const [notMeasured, setNotMeasured] = useState(false);
  const [time, setTime] = useState(() => formatClock(new Date()));
  const [prescriptionId, setPrescriptionId] = useState<string | null>(
    ivLines.length === 1 ? ivLines[0]!.key : null,
  );
  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [editing, setEditing] = useState<{
    entry: FluidEntryView;
    mode: "correct" | "error";
  } | null>(null);

  const at = atClock(time, new Date());
  const ml = parseMl(volume);
  const urineNotMeasured = kind === "urine_out" && notMeasured;
  const issue = !kind
    ? "Choose what the entry is."
    : !urineNotMeasured && ml === null
      ? "Enter the volume in mL."
      : !at
        ? "Enter the time as HH:MM."
        : null;
  const rxWord = new Map(ivLines.map((l) => [l.key, l.label]));

  const save = () =>
    start(async () => {
      if (issue || !kind || !at)
        return setMessage({ ok: false, text: issue ?? "Check the entry." });
      const draft = {
        kind,
        volumeMl: urineNotMeasured ? null : ml,
        measured: !urineNotMeasured,
        effectiveAt: at.toISOString(),
        prescriptionId: kind === "iv_in" ? prescriptionId : null,
        routeDetail: ROUTES[kind] ? route : null,
      };
      let r: Awaited<ReturnType<typeof recordFluidEntry>>;
      try {
        r = await keys.run(`record:${JSON.stringify(draft)}`, (clientKey) =>
          recordFluidEntry({ surface: "nurse", patientUserId, encounterId, clientKey, ...draft }),
        );
      } catch {
        return setMessage({ ok: false, text: UNKNOWN_OUTCOME });
      }
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setMessage({ ok: true, text: `${KIND_WORD[kind]} recorded.` });
      setVolume("");
      setNotMeasured(false);
      setTime(formatClock(new Date()));
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="fluid-entry-heading"
        className="border-border bg-card shadow-card flex flex-col gap-4 rounded-lg border p-4"
      >
        <h3 id="fluid-entry-heading" className="text-heading-s text-foreground">
          Record fluid in or out
        </h3>
        <Field label="What">
          <Chips
            label="What the entry is"
            options={KINDS.map((k) => ({ id: k, word: KIND_WORD[k] }))}
            value={kind}
            onChange={(k) => {
              setKind(k);
              setRoute(null);
              if (k !== "urine_out") setNotMeasured(false);
            }}
          />
        </Field>
        {kind && ROUTES[kind] ? (
          <Field label={kind === "oral_in" ? "Route" : "Kind of loss"}>
            <Chips
              label={kind === "oral_in" ? "Route" : "Kind of loss"}
              options={ROUTES[kind]!}
              value={route}
              onChange={setRoute}
            />
          </Field>
        ) : null}
        {kind === "iv_in" ? (
          <Field label="Prescription">
            <Chips
              label="The IV fluid it ran from"
              options={[
                ...ivLines.map((l) => ({ id: l.key, word: l.label })),
                { id: "none", word: "None named" },
              ]}
              value={prescriptionId ?? "none"}
              onChange={(v) => setPrescriptionId(v === "none" ? null : v)}
            />
          </Field>
        ) : null}
        <Field label="Volume (mL)" htmlFor="fluid-volume">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              id="fluid-volume"
              inputMode="decimal"
              autoComplete="off"
              value={volume}
              disabled={urineNotMeasured}
              onChange={(e) => setVolume(e.target.value)}
              className="w-32 font-mono"
              aria-describedby={kind === "urine_out" ? "fluid-nm-hint" : undefined}
            />
            {kind === "urine_out" ? (
              <label className="text-body-s inline-flex min-h-11 items-center gap-2 sm:min-h-8">
                <input
                  type="checkbox"
                  checked={notMeasured}
                  onChange={(e) => {
                    setNotMeasured(e.target.checked);
                    if (e.target.checked) setVolume("");
                  }}
                  className="size-4 accent-teal-600"
                />
                Not measured
              </label>
            ) : null}
          </div>
          {kind === "urine_out" ? (
            <span id="fluid-nm-hint" className="text-caption text-muted-foreground">
              Not measured is recorded as such, never as 0 mL.
            </span>
          ) : null}
        </Field>
        <Field label="Time" htmlFor="fluid-time">
          <Input
            id="fluid-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-32 font-mono"
            aria-describedby="fluid-time-hint"
          />
          <span id="fluid-time-hint" className="text-caption text-muted-foreground">
            {at
              ? `Counts in ${formatHourSpan(blockStart(at, stepHours), stepHours)}.`
              : "HH:MM, 24-hour."}
          </span>
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={pending} className="min-h-11 sm:min-h-8">
            {pending ? "Saving…" : "Record entry"}
          </Button>
          <MessageLine message={message} />
        </div>
      </section>

      <section aria-labelledby="fluid-entries-heading" className="flex flex-col gap-2">
        <h3 id="fluid-entries-heading" className="text-heading-s text-foreground">
          Entries
        </h3>
        {entries.length === 0 ? (
          <p className="text-body-s text-muted-foreground">No entries yet.</p>
        ) : (
          <ul className="border-border divide-ink-150 divide-y rounded-lg border">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="text-body-s flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-muted-foreground font-mono tabular-nums">
                    {formatClock(e.effectiveAt)}
                  </span>
                  <span className="text-foreground">
                    {KIND_WORD[e.kind]}
                    {e.routeDetail ? ` (${ROUTE_WORD[e.routeDetail] ?? e.routeDetail})` : ""}
                  </span>
                  <span className="font-mono tabular-nums">
                    {e.measured && e.volumeMl !== null ? `${e.volumeMl} mL` : "Not measured"}
                  </span>
                  {e.prescriptionId && rxWord.get(e.prescriptionId) ? (
                    <span className="text-caption text-muted-foreground">
                      {rxWord.get(e.prescriptionId)}
                    </span>
                  ) : null}
                  {e.corrects ? <Tag hue="slate">Corrected</Tag> : null}
                </span>
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing({ entry: e, mode: "correct" })}
                  >
                    Correct
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing({ entry: e, mode: "error" })}
                  >
                    Entered in error
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <EmrDialog
        open={editing !== null}
        onOpenChange={(open) => (open ? null : setEditing(null))}
        title={editing?.mode === "error" ? "Entered in error" : "Correct the entry"}
        description={
          editing
            ? `${KIND_WORD[editing.entry.kind]} at ${formatClock(editing.entry.effectiveAt)}. The entry is kept and marked; the chart counts the new one.`
            : undefined
        }
      >
        {editing ? (
          <EditEntry
            key={`${editing.entry.id}:${editing.mode}`}
            entry={editing.entry}
            mode={editing.mode}
            patientUserId={patientUserId}
            onDone={() => {
              setEditing(null);
              setMessage({ ok: true, text: "Entry updated." });
              router.refresh();
            }}
          />
        ) : null}
      </EmrDialog>
    </div>
  );
}

function EditEntry({
  entry,
  mode,
  patientUserId,
  onDone,
}: {
  entry: FluidEntryView;
  mode: "correct" | "error";
  patientUserId: string;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const keys = useMemo(() => createIntentKeys(() => crypto.randomUUID()), []);
  const [volume, setVolume] = useState(entry.volumeMl === null ? "" : String(entry.volumeMl));
  const [notMeasured, setNotMeasured] = useState(!entry.measured);
  const [time, setTime] = useState(formatClock(entry.effectiveAt));
  const [reason, setReason] = useState<FluidErrorReason | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const urine = entry.kind === "urine_out";
  const ml = parseMl(volume);
  // The corrected time is the latest moment at or before the entry's recording with that clock.
  const at = atClock(time, new Date(entry.recordedAt));

  const save = () =>
    start(async () => {
      const draft =
        mode === "error"
          ? reason
            ? { enteredInError: true as const, reasonCode: reason }
            : null
          : (urine && notMeasured) || ml !== null
            ? {
                enteredInError: false as const,
                volumeMl: urine && notMeasured ? null : ml,
                measured: !(urine && notMeasured),
                effectiveAt: at?.toISOString(),
              }
            : null;
      if (!draft)
        return setMessage({
          ok: false,
          text: mode === "error" ? "Choose why the entry was in error." : "Enter the volume in mL.",
        });
      let r: Awaited<ReturnType<typeof correctFluidEntry>>;
      try {
        r = await keys.run(`${mode}:${JSON.stringify(draft)}`, (clientKey) =>
          correctFluidEntry({
            surface: "nurse",
            patientUserId,
            entryId: entry.id,
            clientKey,
            ...draft,
          }),
        );
      } catch {
        return setMessage({ ok: false, text: UNKNOWN_OUTCOME });
      }
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      onDone();
    });

  return (
    <div className="flex flex-col gap-4">
      {mode === "error" ? (
        <Field label="Why">
          <Chips
            label="Why the entry was in error"
            options={ERROR_REASONS}
            value={reason}
            onChange={setReason}
          />
        </Field>
      ) : (
        <>
          <Field label="Volume (mL)" htmlFor="fluid-correct-volume">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                id="fluid-correct-volume"
                inputMode="decimal"
                autoComplete="off"
                value={volume}
                disabled={urine && notMeasured}
                onChange={(e) => setVolume(e.target.value)}
                className="w-32 font-mono"
              />
              {urine ? (
                <label className="text-body-s inline-flex min-h-11 items-center gap-2 sm:min-h-8">
                  <input
                    type="checkbox"
                    checked={notMeasured}
                    onChange={(e) => {
                      setNotMeasured(e.target.checked);
                      if (e.target.checked) setVolume("");
                    }}
                    className="size-4 accent-teal-600"
                  />
                  Not measured
                </label>
              ) : null}
            </div>
          </Field>
          <Field label="Time" htmlFor="fluid-correct-time">
            <Input
              id="fluid-correct-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-32 font-mono"
            />
          </Field>
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={pending} className="min-h-11 sm:min-h-8">
          {pending ? "Saving…" : mode === "error" ? "Mark as entered in error" : "Save correction"}
        </Button>
        <MessageLine message={message} />
      </div>
    </div>
  );
}
