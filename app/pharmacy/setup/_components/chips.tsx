"use client";

import { cn } from "@/lib/utils";

export const chip = (on: boolean) =>
  cn(
    "min-h-11 rounded-full px-4 text-[13.5px]",
    on ? "bg-tide-navy-900 text-tide-on-band font-semibold" : "bg-card shadow-tide-card",
  );

export function Chips({
  label,
  keys,
  words,
  value,
  set,
}: {
  label: string;
  keys: readonly string[];
  words: Record<string, string>;
  value: string | null;
  set: (k: string | null) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-body-s mb-2 font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={value === k}
            onClick={() => set(k)}
            className={chip(value === k)}
          >
            {words[k]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
