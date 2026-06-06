"use client";

import type { CatalogProperty, CatalogSymptom } from "@/lib/clerkship/catalog";
import type { CapturedPropertyValue, CapturedSymptom } from "@/lib/clerkship/symptom-engine";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronRightIcon, PlusIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { renderSymptomProse } from "@/lib/clerkship/symptom-engine";
import {
  loadSymptomCatalogAction,
  loadSymptomPropertiesAction,
  proposeSymptomAction,
} from "../actions";

/**
 * Tap-first presenting-complaint capture (addendum: symptom engine). Search / tap
 * a symptom → it's added as a pill; tap the pill → a small dialog of its relevant
 * properties (chips / 0–10 scale / duration); near-zero typing, free text the
 * last resort. Renders live prose. Ad-hoc symptoms are per-encounter (local) with
 * a governed "propose to catalog" path. Decision-support — it structures, never
 * diagnoses.
 */

const DURATION_UNITS = ["min", "hrs", "days", "wks", "mo"] as const;
const DURATION_LABEL: Record<string, string> = {
  min: "minutes",
  hrs: "hours",
  days: "days",
  wks: "weeks",
  mo: "months",
};

const EASE =
  "transition-[color,background-color,border-color,box-shadow] duration-150 ease-expo-out";

function chipClass(active: boolean) {
  return [
    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px]",
    EASE,
    active
      ? "border-teal-500 bg-teal-50 text-teal-800 dark:border-teal-400/60 dark:bg-teal-950/40 dark:text-teal-200"
      : "border-border bg-card text-foreground/80 hover:border-teal-300 hover:bg-teal-50/50 dark:hover:bg-teal-950/20",
  ].join(" ");
}

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
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    loadSymptomCatalogAction()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  // Load a symptom's properties when it's first added / opened.
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
    if (!q) return pool.slice(0, 10);
    return pool
      .filter(
        (s) =>
          s.display.toLowerCase().includes(q) ||
          s.synonyms.some((syn) => syn.toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [catalog, query, value]);

  const canAddAdHoc =
    query.trim().length > 1 &&
    !matches.some((m) => m.display.toLowerCase() === query.trim().toLowerCase());

  function addSymptom(s: CatalogSymptom) {
    onChange([...value, { symptomCode: s.code, symptomDisplay: s.display, properties: [] }]);
    setQuery("");
    setOpenIdx(value.length); // open the new one's dialog immediately
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
    setOpenIdx(value.length);
  }

  const openSymptom = openIdx !== null ? value[openIdx] : undefined;

  return (
    <div className="flex flex-col gap-3">
      {/* Added symptom pills */}
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((s, idx) => {
            const count = s.properties.length + (s.note?.trim() ? 1 : 0);
            return (
              <span
                key={s.symptomCode}
                className={`group border-border bg-card inline-flex items-center gap-1.5 rounded-lg border py-1 pr-1 pl-2.5 ${EASE} hover:border-teal-300`}
              >
                <button
                  type="button"
                  onClick={() => setOpenIdx(idx)}
                  className="inline-flex items-center gap-1.5 text-left"
                >
                  <span className="text-foreground text-[12.5px] font-medium">
                    {s.symptomDisplay}
                  </span>
                  {s.adHoc ? (
                    <span className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[8.5px] tracking-wide text-amber-800 uppercase dark:bg-amber-950/40 dark:text-amber-200">
                      new
                    </span>
                  ) : null}
                  <span className="text-muted-foreground inline-flex items-center gap-0.5 font-mono text-[10px] tabular-nums">
                    {count > 0 ? `${count} detail${count > 1 ? "s" : ""}` : "add detail"}
                    <ChevronRightIcon className="size-3" aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${s.symptomDisplay}`}
                  onClick={() => {
                    onChange(value.filter((_, i) => i !== idx));
                    setOpenIdx(null);
                  }}
                  className="text-muted-foreground hover:bg-muted hover:text-destructive rounded-md p-0.5"
                >
                  <XIcon className="size-3.5" aria-hidden />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      {/* Search / add */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            aria-hidden
          />
          <Input
            className="pl-8"
            placeholder={
              value.length ? "Add another symptom…" : "Search symptoms — chest pain, SOB, fever…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {catalog === null ? (
            <span className="text-muted-foreground text-[12px]">Loading catalog…</span>
          ) : (
            matches.map((s) => (
              <button
                key={s.code}
                type="button"
                className={chipClass(false)}
                onClick={() => addSymptom(s)}
              >
                <PlusIcon className="size-3" aria-hidden />
                {s.display}
              </button>
            ))
          )}
          {canAddAdHoc ? (
            <button
              type="button"
              onClick={addAdHoc}
              className={`inline-flex items-center gap-1 rounded-full border border-dashed border-amber-400/70 bg-amber-50 px-2.5 py-1 text-[12px] text-amber-800 ${EASE} hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200`}
            >
              <PlusIcon className="size-3" aria-hidden />
              Add “{query.trim()}”
            </button>
          ) : null}
        </div>
      </div>

      {/* Generated prose */}
      {value.length > 0 ? (
        <div className="border-border/70 bg-muted/30 rounded-lg border px-3 py-2">
          <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.14em] uppercase">
            Reads as
          </span>
          <p className="text-foreground mt-0.5 text-[12.5px] leading-relaxed">
            {renderSymptomProse(value)}
          </p>
        </div>
      ) : null}

      {/* Properties dialog */}
      <Dialog open={openIdx !== null} onOpenChange={(o) => !o && setOpenIdx(null)}>
        {openSymptom ? (
          <PropertiesDialog
            symptom={openSymptom}
            properties={propsBySymptom[openSymptom.symptomCode] ?? null}
            onChange={(next) => onChange(value.map((s, i) => (i === openIdx ? next : s)))}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function PropertiesDialog({
  symptom,
  properties,
  onChange,
}: {
  symptom: CapturedSymptom;
  properties: CatalogProperty[] | null;
  onChange: (next: CapturedSymptom) => void;
}) {
  function setProp(
    propertyCode: string,
    build: (prev?: CapturedPropertyValue) => CapturedPropertyValue,
  ) {
    const prev = symptom.properties.find((p) => p.propertyCode === propertyCode);
    const others = symptom.properties.filter((p) => p.propertyCode !== propertyCode);
    onChange({ ...symptom, properties: [...others, build(prev)] });
  }
  const get = (code: string) => symptom.properties.find((p) => p.propertyCode === code);

  return (
    <DialogContent className="sm:max-w-md">
      <DialogTitle className="flex items-center gap-2 text-[15px]">
        <SlidersHorizontalIcon className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
        {symptom.symptomDisplay}
        {symptom.adHoc ? <ProposeAdHoc symptom={symptom} /> : null}
      </DialogTitle>

      <div className="-mx-1 flex max-h-[60vh] flex-col gap-3.5 overflow-y-auto px-1 py-1">
        {properties === null ? (
          <span className="text-muted-foreground text-[12px]">Loading properties…</span>
        ) : properties.length === 0 ? (
          <span className="text-muted-foreground text-[12px]">
            No catalog properties — use the note below.
          </span>
        ) : (
          properties.map((prop) => (
            <PropertyControl
              key={prop.code}
              prop={prop}
              current={get(prop.code)}
              setProp={setProp}
            />
          ))
        )}

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[10.5px] tracking-[0.08em] uppercase">
            Note (optional)
          </span>
          <Input
            placeholder="Anything not captured above…"
            value={symptom.note ?? ""}
            onChange={(e) => onChange({ ...symptom, note: e.target.value })}
          />
        </label>
      </div>
    </DialogContent>
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
      <span className="text-muted-foreground text-[10.5px] tracking-[0.08em] uppercase">
        {prop.display}
        {prop.required ? <span className="text-teal-600 dark:text-teal-400"> *</span> : null}
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
                className={chipClass(active)}
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
              className={`size-7 rounded-md border text-[11px] tabular-nums ${EASE} ${
                current?.num === n
                  ? "border-teal-500 bg-teal-500 text-white"
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-teal-300"
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
            inputMode="numeric"
            value={current?.durationValue ?? ""}
            onChange={(e) =>
              setProp(prop.code, (prev) => ({
                ...base,
                durationValue: e.target.value === "" ? undefined : Number(e.target.value),
                durationUnit: prev?.durationUnit,
              }))
            }
            className={`border-input bg-card w-16 rounded-md border px-2 py-1 text-[12.5px] tabular-nums outline-none ${EASE} focus-visible:border-teal-500`}
          />
          {DURATION_UNITS.map((u) => (
            <button
              key={u}
              type="button"
              className={chipClass(current?.durationUnit === DURATION_LABEL[u])}
              onClick={() =>
                setProp(prop.code, (prev) => ({
                  ...base,
                  durationValue: prev?.durationValue,
                  durationUnit: DURATION_LABEL[u],
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
              className={chipClass(current?.bool === opt.v)}
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

/** Governed contribution: propose this ad-hoc symptom to the shared catalog. */
function ProposeAdHoc({ symptom }: { symptom: CapturedSymptom }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(false);
  if (done) {
    return <span className="ml-1 text-[10.5px] text-teal-700 dark:text-teal-400">proposed ✓</span>;
  }
  return (
    <button
      type="button"
      disabled={pending}
      title="Propose this symptom for the shared catalog (CSO reviews)"
      onClick={() =>
        start(async () => {
          const res = await proposeSymptomAction({
            code: symptom.symptomCode.replace(/^adhoc:/, ""),
            display: symptom.symptomDisplay,
            system: "general",
          });
          if (res.ok) setDone(true);
          else setErr(true);
        })
      }
      className="text-muted-foreground hover:text-foreground ml-1 text-[10.5px] font-normal disabled:opacity-50"
    >
      {pending ? "…" : err ? "retry" : "propose to catalog"}
    </button>
  );
}
