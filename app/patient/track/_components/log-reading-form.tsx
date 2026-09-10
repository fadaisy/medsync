"use client";

import type { LogReadingState } from "../actions";
import type { NumericReadingKind } from "@/lib/patient/self-tracking-constants";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NUMERIC_READING_KINDS,
  READING_KIND_HINT,
  READING_KIND_LABEL,
  READING_UNIT_OPTIONS,
} from "@/lib/patient/self-tracking-constants";
import { logReadingAction } from "../actions";

const ALL_KINDS = [
  "glucose",
  "bp",
  "weight",
  "spo2",
  "temperature",
  "symptom",
  "note",
  "other",
] as const;

type Kind = (typeof ALL_KINDS)[number];

export function LogReadingForm({
  defaultKind,
  suggestedKinds,
}: {
  defaultKind: Kind;
  suggestedKinds: ReadonlyArray<string>;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<LogReadingState, FormData>(
    logReadingAction,
    {} as LogReadingState,
  );
  const [, startTransition] = useTransition();

  const [kind, setKind] = useState<Kind>(defaultKind);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (state.ok) {
      // Land back on the hub; the new reading shows up in the list.
      router.push("/patient/track");
    }
  }, [state.ok, router]);

  const visibleKinds = showAll
    ? ALL_KINDS
    : Array.from(new Set([...suggestedKinds, "note"])).filter((k): k is Kind =>
        ALL_KINDS.includes(k as Kind),
      );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        // Pre-set kind into the form data; <select> isn't used so we
        // pipe it through a hidden input below — submit handler kept
        // as a safety net.
        startTransition(() => {});
        void e;
      }}
    >
      <input type="hidden" name="kind" value={kind} />

      {/* Kind picker — chip grid */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
          What are you logging?
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {visibleKinds.map((k) => (
            <KindChip key={k} value={k} active={kind === k} onSelect={() => setKind(k)} />
          ))}
          {!showAll && visibleKinds.length < ALL_KINDS.length ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-muted-foreground hover:text-foreground rounded-full px-2.5 py-1 text-[12px] underline-offset-2 transition-colors hover:underline"
            >
              More…
            </button>
          ) : null}
        </div>
        {READING_KIND_HINT[kind] ? (
          <p className="text-muted-foreground text-[11.5px] leading-relaxed">
            {READING_KIND_HINT[kind]}
          </p>
        ) : null}
      </fieldset>

      {/* Dynamic value fields per kind */}
      {kind === "bp" ? <BpFields /> : null}
      {kind !== "bp" && NUMERIC_READING_KINDS.includes(kind as NumericReadingKind) ? (
        <SingleNumericFields kind={kind as NumericReadingKind} />
      ) : null}
      {kind === "symptom" ? <SymptomFields /> : null}
      {kind === "note" ? <NoteOnlyFields /> : null}
      {kind === "other" ? <OtherFields /> : null}

      {/* When */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recorded_at" className="text-caption tracking-tight">
          When (optional)
        </Label>
        <Input
          id="recorded_at"
          name="recorded_at"
          type="datetime-local"
          defaultValue={localNowDatetimeLocal()}
          className="text-body-s font-mono tabular-nums"
        />
      </div>

      {/* Optional note — always available except for kind=note (where note IS the value) */}
      {kind !== "note" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="note" className="text-caption tracking-tight">
            Note (optional)
          </Label>
          <textarea
            id="note"
            name="note"
            rows={3}
            maxLength={2000}
            placeholder="Anything worth remembering about this reading."
            className="border-input bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-ring/50 focus-visible:border-ring text-body-s resize-none rounded-md border px-3 py-2 leading-relaxed shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
          />
        </div>
      ) : null}

      {state.error ? (
        <p className="text-destructive border-destructive/30 bg-destructive/5 rounded-md border px-3 py-2 text-[12px] leading-relaxed">
          {state.error}
        </p>
      ) : null}

      <div className="bg-muted/40 text-muted-foreground rounded-md px-3 py-2 text-[11.5px] leading-relaxed">
        For your own tracking — not yet shared with a clinician.
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={() => router.push("/patient/track")}>
          Cancel
        </Button>
        <Button type="submit">Save reading</Button>
      </div>
    </form>
  );
}

