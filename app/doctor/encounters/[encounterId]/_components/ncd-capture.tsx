"use client";

import type { Feature, FeatureOption, NcdCatalog, SiteProfile } from "@/lib/ncd/catalog/schema";
import type { CaptureMap, CaptureValue } from "@/lib/ncd/engine/evaluate";
import { useMemo, useState } from "react";
import { ChevronDownIcon, CircleSlashIcon, RotateCcwIcon } from "lucide-react";

import { isPerformable } from "@/lib/ncd/catalog/schema";

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

export function NcdCapture({ catalog, site, values, onChange }: NcdCaptureProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const bySection = useMemo(() => {
    const m = new Map<string, Feature[]>();
    for (const f of catalog.features) {
      const list = m.get(f.section) ?? [];
      list.push(f);
      m.set(f.section, list);
    }
    return m;
  }, [catalog.features]);

  const sections = [...catalog.sections].sort((a, b) => a.order - b.order);

  const set = (code: string, v: CaptureMap[string]) => {
    const next = { ...values };
    if (v === undefined) delete next[code];
    else next[code] = v;
    onChange(next);
  };

  return (
    <div className="stagger-children flex flex-col gap-3">
      {sections.map((section) => {
        const features = bySection.get(section.id) ?? [];
        if (!features.length) return null;
        const open = !collapsed.has(section.id);
        const answered = features.filter((f) => values[f.code]?.state === "recorded").length;
        const blocked = features.filter((f) => !isPerformable(f, site)).length;

        return (
          <section
            key={section.id}
            className="border-border bg-card overflow-hidden rounded-xl border shadow-xs"
          >
            <button
              type="button"
              onClick={() =>
                setCollapsed((c) => {
                  const n = new Set(c);
                  if (n.has(section.id)) n.delete(section.id);
                  else n.add(section.id);
                  return n;
                })
              }
              aria-expanded={open}
              className={`hover:bg-muted/40 flex w-full items-center gap-2 px-3 py-2.5 text-left ${EASE}`}
            >
              <ChevronDownIcon
                aria-hidden
                className={`text-muted-foreground ease-expo-out size-3.5 shrink-0 transition-transform duration-150 ${open ? "" : "-rotate-90"}`}
              />
              <span className="text-foreground text-[13px] font-medium">{section.display}</span>
              {section.description ? (
                <span className="text-muted-foreground hidden text-[11px] sm:inline">
                  {section.description}
                </span>
              ) : null}
              <span className="text-muted-foreground ml-auto shrink-0 font-mono text-[10.5px] tabular-nums">
                {answered}/{features.length - blocked}
                {blocked ? <span className="ml-1 opacity-70">· {blocked} n/a</span> : null}
              </span>
            </button>

            {open ? (
              <div className="divide-border/50 reveal-up border-border/60 divide-y border-t">
                {features.map((f) => (
                  <FeatureRow
                    key={f.code}
                    feature={f}
                    site={site}
                    value={values[f.code]}
                    onSet={(v) => set(f.code, v)}
                  />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

/* ── one feature ─────────────────────────────────────────────────────────── */

function FeatureRow({
  feature,
  site,
  value,
  onSet,
}: {
  feature: Feature;
  site: SiteProfile;
  value: CaptureMap[string];
  onSet: (v: CaptureMap[string]) => void;
}) {
  const performable = isPerformable(feature, site);
  const recorded = value?.state === "recorded" ? value.value : undefined;
  const markedUnavailable = value?.state === "unavailable";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
      <span className="flex min-w-0 flex-[1_1_11rem] flex-col">
        <span
          className={`text-[12.5px] ${performable ? "text-foreground" : "text-muted-foreground"}`}
        >
          {feature.display}
        </span>
        {feature.unit ? (
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
        <span className="text-muted-foreground ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px]">
          <CircleSlashIcon className="size-3" aria-hidden />
          Not available here
          <span className="font-mono text-[9.5px] opacity-70">{feature.requires}</span>
        </span>
      ) : (
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
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

  if (feature.valueType === "single_select" || feature.valueType === "multi_select") {
    const multi = feature.valueType === "multi_select";
    const selected = new Set(
      Array.isArray(current) ? current.map(String) : current != null ? [String(current)] : [],
    );
    return (
      <span className="flex flex-wrap justify-end gap-1">
        {(feature.options ?? []).map((o) => (
          <Chip
            key={o.value}
            option={o}
            active={selected.has(o.value)}
            onPick={() => {
              if (!multi) return put(o.value);
              const next = new Set(selected);
              if (next.has(o.value)) next.delete(o.value);
              else next.add(o.value);
              put([...next]);
            }}
          />
        ))}
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
      className={`border-input bg-card ease-expo-out w-[6.5rem] rounded-md border px-2 py-1 text-right font-mono text-[12px] tabular-nums transition-[border-color,box-shadow] duration-100 outline-none focus-visible:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-500/25 ${
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
                  ? "bg-teal-600 text-white"
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
          ? "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200"
          : "text-foreground/70 ring-border hover:bg-muted/60"
      }`}
    >
      {option.display}
    </button>
  );
}

export { OVERLINE as NCD_OVERLINE };
