"use client";

import type { Feature, FeatureOption, NcdCatalog, SiteProfile } from "@/lib/ncd/catalog/schema";
import type {
  CaptureEntry,
  CaptureMap,
  CaptureValue,
  DurationUnit,
} from "@/lib/ncd/engine/evaluate";
import { useMemo } from "react";
import { AlertTriangleIcon, CheckIcon, CircleSlashIcon, RotateCcwIcon } from "lucide-react";

import { displayCondition, isPerformable } from "@/lib/ncd/catalog/schema";
import { contextOf, evaluatePredicate, isDuration, isEntry } from "@/lib/ncd/engine/evaluate";

/**
 * Catalog-driven capture. The form is GENERATED from the catalog rather than
 * written against it — which is what makes hypertension and CKD a data file
 * instead of another form.
 *
 * ── The one rule the whole surface exists to hold ────────────────────────────
 * Every control is TRI-state, and "not assessed" is the default. There is no
 * arrangement of clicks that produces a normal-looking value from a question
 * nobody answered. A feature the site cannot perform is not rendered as an empty
 * input at all — it is shown as unobtainable, with the capability named, because
 * an input the clinician can never fill is just a reproach.
 *
 * ── Motion, deliberately sparse ──────────────────────────────────────────────
 * Answering a feature happens dozens of times per encounter, so the controls do
 * not animate: 100 ms colour only, and an :active press so the button feels
 * heard. Sections animate on first reveal, once. Nothing here is decorative.
 */

const EASE = "transition-colors duration-100 ease-expo-out";
const OVERLINE = "text-muted-foreground text-[10px] font-medium tracking-[0.1em] uppercase";
/** Buttons must feel pressed — the cheapest honesty in the whole interface. */
const TAP = "active:scale-[0.97] transition-transform duration-100 ease-expo-out";

export interface NcdCaptureProps {
  catalog: NcdCatalog;
  site: SiteProfile;
  values: CaptureMap;
  onChange: (next: CaptureMap) => void;
}

/** Per-section progress, used by the rail. Unavailable features are excluded
 *  from the denominator — a site is not asked to complete what it cannot do. */
export interface SectionProgress {
  id: string;
  display: string;
  description?: string;
  answered: number;
  total: number;
  unavailable: number;
}

export function sectionProgress(
  catalog: NcdCatalog,
  site: SiteProfile,
  values: CaptureMap,
): SectionProgress[] {
  const by = new Map<string, Feature[]>();
  for (const f of catalog.features) {
    const list = by.get(f.section) ?? [];
    list.push(f);
    by.set(f.section, list);
  }
  return [...catalog.sections]
    .sort((a, b) => a.order - b.order)
    .filter((s) => (by.get(s.id) ?? []).length)
    .map((s) => {
      const ctx = contextOf(catalog.features, values, site);
      // Conditional fields are not yet askable, so counting them would show a
      // denominator the clinician cannot reach.
      const fs = (by.get(s.id) ?? []).filter((f) => {
        const cond = displayCondition(f);
        return cond ? evaluatePredicate(cond, ctx).state === "met" : true;
      });
      const unavailable = fs.filter((f) => !isPerformable(f, site)).length;
      return {
        id: s.id,
        display: s.display,
        description: s.description,
        answered: fs.filter((f) => values[f.code]?.state === "recorded").length,
        total: fs.length - unavailable,
        unavailable,
      };
    });
}

/**
 * ONE section at a time.
 *
 * Seventy features in a single column is a scroll, and a scroll is where a
 * clinician loses their place mid-encounter. Sections are short enough to hold
 * whole, and the rail beside them keeps the shape of the whole protocol visible
 * so nothing feels hidden — which is the tension: less on screen must not mean
 * less known about.
 */
