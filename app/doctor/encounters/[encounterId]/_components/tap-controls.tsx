"use client";

import { PlusIcon } from "lucide-react";

/**
 * Tap-first controls for the Background history — NO typing. Native <select>
 * dropdowns + a "year" picker + a numeric picker, so a full history is captured
 * by selection alone (per the clinician's request). Accessible + keyboard-able
 * for desktop speed without requiring free text.
 */

const SELECT =
  "border-input bg-card text-foreground focus-visible:border-teal-500 rounded-md border px-2 py-1 text-[12px] outline-none";

/** Add-an-item dropdown: pick from the curated list; resets after each pick. */
export function AddSelect({
  options,
  placeholder,
  onAdd,
}: {
  options: { value: string; label: string }[];
  placeholder: string;
  onAdd: (value: string, label: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <PlusIcon className="text-muted-foreground size-3.5" aria-hidden />
      <select
        className={`${SELECT} w-full max-w-xs`}
        value=""
        aria-label={placeholder}
        onChange={(e) => {
          const o = options.find((x) => x.value === e.target.value);
          if (o) onAdd(o.value, o.label);
          e.currentTarget.value = "";
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const CURRENT_YEAR = 2026; // stamped (no Date.now in this codebase path)
const YEARS = Array.from({ length: 86 }, (_, i) => String(CURRENT_YEAR - i));

/** Year picker — a dropdown (no typing). Also serves age-at-onset/death. */
export function YearSelect({
  value,
  onChange,
  placeholder = "Year…",
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
}) {
  return (
    <select
      className={`${SELECT} w-24`}
      value={value ?? ""}
      aria-label={placeholder}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">{placeholder}</option>
      <option value="unknown">Unknown</option>
      {YEARS.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}

/** Numeric picker from a fixed option set (cig/day, units/week, age) — no typing. */
export function NumSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  options: number[];
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-1">
      <select
        className={`${SELECT} w-16`}
        value={value ?? ""}
        aria-label={label}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      >
        <option value="">–</option>
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground text-[10px]">{label}</span>
    </label>
  );
}

/** Common drug strengths — a dropdown (no typing). */
const DOSES = [
  "2.5 mg",
  "5 mg",
  "10 mg",
  "12.5 mg",
  "20 mg",
  "25 mg",
  "40 mg",
  "50 mg",
  "62.5 mg",
  "75 mg",
  "100 mg",
  "125 mg",
  "150 mg",
  "200 mg",
  "250 mg",
  "300 mg",
  "400 mg",
  "500 mg",
  "1 g",
  "low dose",
  "standard dose",
  "high dose",
];

export function DoseSelect({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <select
      className={`${SELECT} w-28`}
      value={value ?? ""}
      aria-label="Dose"
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">Dose…</option>
      {DOSES.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}
