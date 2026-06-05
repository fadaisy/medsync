"use client";

import type { CatalogProperty, CatalogSymptom } from "@/lib/clerkship/catalog";
import type { CapturedPropertyValue, CapturedSymptom } from "@/lib/clerkship/symptom-engine";
import { useEffect, useMemo, useState, useTransition } from "react";
import { PlusIcon, SearchIcon, XIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { renderSymptomProse } from "@/lib/clerkship/symptom-engine";
import {
  loadSymptomCatalogAction,
  loadSymptomPropertiesAction,
  proposeSymptomAction,
} from "../actions";

/**
 * Tap-first HPC capture (addendum: symptom engine). Search/tap a symptom → its
 * relevant properties appear → tap values (chips / 0–10 scale / duration). Near-
 * zero typing; free text is the last resort. Renders live prose. Ad-hoc symptoms
 * (not in the catalog) are allowed per-encounter (local; never mutate the shared
 * catalog). Decision-support — it structures what the clinician elicits.
 */

const DURATION_UNITS = ["minutes", "hours", "days", "weeks", "months"];

const chip = (active: boolean) =>
  `rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
    active
      ? "border-teal-500 bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
      : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground"
  }`;

export function SymptomCapture({
  value,
  onChange,
}: {
  value: CapturedSymptom[];
  onChange: (next: CapturedSymptom[]) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogSymptom[] | null>(null);
  const [propsBySymptom, setPropsBySymptom] = useState<Record<string, CatalogProperty[]>>({});
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    loadSymptomCatalogAction()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  // Ensure properties are loaded for every captured symptom (incl. ad-hoc).
  useEffect(() => {
    for (const s of value) {
      if (propsBySymptom[s.symptomCode] === undefined) {
        const code = s.symptomCode;
        startTransition(async () => {
          const props = await loadSymptomPropertiesAction(code).catch(() => []);
          setPropsBySymptom((prev) => ({ ...prev, [code]: props }));
        });
      }
    }
  }, [value, propsBySymptom]);

  const matches = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    const chosen = new Set(value.map((v) => v.symptomCode));
    const pool = catalog.filter((s) => !chosen.has(s.code));
    if (!q) return pool.slice(0, 8);
    return pool
      .filter(
        (s) =>
          s.display.toLowerCase().includes(q) ||
          s.synonyms.some((syn) => syn.toLowerCase().includes(q)),
      )
      .slice(0, 10);
  }, [catalog, query, value]);

  function addSymptom(s: CatalogSymptom) {
    onChange([...value, { symptomCode: s.code, symptomDisplay: s.display, properties: [] }]);
    setQuery("");
    setAdding(false);
  }

  function addAdHoc() {
    const name = query.trim();
    if (!name) return;
    const slug =
      "adhoc:" +
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
    onChange([...value, { symptomCode: slug, symptomDisplay: name, adHoc: true, properties: [] }]);
    setQuery("");
    setAdding(false);
  }

  function updateSymptom(idx: number, next: CapturedSymptom) {
    onChange(value.map((s, i) => (i === idx ? next : s)));
  }

  return (
    <div className="flex flex-col gap-3">
      {value.map((s, idx) => (
        <SymptomCard
          key={s.symptomCode}
          symptom={s}
          properties={propsBySymptom[s.symptomCode] ?? null}
          onChange={(next) => updateSymptom(idx, next)}
          onRemove={() => onChange(value.filter((_, i) => i !== idx))}
        />
      ))}

      {/* Add a symptom */}
      {adding ? (
        <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-3">
          <div className="flex items-center gap-2">
            <SearchIcon className="text-muted-foreground size-3.5" aria-hidden />
            <Input
              autoFocus
              placeholder="Search symptoms (e.g. chest pain, SOB)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setQuery("");
              }}
              aria-label="Cancel"
              className="text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-4" aria-hidden />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {matches.map((s) => (
              <button
                key={s.code}
                type="button"
                className={chip(false)}
                onClick={() => addSymptom(s)}
              >
                {s.display}
              </button>
            ))}
            {query.trim() &&
            !matches.some((m) => m.display.toLowerCase() === query.trim().toLowerCase()) ? (
              <button
                type="button"
                className="rounded-full border border-dashed border-amber-400/70 bg-amber-50 px-2.5 py-1 text-[12px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                onClick={addAdHoc}
              >
                + Add “{query.trim()}” (not in catalog)
              </button>
            ) : null}
            {catalog === null ? (
              <span className="text-muted-foreground text-[12px]">Loading…</span>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-[12.5px] transition-colors"
        >
          <PlusIcon className="size-3.5" aria-hidden />
          Add a symptom
        </button>
      )}

      {/* Live prose preview */}
      {value.length > 0 ? (
        <div className="border-border bg-muted/30 rounded-xl border p-3">
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
            HPC (generated)
          </span>
          <p className="text-foreground mt-1 text-[12.5px] leading-relaxed">
            {renderSymptomProse(value)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function SymptomCard({
  symptom,
  properties,
  onChange,
  onRemove,
}: {
  symptom: CapturedSymptom;
  properties: CatalogProperty[] | null;
  onChange: (next: CapturedSymptom) => void;
  onRemove: () => void;
}) {
  function setProp(
    propertyCode: string,
    build: (prev?: CapturedPropertyValue) => CapturedPropertyValue,
  ) {
    const prev = symptom.properties.find((p) => p.propertyCode === propertyCode);
    const next = build(prev);
    const others = symptom.properties.filter((p) => p.propertyCode !== propertyCode);
    onChange({ ...symptom, properties: [...others, next] });
  }
  const get = (code: string) => symptom.properties.find((p) => p.propertyCode === code);

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-foreground text-[13.5px] font-medium">
          {symptom.symptomDisplay}
          {symptom.adHoc ? (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 font-mono text-[9px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              ad-hoc
            </span>
          ) : null}
        </span>
        <div className="flex items-center gap-2">
          {symptom.adHoc ? <ProposeAdHoc symptom={symptom} /> : null}
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove symptom"
            className="text-muted-foreground hover:text-destructive"
          >
            <XIcon className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {properties === null ? (
        <span className="text-muted-foreground text-[12px]">Loading properties…</span>
      ) : (
        properties.map((prop) => (
          <PropertyControl key={prop.code} prop={prop} current={get(prop.code)} setProp={setProp} />
        ))
      )}

      {/* Per-symptom free-text note (last resort) */}
      <Input
        placeholder="Other / describe (optional)"
        value={symptom.note ?? ""}
        onChange={(e) => onChange({ ...symptom, note: e.target.value })}
      />
    </div>
  );
}

function PropertyControl({
  prop,
  current,
  setProp,
}: {
  prop: CatalogProperty;
  current?: CapturedPropertyValue;
  setProp: (code: string, build: (prev?: CapturedPropertyValue) => CapturedPropertyValue) => void;
}) {
  const base = {
    propertyCode: prop.code,
    propertyDisplay: prop.display,
    valueType: prop.valueType,
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[11px] tracking-tight uppercase">
        {prop.display}
        {prop.required ? <span className="text-teal-600"> ·</span> : null}
      </span>

      {(prop.valueType === "single_select" || prop.valueType === "multi_select") && (
        <div className="flex flex-wrap gap-1.5">
          {prop.options.map((o) => {
            const labels = current?.labels ?? [];
            const active = labels.includes(o.display);
            return (
              <button
                key={o.value}
                type="button"
                className={chip(active)}
                onClick={() =>
                  setProp(prop.code, (prev) => {
                    const cur = prev?.labels ?? [];
                    const next =
                      prop.valueType === "single_select"
                        ? active
                          ? []
                          : [o.display]
                        : active
                          ? cur.filter((l) => l !== o.display)
                          : [...cur, o.display];
                    return { ...base, labels: next };
                  })
                }
              >
                {o.display}
              </button>
            );
          })}
        </div>
      )}

      {prop.valueType === "scale" && (
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              className={`size-7 rounded-md border text-[11px] tabular-nums transition-colors ${
                current?.num === n
                  ? "border-teal-500 bg-teal-500 text-white"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/20"
              }`}
              onClick={() => setProp(prop.code, () => ({ ...base, num: n }))}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {prop.valueType === "duration" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="number"
            min={0}
            value={current?.durationValue ?? ""}
            onChange={(e) =>
              setProp(prop.code, (prev) => ({
                ...base,
                durationValue: e.target.value === "" ? undefined : Number(e.target.value),
                durationUnit: prev?.durationUnit,
              }))
            }
            className="border-input bg-card w-16 rounded-sm border px-2 py-1 text-[12.5px] outline-none focus-visible:border-teal-500"
          />
          {DURATION_UNITS.map((u) => (
            <button
              key={u}
              type="button"
              className={chip(current?.durationUnit === u)}
              onClick={() =>
                setProp(prop.code, (prev) => ({
                  ...base,
                  durationValue: prev?.durationValue,
                  durationUnit: u,
                }))
              }
            >
              {u}
            </button>
          ))}
        </div>
      )}

      {prop.valueType === "boolean" && (
        <div className="flex gap-1.5">
          {[
            { label: "Yes", v: true },
            { label: "No", v: false },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              className={chip(current?.bool === opt.v)}
              onClick={() =>
                setProp(prop.code, (prev) => ({
                  ...base,
                  bool: prev?.bool === opt.v ? undefined : opt.v,
                }))
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {prop.valueType === "text" && (
        <Input
          value={current?.text ?? ""}
          onChange={(e) => setProp(prop.code, () => ({ ...base, text: e.target.value }))}
        />
      )}
    </div>
  );
}

/** Governed contribution: propose this ad-hoc symptom to the shared catalog
 *  (routes to CSO/superadmin review — never mutates the catalog directly). */
function ProposeAdHoc({ symptom }: { symptom: CapturedSymptom }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(false);
  if (done) {
    return <span className="text-[10.5px] text-teal-700 dark:text-teal-400">proposed ✓</span>;
  }
  return (
    <button
      type="button"
      disabled={pending}
      title="Propose this symptom for the shared catalog (CSO reviews)"
      onClick={() =>
        start(async () => {
          const code = symptom.symptomCode.replace(/^adhoc:/, "");
          const res = await proposeSymptomAction({
            code,
            display: symptom.symptomDisplay,
            system: "general",
          });
          if (res.ok) setDone(true);
          else setErr(true);
        })
      }
      className="text-muted-foreground hover:text-foreground text-[10.5px] disabled:opacity-50"
    >
      {pending ? "…" : err ? "retry propose" : "Propose to catalog"}
    </button>
  );
}