export function NcdCapture({
  catalog,
  site,
  values,
  onChange,
  sectionId,
}: NcdCaptureProps & { sectionId: string }) {
  const section = catalog.sections.find((s) => s.id === sectionId);

  /**
   * Which features are visible right now.
   *
   * A property only appears once its finding is present, and a conditional field
   * only once its condition holds — evaluated by the SAME evaluator the clinical
   * rules use, so what the form shows and what the engine reasons about can never
   * drift apart. The effect is that an unasked symptom never spawns a page of
   * questions about itself.
   */
  const visible = useMemo(() => {
    const ctx = contextOf(catalog.features, values, site);
    return catalog.features.filter((f) => {
      if (f.section !== sectionId) return false;
      const cond = displayCondition(f);
      return cond ? evaluatePredicate(cond, ctx).state === "met" : true;
    });
  }, [catalog.features, sectionId, values, site]);

  /** Top-level findings, each followed by whichever of its properties are visible. */
  const rows = useMemo(() => {
    const shown = new Set(visible.map((f) => f.code));
    const out: { feature: Feature; depth: number }[] = [];
    for (const f of visible) {
      if (f.parent && shown.has(f.parent)) continue; // emitted under its parent
      out.push({ feature: f, depth: 0 });
      for (const child of visible) {
        if (child.parent === f.code) out.push({ feature: child, depth: 1 });
      }
    }
    return out;
  }, [visible]);

  const set = (code: string, v: CaptureMap[string]) => {
    const next = { ...values };
    if (v === undefined) delete next[code];
    else next[code] = v;
    onChange(next);
  };

  if (!section) return null;

  return (
    <section key={sectionId} className="flex flex-col">
      <header className="mb-1 flex flex-wrap items-baseline gap-x-2">
        <h3 className="font-display text-foreground text-body-l leading-tight font-medium tracking-[-0.012em]">
          {section.display}
        </h3>
        {section.description ? (
          <p className="text-muted-foreground text-[11.5px]">{section.description}</p>
        ) : null}
      </header>

      <div className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-xl border shadow-xs">
        {rows.map(({ feature, depth }) => (
          <FeatureRow
            key={feature.code}
            feature={feature}
            site={site}
            depth={depth}
            value={values[feature.code]}
            onSet={(v) => set(feature.code, v)}
          />
        ))}
      </div>
    </section>
  );
}

/* ── the rail: the whole protocol, always visible ────────────────────────── */

