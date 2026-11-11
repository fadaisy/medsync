"use client";

import type { PickOption } from "../../../_components/v2/fields";

import { LabButton } from "@/components/tide/work/button";
import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import { PickField } from "../../../_components/v2/fields";

const W = LABWS2_SETUP.sweep;

/** Several picks by name (5.12): a combobox to add one, and the chosen ones listed with Remove. Posts the ids. */
export function MultiPick({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: readonly PickOption[];
  value: readonly string[];
  onChange: (v: string[]) => void;
}) {
  const name = new Map(options.map((o) => [o.value, o.label]));
  return (
    <div className="flex flex-col gap-2">
      <PickField
        label={label}
        hint={hint}
        options={options.filter((o) => !value.includes(o.value))}
        value=""
        onChange={(v) => v && onChange([...value, v])}
        forceList
      />
      {value.length === 0 ? (
        <p className="text-body-s text-muted-foreground">{W.noTests}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {value.map((v) => (
            <li key={v} className="text-body-s flex items-center justify-between gap-2">
              <span>{name.get(v) ?? W.unknownComponent}</span>
              <LabButton
                type="button"
                variant="quiet"
                size="sm"
                onClick={() => onChange(value.filter((x) => x !== v))}
              >
                {W.remove}
                <span className="sr-only"> {name.get(v)}</span>
              </LabButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
