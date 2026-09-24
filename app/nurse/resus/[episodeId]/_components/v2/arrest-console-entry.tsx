"use client";

import type { LogFn } from "./arrest-console-writes";
import type { ArrestState } from "@/lib/resus/model";
import { useId, useState } from "react";
import { GaugeIcon, StickyNoteIcon } from "lucide-react";

import { logVitalsV2, recordNoteV2 } from "@/app/nurse/resus/_v2/actions-survey";
import { etco2KpaFromMmHg, vitalPlausible } from "@/lib/resus/vitals";
import { BtnText, consoleBtn, ConsolePopover } from "./arrest-console-model";

/**
 * LOG — the two typed entries: EtCO₂ (kPa, with the last three values of this arrest and a
 * direction-only sparkline, ALS-ETC-02) and a free note.
 */

/** Last three EtCO₂ values as a tiny line (direction only — no signed "sharp rise" number). */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 40 + 2},${16 - ((v - lo) / span) * 12}`)
    .join(" ");
  return (
    <svg aria-hidden viewBox="0 0 44 18" className="h-4 w-11 shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Etco2Entry({ arrest, log }: { arrest: ArrestState; log: LogFn }) {
  const [value, setValue] = useState("");
  // Monitors show EtCO₂ in kPa or mmHg; the record stores kPa (R2, as vitals-capture).
  const [unit, setUnit] = useState<"kPa" | "mmHg">("kPa");
  const id = useId();
  const v = Number(value);
  const ok = value.trim() !== "" && vitalPlausible("etco2", v);
  const kpa = unit === "mmHg" ? etco2KpaFromMmHg(v) : v;
  const last3 = arrest.etco2.last3;
  return (
    <form
      aria-label="EtCO₂"
      className="border-border bg-card col-span-full flex min-h-14 items-center gap-2 rounded-md border px-3 py-1.5 lg:col-span-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        log({
          key: "etco2",
          label: `EtCO₂ ${kpa} kPa`,
          row: {
            kind: "vital",
            step: null,
            payload: { label: "Vitals", snapshot: { etco2: kpa } },
          },
          run: (b) => logVitalsV2({ ...b, snapshot: { etco2: kpa } }),
        });
        setValue("");
      }}
    >
      <GaugeIcon aria-hidden className="size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <label htmlFor={id} className="text-body-m leading-tight font-medium">
          EtCO₂
        </label>
        {/* The values never split; the sparkline and "rising" wrap below them instead. */}
        <span className="text-caption text-muted-foreground flex flex-wrap items-center gap-x-1">
          <span className="font-mono whitespace-nowrap tabular-nums">
            {last3.length ? last3.join(" · ") : "No value yet"}
          </span>
          <Spark values={last3} />
          {arrest.etco2.rising ? "rising" : null}
        </span>
      </div>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step="0.1"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={unit}
        className="border-border bg-background text-body-l sm:text-body-m focus-visible:shadow-focus min-h-11 w-16 rounded-sm border px-2 font-mono tabular-nums outline-none focus-visible:border-teal-500"
      />
      <button
        type="button"
        aria-label={`EtCO₂ in ${unit}; switch to ${unit === "kPa" ? "mmHg" : "kPa"}`}
        onClick={() => setUnit((u) => (u === "kPa" ? "mmHg" : "kPa"))}
        className="tap border-border text-caption text-foreground hover:bg-muted min-h-11 min-w-11 shrink-0 rounded-md border px-1.5"
      >
        {unit}
      </button>
      <button
        type="submit"
        disabled={!ok}
        className="tap bg-primary text-primary-foreground hover:bg-primary-hover text-body-s min-h-11 rounded-md px-3 font-medium disabled:opacity-50"
      >
        Log
      </button>
    </form>
  );
}

/** A free note (the text is PHI: encrypted at rest; the record row reads "Note"). */
export function NoteButton({ log }: { log: LogFn }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const id = useId();
  return (
    <ConsolePopover
      open={open}
      onOpenChange={setOpen}
      label="Note"
      trigger={<button type="button" className={consoleBtn("neutral")} />}
      triggerContent={
        <>
          <StickyNoteIcon aria-hidden className="size-5 shrink-0" />
          <BtnText label="Note" caption="Free text" />
        </>
      }
    >
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          log({
            key: "note",
            label: "Note",
            row: { kind: "note", step: null, payload: { noteKind: "free", label: "Note" } },
            run: (b) => recordNoteV2({ ...b, text: t }),
          });
          setText("");
          setOpen(false);
        }}
      >
        <label htmlFor={id} className="text-caption text-muted-foreground">
          Note
        </label>
        <textarea
          id={id}
          rows={3}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="border-border bg-background text-body-l sm:text-body-s focus-visible:shadow-focus rounded-sm border px-2.5 py-2 outline-none focus-visible:border-teal-500"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className={consoleBtn("primed", "min-h-11 justify-center")}
        >
          Record note
        </button>
      </form>
    </ConsolePopover>
  );
}