export function NcdSectionRail({
  progress,
  activeId,
  onPick,
}: {
  progress: SectionProgress[];
  activeId: string;
  onPick: (id: string) => void;
}) {
  return (
    <nav aria-label="Clerkship sections" className="flex gap-1 overflow-x-auto lg:flex-col">
      {progress.map((s) => {
        const active = s.id === activeId;
        const done = s.total > 0 && s.answered >= s.total;
        return (
          <button
            key={s.id}
            type="button"
            aria-current={active ? "step" : undefined}
            onClick={() => onPick(s.id)}
            className={`tap flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left ${EASE} ${TAP} ${
              active ? "bg-brand-50 dark:bg-brand-950/40" : "hover:bg-muted/60"
            }`}
          >
            {/* Progress as a ring, paired with the count — never colour alone. */}
            <span
              aria-hidden
              className={`grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-medium tabular-nums ring-1 ring-inset ${
                done
                  ? "bg-brand-600 ring-brand-600 text-white"
                  : s.answered > 0
                    ? "text-brand-700 ring-brand-500/50 dark:text-brand-300"
                    : "text-muted-foreground ring-border"
              }`}
            >
              {done ? <CheckIcon className="size-3" /> : s.answered}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block truncate text-[12.5px] ${
                  active ? "text-brand-900 dark:text-brand-100" : "text-foreground/85"
                } ${active ? "font-medium" : ""}`}
              >
                {s.display}
              </span>
              <span className="text-muted-foreground block font-mono text-[9.5px] tabular-nums">
                {s.answered}/{s.total}
                {s.unavailable ? ` · ${s.unavailable} n/a` : ""}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function FeatureRow({
  feature,
  site,
  value,
  onSet,
  depth = 0,
}: {
  feature: Feature;
  site: SiteProfile;
  value: CaptureMap[string];
  onSet: (v: CaptureMap[string]) => void;
  /** 1 for a property of the finding above it. */
  depth?: number;
}) {
  const performable = isPerformable(feature, site);
  const recorded = value?.state === "recorded" ? value.value : undefined;
  const markedUnavailable = value?.state === "unavailable";

  // A long option list, or one carrying per-option detail, needs the full row
  // width — chips squeezed against the right edge is what overflowed the frame.
  const wide =
    performable &&
    (Boolean(feature.optionDetail) ||
      (feature.valueType === "multi_select" && (feature.options?.length ?? 0) > 5));

  const nested = depth > 0;

  return (
    <div
      className={`gap-x-3 gap-y-1.5 py-2 pr-3 ${nested ? "bg-muted/25 pl-7" : "pl-3"} ${wide ? "flex flex-col" : "flex flex-wrap items-center"}`}
    >
      <span className={`flex min-w-0 flex-col ${wide ? "" : "flex-[1_1_11rem]"}`}>
        <span
          className={`${nested ? "text-[12px]" : "text-[12.5px]"} ${performable ? "text-foreground" : "text-muted-foreground"} ${feature.dangerSign ? "inline-flex items-center gap-1.5" : ""}`}
        >
          {feature.display}
          {/* Marked before it is answered, so the clinician knows the question
              carries weight rather than discovering it after the fact. */}
          {feature.dangerSign ? (
            <span
              title={feature.dangerSign.action}
              className={`inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-[9px] font-medium ${
                feature.dangerSign.severity === "red"
                  ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                  : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              }`}
            >
              <AlertTriangleIcon className="size-2.5" aria-hidden />
              danger sign
            </span>
          ) : null}
        </span>
        {feature.unit && feature.valueType !== "duration" ? (
          <span className="text-muted-foreground font-mono text-[10px]">
            {feature.unit}
            {feature.altUnit && typeof recorded === "number"
              ? ` · ${(recorded * feature.altUnit.factor).toFixed(feature.altUnit.factor > 10 ? 0 : 1)} ${feature.altUnit.unit}`
              : null}
          </span>
        ) : null}
      </span>

      {!performable ? (
        /* Not an empty input. An input the clinician can never fill is a reproach. */
        <span className="text-muted-foreground text-caption ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1">
          <CircleSlashIcon className="size-3" aria-hidden />
          Not available here
          <span className="font-mono text-[9.5px] opacity-70">{feature.requires}</span>
        </span>
      ) : (
        <span
          className={`flex min-w-0 items-center gap-1.5 ${wide ? "w-full" : "ml-auto flex-wrap justify-end"}`}
        >
          <ValueEditor feature={feature} value={value} onSet={onSet} />
          {value ? (
            <button
              type="button"
              onClick={() => onSet(undefined)}
              title="Clear — back to not assessed"
              aria-label={`Clear ${feature.display}`}
              className={`tap text-muted-foreground hover:text-foreground rounded p-1 ${EASE} ${TAP}`}
            >
              <RotateCcwIcon className="size-3" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                onSet({ state: "unavailable", capability: feature.requires ?? "site" })
              }
              title="Could not be done today"
              className={`tap text-muted-foreground/70 hover:text-foreground rounded px-1.5 py-1 text-[10.5px] ${EASE} ${TAP}`}
            >
              n/a
            </button>
          )}
        </span>
      )}

      {markedUnavailable ? (
        <span className="text-muted-foreground w-full text-[10.5px]">
          Recorded as not obtainable at this visit — a referral, not an outstanding task.
        </span>
      ) : null}
    </div>
  );
}

/* ── value editors, one per valueType ────────────────────────────────────── */

function ValueEditor({
  feature,
  value,
  onSet,
}: {
  feature: Feature;
  value: CaptureMap[string];
  onSet: (v: CaptureMap[string]) => void;
}) {
  const current = value?.state === "recorded" ? value.value : undefined;
  const put = (v: CaptureValue) => onSet({ state: "recorded", value: v });

  if (feature.valueType === "boolean") {
    return (
      <Segmented
        options={[
          { value: "yes", display: "Yes" },
          { value: "no", display: "No" },
        ]}
        active={current === true ? "yes" : current === false ? "no" : undefined}
        onPick={(v) => put(v === "yes")}
        tone={current === true ? "teal" : "slate"}
      />
    );
  }

  // A checkable list, not chips: eleven options with a dose beside each will
  // never fit on one line, and a horizontal row that overflows its frame hides
  // options entirely rather than merely crowding them.
  if (feature.optionDetail && feature.valueType === "multi_select") {
    const entries: CaptureEntry[] = Array.isArray(current)
      ? (current as (string | CaptureEntry)[]).map((e) =>
          typeof e === "string" ? { option: e } : e,
        )
      : [];
    const put2 = (next: CaptureEntry[]) => (next.length ? put(next) : onSet(undefined));
    return (
      <span className="border-border divide-border/50 w-full divide-y overflow-hidden rounded-lg border">
        {(feature.options ?? []).map((o) => {
          const picked = entries.find((e) => e.option === o.value);
          return (
            <span key={o.value} className="flex items-center gap-2 px-2 py-1">
              <button
                type="button"
                role="checkbox"
                aria-checked={Boolean(picked)}
                onClick={() =>
                  put2(
                    picked
                      ? entries.filter((e) => e.option !== o.value)
                      : [...entries, { option: o.value }],
                  )
                }
                className={`tap flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left text-[12px] ${EASE} ${TAP}`}
              >
                <span
                  aria-hidden
                  className={`grid size-4 shrink-0 place-items-center rounded ring-1 ring-inset ${
                    picked ? "bg-brand-600 ring-brand-600 text-white" : "ring-border"
                  }`}
                >
                  {picked ? <CheckIcon className="size-3" /> : null}
                </span>
                <span className={picked ? "text-foreground" : "text-muted-foreground"}>
                  {o.display}
                </span>
              </button>

              {/* Documentation only — never read by any criterion, and never
                  offered against an option a detail cannot describe. */}
              {picked && !o.noDetail ? (
                <input
                  value={picked.detail ?? ""}
                  placeholder={o.detail?.placeholder ?? feature.optionDetail?.placeholder ?? ""}
                  aria-label={`${o.detail?.label ?? feature.optionDetail?.label ?? "Detail"} — ${o.display}`}
                  onChange={(e) =>
                    put2(
                      entries.map((x) =>
                        x.option === o.value ? { ...x, detail: e.target.value } : x,
                      ),
                    )
                  }
                  className="border-input bg-card ease-expo-out focus-visible:border-brand-500 focus-visible:ring-brand-500/25 w-[9rem] shrink-0 rounded-md border px-2 py-1 text-[11.5px] transition-[border-color,box-shadow] duration-100 outline-none focus-visible:ring-2"
                />
              ) : null}
            </span>
          );
        })}
      </span>
    );
  }

  if (feature.valueType === "single_select" || feature.valueType === "multi_select") {
    const multi = feature.valueType === "multi_select";
    const entry = isEntry(current) ? current : undefined;
    const selected = new Set(
      entry
        ? [entry.option]
        : Array.isArray(current)
          ? current.map(String)
          : current != null
            ? [String(current)]
            : [],
    );
    // A single-select option may carry an OPTIONAL note — "Other" needs somewhere
    // to say which. The selection alone is a complete answer; the note only ever
    // adds to it, and is never read by a criterion.
    const chosen = !multi ? (feature.options ?? []).find((o) => selected.has(o.value)) : undefined;
    const note = chosen && !chosen.noDetail ? (chosen.detail ?? feature.optionDetail) : undefined;

    return (
      <span className="flex flex-wrap items-center justify-end gap-1">
        {(feature.options ?? []).map((o) => (
          <Chip
            key={o.value}
            option={o}
            active={selected.has(o.value)}
            onPick={() => {
              if (!multi) {
                const cfg = !o.noDetail ? (o.detail ?? feature.optionDetail) : undefined;
                return put(cfg ? { option: o.value, detail: entry?.detail } : o.value);
              }
              const next = new Set(selected);
              if (next.has(o.value)) next.delete(o.value);
              else next.add(o.value);
              put([...next]);
            }}
          />
        ))}
        {note && chosen ? (
          <input
            value={entry?.detail ?? ""}
            placeholder={note.placeholder ?? ""}
            aria-label={`${note.label ?? "Detail"} — ${chosen.display} (optional)`}
            onChange={(e) => put({ option: chosen.value, detail: e.target.value })}
            className="border-input bg-card ease-expo-out focus-visible:border-brand-500 focus-visible:ring-brand-500/25 w-[11rem] rounded-md border px-2 py-1 text-[11.5px] transition-[border-color,box-shadow] duration-100 outline-none focus-visible:ring-2"
          />
        ) : null}
      </span>
    );
  }

  // A duration keeps its unit, so "6 weeks" and "11 years" are both sayable and
  // neither has to be rounded into a unit the clinician did not mean.
  if (feature.valueType === "duration") {
    const d = isDuration(current) ? current : undefined;
    const unit: DurationUnit = d?.unit ?? (feature.unit as DurationUnit) ?? "years";
    return (
      <span className="inline-flex items-center gap-1">
        <input
          inputMode="decimal"
          value={d ? String(d.value) : ""}
          placeholder="—"
          aria-label={feature.display}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onSet(undefined);
            const n = Number(raw);
            if (!Number.isFinite(n)) return;
            put({ value: n, unit });
          }}
          className={`border-input bg-card ease-expo-out focus-visible:border-brand-500 focus-visible:ring-brand-500/25 w-[4.5rem] rounded-md border px-2 py-1 text-right font-mono text-[12px] tabular-nums transition-[border-color,box-shadow] duration-100 outline-none focus-visible:ring-2 ${
            d ? "text-foreground" : "text-muted-foreground"
          }`}
        />
        <select
          aria-label={`${feature.display} — unit`}
          value={unit}
          onChange={(e) => put({ value: d?.value ?? 0, unit: e.target.value as DurationUnit })}
          className="border-input bg-card text-foreground/85 ease-expo-out focus-visible:border-brand-500 rounded-md border px-1.5 py-1 text-[11.5px] transition-[border-color] duration-100 outline-none"
        >
          {(["days", "weeks", "months", "years"] as const).map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </span>
    );
  }

  return (
    <input
      inputMode={feature.valueType === "number" ? "decimal" : "text"}
      value={current == null ? "" : String(current)}
      placeholder="—"
      aria-label={feature.display}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onSet(undefined);
        if (feature.valueType === "number") {
          const n = Number(raw);
          // A half-typed "7." is not a value yet; keep it out of the engine
          // rather than letting NaN masquerade as a measurement.
          if (!Number.isFinite(n)) return;
          return put(n);
        }
        put(raw);
      }}
      className={`border-input bg-card ease-expo-out focus-visible:border-brand-500 focus-visible:ring-brand-500/25 w-[6.5rem] rounded-md border px-2 py-1 text-right font-mono text-[12px] tabular-nums transition-[border-color,box-shadow] duration-100 outline-none focus-visible:ring-2 ${
        current != null ? "text-foreground" : "text-muted-foreground"
      }`}
    />
  );
}

function Segmented({
  options,
  active,
  onPick,
  tone,
}: {
  options: FeatureOption[];
  active?: string;
  onPick: (v: string) => void;
  tone: "teal" | "slate";
}) {
  return (
    <span className="border-border inline-flex overflow-hidden rounded-md border">
      {options.map((o) => {
        const on = active === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(o.value)}
            className={`tap px-2.5 py-1 text-[11.5px] font-medium ${EASE} ${TAP} ${
              on
                ? tone === "teal"
                  ? "bg-brand-600 text-white"
                  : "bg-slate-600 text-white"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {o.display}
          </button>
        );
      })}
    </span>
  );
}

function Chip({
  option,
  active,
  onPick,
}: {
  option: FeatureOption;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onPick}
      className={`tap rounded px-2 py-0.5 text-[11.5px] ring-1 ring-inset ${EASE} ${TAP} ${
        active
          ? "bg-brand-50 text-brand-700 ring-brand-500/40 dark:bg-brand-950/40 dark:text-brand-200"
          : "text-foreground/70 ring-border hover:bg-muted/60"
      }`}
    >
      {option.display}
    </button>
  );
}

export { OVERLINE as NCD_OVERLINE };
