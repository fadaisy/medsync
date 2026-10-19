"use client";

import type { PickOption } from "../../_components/v2/fields";
import { useState } from "react";
import { XIcon } from "lucide-react";

import { LABWS2_QUALITY } from "@/content/lab-workspace-v2-quality";
import { PickField } from "../../_components/v2/fields";

const W = LABWS2_QUALITY.sweep;

/**
 * Pick several lab components by name (the field kit, 5.12): the chosen ones as removable pills, a combobox to
 * add one more. The value is the list of concept ids the action already takes; an id is never shown or typed.
 * A stored id that is not in the options (an old record) is kept and shown by the name the caller gives.
 */
export function ConceptMultiPick({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly PickOption[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const [adding, setAdding] = useState("");
  const name = (id: string) => options.find((o) => o.value === id)?.label ?? id;
  return (
    <div className="flex flex-col gap-2">
      <PickField
        label={label}
        options={options.filter((o) => !value.includes(o.value))}
        value={adding}
        forceList
        placeholder={W.addConcept}
        onChange={(v) => {
          if (v && !value.includes(v)) onChange([...value, v]);
          setAdding("");
        }}
      />
      <ul aria-label={label} className="flex flex-wrap gap-1.5">
        {value.length === 0 ? (
          <li className="text-caption text-muted-foreground">{W.noConcepts}</li>
        ) : null}
        {value.map((id) => (
          <li
            key={id}
            className="bg-muted text-body-s inline-flex h-8 items-center gap-1 rounded-full pr-1 pl-3"
          >
            {name(id)}
            <button
              type="button"
              aria-label={W.removeConcept(name(id))}
              className="hover:bg-ink-200 focus-visible:shadow-focus grid size-6 place-items-center rounded-full outline-none"
              onClick={() => onChange(value.filter((x) => x !== id))}
            >
              <XIcon aria-hidden className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