/* ── Kind chip ─────────────────────────────────────────────────── */

function KindChip({
  value,
  active,
  onSelect,
}: {
  value: Kind;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={
        active
          ? "bg-brand-600 rounded-full px-3 py-1 text-[12.5px] font-medium text-white shadow-xs"
          : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 rounded-full border px-3 py-1 text-[12.5px] transition-colors"
      }
    >
      {READING_KIND_LABEL[value] ?? value}
    </button>
  );
}

/* ── Field groups per kind ─────────────────────────────────────── */

function BpFields() {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-caption tracking-tight">Reading</Label>
      <div className="flex items-center gap-2">
        <Input
          name="numeric_value_1"
          inputMode="decimal"
          placeholder="Systolic"
          className="text-body-m font-mono tabular-nums"
          required
        />
        <span className="text-muted-foreground font-mono text-[14px]">/</span>
        <Input
          name="numeric_value_2"
          inputMode="decimal"
          placeholder="Diastolic"
          className="text-body-m font-mono tabular-nums"
          required
        />
        <span className="text-muted-foreground shrink-0 font-mono text-[12px]">mmHg</span>
        <input type="hidden" name="unit" value="mmHg" />
      </div>
    </div>
  );
}

function SingleNumericFields({ kind }: { kind: NumericReadingKind }) {
  const units = READING_UNIT_OPTIONS[kind];
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-caption tracking-tight">Reading</Label>
      <div className="flex items-center gap-2">
        <Input
          name="numeric_value_1"
          inputMode="decimal"
          placeholder="Value"
          className="text-body-m font-mono tabular-nums"
          required
        />
        {units.length === 1 ? (
          <>
            <span className="text-muted-foreground shrink-0 font-mono text-[12px]">{units[0]}</span>
            <input type="hidden" name="unit" value={units[0]} />
          </>
        ) : (
          <select
            name="unit"
            defaultValue={units[0]}
            className="border-input bg-background text-foreground focus-visible:ring-ring/50 rounded-md border px-2 py-1.5 font-mono text-[12.5px] outline-none focus-visible:ring-[3px]"
          >
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function SymptomFields() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="symptom-desc" className="text-caption tracking-tight">
          What you&rsquo;re feeling
        </Label>
        <Input
          id="symptom-desc"
          name="note"
          placeholder="e.g. Headache behind the eyes"
          maxLength={240}
          required
        />
        {/* numeric_value_1 isn't required for symptom — superRefine allows it */}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-caption tracking-tight">Severity (optional)</Label>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <SeverityRadio key={s} value={s} />
          ))}
        </div>
        <p className="text-muted-foreground text-caption">1 = barely noticeable · 5 = severe</p>
      </div>
    </div>
  );
}

function SeverityRadio({ value }: { value: number }) {
  return (
    <label className="border-border text-muted-foreground hover:border-foreground/30 text-body-s has-[:checked]:border-brand-600 has-[:checked]:bg-brand-600 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border font-mono tabular-nums transition-colors has-[:checked]:text-white">
      <input type="radio" name="severity" value={value} className="sr-only" />
      {value}
    </label>
  );
}

function NoteOnlyFields() {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="note-only" className="text-caption tracking-tight">
        Your note
      </Label>
      <textarea
        id="note-only"
        name="note"
        rows={5}
        maxLength={2000}
        required
        placeholder="Anything you want to remember. Private to you."
        className="border-input bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-ring/50 focus-visible:border-ring text-body-s resize-none rounded-md border px-3 py-2 leading-relaxed shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
      />
    </div>
  );
}

function OtherFields() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="other-value" className="text-caption tracking-tight">
          Value (optional)
        </Label>
        <Input
          id="other-value"
          name="numeric_value_1"
          inputMode="decimal"
          placeholder="A number, if relevant"
          className="text-body-m font-mono tabular-nums"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="other-unit" className="text-caption tracking-tight">
          Unit (optional)
        </Label>
        <Input id="other-unit" name="unit" placeholder="e.g. steps, hours" maxLength={16} />
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

function localNowDatetimeLocal(): string {
  const d = new Date();
  // datetime-local expects "YYYY-MM-DDTHH:mm" in local time, no tz.
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
