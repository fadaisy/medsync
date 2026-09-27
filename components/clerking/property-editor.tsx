import type { DurationUnit, SymptomEntry } from "@/lib/clerking/answers";
import type { Catalogue, Property, Symptom } from "@/lib/clerking/catalogue";

import { applyProp, setDuration, setFlag, stepCount } from "@/lib/clerking/answers";
import { isRestricted } from "@/lib/clerking/catalogue";
import { lc } from "@/lib/clerking/compose";
import { Chip, FieldRow, ScaleStrip, Stepper, YesNoRow } from "./controls";

/**
 * The property editor (§5.4), shared by the complaint cards and (Phase 5) the Systems pop-up. Rows
 * come from the catalogue's resolved properties for the symptom (family, overrides, extras, hidden),
 * so a new symptom needs no code (Law 2). "For" (duration) first when the symptom has one, then each
 * property by kind, then the red flags as yes/no rows with a lock on restricted items. Hook-free:
 * every tap is one `onEntry(update)` call, which is what the tap-count test counts.
 */

const UNITS: readonly DurationUnit[] = ["hours", "days", "weeks", "months", "years"];
const isUnit = (x: string): x is DurationUnit => (UNITS as readonly string[]).includes(x);

export interface PropertyEditorProps {
  cat: Catalogue;
  /** null: an uncatalogued complaint (duration only, no properties). */
  symptom: Symptom | null;
  entry: SymptomEntry;
  onEntry: (update: (e: SymptomEntry) => SymptomEntry) => void;
  /** The signed REF-FLAG-PAIN-SEVERE value, or null when unsigned or withheld. */
  cautionFrom: number | null;
  disabled?: boolean;
}

export function PropertyEditor({
  cat,
  symptom,
  entry,
  onEntry,
  cautionFrom,
  disabled,
}: PropertyEditorProps) {
  const units = (cat.data.option_sets.duration_unit ?? []).filter((u) => isUnit(u.id));
  return (
    <div className="flex flex-col gap-2.5">
      {!symptom || symptom.duration ? (
        <FieldRow label="For" group={false}>
          <Stepper
            label="For"
            value={entry.duration?.value ?? null}
            disabled={disabled}
            onStep={(delta) => onEntry((e) => setDuration(e, { delta }))}
          />
          <span role="group" aria-label="Unit" className="flex flex-wrap gap-1.5">
            {units.map((u) => (
              <Chip
                key={u.id}
                selected={entry.duration?.unit === u.id}
                disabled={disabled}
                onPress={() => onEntry((e) => setDuration(e, { unit: u.id as DurationUnit }))}
              >
                {lc(u.label)}
              </Chip>
            ))}
          </span>
        </FieldRow>
      ) : null}
      {symptom
        ? cat
            .properties(symptom.id)
            .map((p) => (
              <PropertyRow
                key={p.id}
                p={p}
                entry={entry}
                onEntry={onEntry}
                cautionFrom={cautionFrom}
                disabled={disabled}
              />
            ))
        : null}
      {symptom?.red_flags.length ? (
        <FieldRow label="Red flags" group={false}>
          <div className="grid w-full gap-x-6 sm:grid-cols-2">
            {symptom.red_flags.map((f) => (
              <YesNoRow
                key={f.id}
                label={f.label}
                value={entry.flags[f.id]}
                restricted={isRestricted(f.sensitivity)}
                disabled={disabled}
                onAnswer={(a) => onEntry((e) => setFlag(e, f.id, a))}
              />
            ))}
          </div>
        </FieldRow>
      ) : null}
    </div>
  );
}

function PropertyRow({
  p,
  entry,
  onEntry,
  cautionFrom,
  disabled,
}: {
  p: Property;
  entry: SymptomEntry;
  onEntry: PropertyEditorProps["onEntry"];
  cautionFrom: number | null;
  disabled?: boolean;
}) {
  const v = entry.props[p.id];
  if (p.kind === "one" || p.kind === "many")
    return (
      <FieldRow label={p.label}>
        {p.options.map((o) => (
          <Chip
            key={o.id}
            selected={Array.isArray(v) ? v.includes(o.id) : v === o.id}
            disabled={disabled}
            onPress={() => onEntry((e) => applyProp(e, p, o.id))}
          >
            {o.label}
          </Chip>
        ))}
      </FieldRow>
    );
  if (p.kind === "count")
    return (
      <FieldRow label={p.label} group={false}>
        <Stepper
          label={p.label}
          value={typeof v === "number" ? v : null}
          disabled={disabled}
          onStep={(d) => onEntry((e) => stepCount(e, p, d))}
        />
        {p.unit ? <span className="text-caption text-muted-foreground">{p.unit}</span> : null}
      </FieldRow>
    );
  if (p.kind === "scale")
    return (
      <FieldRow label={p.label} group={false}>
        <ScaleStrip
          label={p.label}
          value={typeof v === "number" ? v : undefined}
          cautionFrom={cautionFrom}
          disabled={disabled}
          onPick={(n) => onEntry((e) => applyProp(e, p, n))}
        />
      </FieldRow>
    );
  // ponytail: text, duration and year kinds are in the schema but unused by catalogue v1; add a
  // row here when the catalogue first uses one.
  return null;
}
