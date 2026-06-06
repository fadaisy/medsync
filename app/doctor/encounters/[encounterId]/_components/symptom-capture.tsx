"use client";

import type { CatalogProperty, CatalogSymptom } from "@/lib/clerkship/catalog";
import type { CapturedPropertyValue, CapturedSymptom } from "@/lib/clerkship/symptom-engine";
import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangleIcon, SearchIcon, XIcon } from "lucide-react";

import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { renderSymptomProse } from "@/lib/clerkship/symptom-engine";
import {
  loadSymptomCatalogAction,
  loadSymptomPropertiesAction,
  proposeSymptomAction,
} from "../actions";

/**
 * Presenting-complaint composer (addendum: symptom engine). Airy, monochrome +
 * one teal accent: search or tap a symptom → it joins a hairline-separated list
 * with a live clinical summary, a severity dot, and a red-flag signal. Tap a row
 * → a calm dialog of its Hutchison's properties; red flags read as danger. The
 * whole complaint renders as prose. Decision-support — it structures, never
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

const LABEL = "text-muted-foreground text-[10px] font-medium tracking-[0.12em] uppercase";

const SYSTEM_ORDER = [
  "cardiovascular",
  "respiratory",
  "gastrointestinal",
  "neurological",
  "general",
] as const;
const SYSTEM_LABEL: Record<string, string> = {
  cardiovascular: "Cardiovascular",
  respiratory: "Respiratory",
  gastrointestinal: "Gastrointestinal",
  neurological: "Neurological",
  general: "General",
};

type Band = "low" | "mid" | "high";
const severityBand = (n: number): Band => (n <= 3 ? "low" : n <= 6 ? "mid" : "high");
const BAND_DOT: Record<Band, string> = {
  low: "bg-teal-500",
  mid: "bg-amber-500",
  high: "bg-red-500",
};

const isRedFlagProp = (p: CatalogProperty) =>
  p.code.endsWith("redflags") || p.display.toLowerCase().includes("red flag");
const isRedFlagValue = (p: CapturedPropertyValue) =>
  p.propertyCode.endsWith("redflags") || p.propertyDisplay.toLowerCase().includes("red flag");

/** A compact "central · crushing · radiating to left arm" summary for a row. */
function summarise(s: CapturedSymptom): string {
  const parts: string[] = [];
  for (const p of s.properties) {
    if (p.valueType === "scale" || isRedFlagValue(p)) continue; // severity → dot, red flags → badge
    if (p.labels?.length) parts.push(p.labels.join(", "));
    else if (p.valueType === "duration" && p.durationValue != null)
      parts.push(`${p.durationValue} ${p.durationUnit ?? ""}`.trim());
    else if (p.valueType === "boolean" && p.bool != null)
      parts.push(`${p.bool ? "" : "no "}${p.propertyDisplay.toLowerCase()}`);
    else if (p.valueType === "text" && p.text?.trim()) parts.push(p.text.trim());
  }
  if (s.note?.trim()) parts.push(s.note.trim());
  return parts.join(" · ");
}

/** Quiet, borderless-at-rest chip; fills teal (or red) when selected. */
function chipClass(active: boolean, tone: "teal" | "danger" = "teal") {
  const on =
    tone === "danger"
      ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-500/40 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-400/30"
      : "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200 dark:ring-teal-400/30";
  const off =
    "text-foreground/70 ring-1 ring-inset ring-border hover:bg-muted/60 hover:text-foreground";
  return [
    "rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors duration-150 ease-expo-out",
    active ? on : off,
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

  const chosen = useMemo(() => new Set(value.map((v) => v.symptomCode)), [value]);
  const systemByCode = useMemo(
    () => new Map((catalog ?? []).map((s) => [s.code, s.system])),
    [catalog],
  );

  const matches = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    const pool = catalog.filter((s) => !chosen.has(s.code));
    if (!q) return pool;
    return pool
      .filter(
        (s) =>
          s.display.toLowerCase().includes(q) ||
          s.synonyms.some((syn) => syn.toLowerCase().includes(q)),
      )
      .slice(0, 16);
  }, [catalog, query, chosen]);

  const grouped = useMemo(() => {
    const by = new Map<string, CatalogSymptom[]>();
    for (const s of matches) {
      const list = by.get(s.system) ?? [];
      list.push(s);
      by.set(s.system, list);
    }
    return by;
  }, [matches]);

  const canAddAdHoc =
    query.trim().length > 1 &&
    !matches.some((m) => m.display.toLowerCase() === query.trim().toLowerCase());

  function addSymptom(s: CatalogSymptom) {
    onChange([...value, { symptomCode: s.code, symptomDisplay: s.display, properties: [] }]);
    setQuery("");
    setOpenIdx(value.length);
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

  function AddChip({ s }: { s: CatalogSymptom }) {
    return (
      <button type="button" onClick={() => addSymptom(s)} className={chipClass(false)}>
        {s.display}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Captured symptoms — a quiet hairline list, no boxes */}
      {value.length > 0 ? (
        <div className="divide-border/60 border-border/60 flex flex-col divide-y border-y">
          {value.map((s, idx) => (
            <SymptomRow
              key={s.symptomCode}
              symptom={s}
              onOpen={() => setOpenIdx(idx)}
              onRemove={() => {
                onChange(value.filter((_, i) => i !== idx));
                setOpenIdx(null);
              }}
            />
          ))}
        </div>
      ) : null}

      {/* Search */}
      <div className="relative">
        <SearchIcon
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2"
          aria-hidden
        />
        <Input
          className="pl-9"
          placeholder={
            value.length ? "Add another symptom…" : "Search symptoms — chest pain, SOB, headache…"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Picker */}
      {catalog === null ? (
        <span className="text-muted-foreground text-[12px]">Loading…</span>
      ) : query.trim() ? (
        <div className="flex flex-wrap gap-2">
          {matches.map((s) => (
            <AddChip key={s.code} s={s} />
          ))}
          {canAddAdHoc ? (
            <button
              type="button"
              onClick={addAdHoc}
              className="rounded-md px-2.5 py-1.5 text-[12.5px] text-amber-700 ring-1 ring-amber-300/70 transition-colors ring-inset hover:bg-amber-50 dark:text-amber-300 dark:ring-amber-500/30"
            >
              Add “{query.trim()}”
            </button>
          ) : null}
          {matches.length === 0 && !canAddAdHoc ? (
            <span className="text-muted-foreground text-[12px]">
              No match — keep typing to add it.
            </span>
          ) : null}
        </div>
      ) : value.length === 0 ? (
        <div className="flex flex-col gap-4">
          {SYSTEM_ORDER.map((sys) => {
            const items = grouped.get(sys);
            if (!items?.length) return null;
            return (
              <div key={sys} className="flex flex-col gap-2">
                <span className={LABEL}>{SYSTEM_LABEL[sys] ?? sys}</span>
                <div className="flex flex-wrap gap-2">
                  {items.map((s) => (
                    <AddChip key={s.code} s={s} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {matches.slice(0, 12).map((s) => (
            <AddChip key={s.code} s={s} />
          ))}
        </div>
      )}

      {/* Generated prose — label + text, no box */}
      {value.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>Reads as</span>
          <p className="text-foreground/90 text-[13px] leading-relaxed">
            {renderSymptomProse(value)}
          </p>
        </div>
      ) : null}

      {/* Properties dialog */}
      <Dialog open={openIdx !== null} onOpenChange={(o) => !o && setOpenIdx(null)}>
        {openSymptom ? (
          <PropertiesDialog
            symptom={openSymptom}
            system={systemByCode.get(openSymptom.symptomCode) ?? ""}
            properties={propsBySymptom[openSymptom.symptomCode] ?? null}
            onChange={(next) => onChange(value.map((s, i) => (i === openIdx ? next : s)))}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function SymptomRow({
  symptom,
  onOpen,
  onRemove,
}: {
  symptom: CapturedSymptom;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const sev = symptom.properties.find((p) => p.valueType === "scale" && p.num != null)?.num;
  const redFlags = symptom.properties.filter(isRedFlagValue).flatMap((p) => p.labels ?? []);
  const summary = summarise(symptom);

  return (
    <div className="group flex items-center gap-3">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col gap-0.5 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-foreground text-[13px] font-medium">{symptom.symptomDisplay}</span>
          {symptom.adHoc ? <span className="text-muted-foreground text-[10px]">new</span> : null}
          {sev != null ? (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px] tabular-nums">
              <span
                className={`size-1.5 rounded-full ${BAND_DOT[severityBand(sev)]}`}
                aria-hidden
              />
              {sev}/10
            </span>
          ) : null}
          {redFlags.length ? (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
              <AlertTriangleIcon className="size-3" aria-hidden />
              {redFlags.length}
            </span>
          ) : null}
        </span>
        <span className="text-muted-foreground truncate text-[12px]">
          {summary || "Tap to add details"}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Remove ${symptom.symptomDisplay}`}
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive shrink-0 rounded-md p-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <XIcon className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

function PropertiesDialog({
  symptom,
  system,
  properties,
  onChange,
}: {
  symptom: CapturedSymptom;
  system: string;
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
  const count =
    symptom.properties.filter(
      (p) =>
        (p.labels?.length ?? 0) > 0 ||
        p.num != null ||
        p.bool != null ||
        p.durationValue != null ||
        p.text?.trim(),
    ).length + (symptom.note?.trim() ? 1 : 0);

  const real = properties ?? [];
  const isSelect = (p: CatalogProperty) =>
    p.valueType === "single_select" || p.valueType === "multi_select";
  const redFlagProps = real.filter(isRedFlagProp);
  const rest = real.filter((p) => !isRedFlagProp(p));
  const compactProps = rest.filter(
    (p) =>
      p.valueType === "boolean" ||
      p.valueType === "duration" ||
      (isSelect(p) && p.options.length <= 5),
  );
  const sliderProps = rest.filter((p) => p.valueType === "scale");
  const wideProps = rest.filter(
    (p) => p.valueType === "text" || (isSelect(p) && p.options.length > 5),
  );

  return (
    <DialogContent
      showCloseButton={false}
      className="gap-0 overflow-hidden rounded-lg p-0 sm:max-w-2xl"
    >
      {/* Header */}
      <div className="border-border/60 flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <DialogTitle className="truncate text-[15px] leading-tight font-semibold">
            {symptom.symptomDisplay}
          </DialogTitle>
          <p className="text-muted-foreground mt-1 text-[11px] leading-tight">
            {symptom.adHoc ? (
              <ProposeAdHoc symptom={symptom} />
            ) : (
              `${SYSTEM_LABEL[system] ?? "Symptom"} · tap the details that apply`
            )}
          </p>
        </div>
        <DialogClose
          aria-label="Close"
          className="text-muted-foreground hover:bg-muted hover:text-foreground -mt-1 -mr-1 shrink-0 rounded-md p-1.5"
        >
          <XIcon className="size-4" aria-hidden />
        </DialogClose>
      </div>

      {/* Body */}
      <div className="max-h-[68vh] overflow-y-auto px-5 py-5">
        {properties === null ? (
          <span className="text-muted-foreground text-[12px]">Loading…</span>
        ) : (
          <div className="flex flex-col gap-6">
            {real.length === 0 ? (
              <p className="text-muted-foreground text-[12px]">
                No catalog properties for this symptom yet — use the note below.
              </p>
            ) : (
              <>
                {compactProps.length ? (
                  <div className="grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
                    {compactProps.map((prop) => (
                      <PropertyControl
                        key={prop.code}
                        prop={prop}
                        current={get(prop.code)}
                        setProp={setProp}
                      />
                    ))}
                  </div>
                ) : null}

                {sliderProps.map((prop) => (
                  <ScaleControl
                    key={prop.code}
                    prop={prop}
                    current={get(prop.code)}
                    setProp={setProp}
                  />
                ))}

                {wideProps.map((prop) => (
                  <PropertyControl
                    key={prop.code}
                    prop={prop}
                    current={get(prop.code)}
                    setProp={setProp}
                  />
                ))}

                {redFlagProps.length ? (
                  <RedFlagSection props={redFlagProps} get={get} setProp={setProp} />
                ) : null}
              </>
            )}

            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Note</span>
              <Input
                placeholder="Anything not captured above…"
                value={symptom.note ?? ""}
                onChange={(e) => onChange({ ...symptom, note: e.target.value })}
              />
            </label>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-border/60 flex items-center justify-between border-t px-5 py-3">
        <span className="text-muted-foreground text-[11px] tabular-nums">
          {count > 0 ? `${count} detail${count > 1 ? "s" : ""}` : "No details yet"}
        </span>
        <DialogClose className="rounded-md bg-teal-600 px-4 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-teal-700">
          Done
        </DialogClose>
      </div>
    </DialogContent>
  );
}

/** Red-flag checklist — its own labelled group; selected flags read as danger. */
function RedFlagSection({
  props,
  get,
  setProp,
}: {
  props: CatalogProperty[];
  get: (code: string) => CapturedPropertyValue | undefined;
  setProp: (code: string, build: (prev?: CapturedPropertyValue) => CapturedPropertyValue) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-medium tracking-[0.12em] text-red-600 uppercase dark:text-red-400">
        <AlertTriangleIcon className="size-3" aria-hidden />
        Red flags — screen before closing
      </span>
      {props.map((prop) => (
        <div key={prop.code} className="flex flex-wrap gap-2">
          <SelectChips prop={prop} current={get(prop.code)} setProp={setProp} tone="danger" />
        </div>
      ))}
    </div>
  );
}

function SelectChips({
  prop,
  current,
  setProp,
  tone = "teal",
}: {
  prop: CatalogProperty;
  current?: CapturedPropertyValue;
  setProp: (code: string, build: (prev?: CapturedPropertyValue) => CapturedPropertyValue) => void;
  tone?: "teal" | "danger";
}) {
  const base = {
    propertyCode: prop.code,
    propertyDisplay: prop.display,
    valueType: prop.valueType,
  };
  return (
    <>
      {prop.options.map((o) => {
        const labels = current?.labels ?? [];
        const active = labels.includes(o.display);
        return (
          <button
            key={o.value}
            type="button"
            className={chipClass(active, tone)}
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
    </>
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
    <div className="flex flex-col gap-2">
      <span className={LABEL}>
        {prop.display}
        {prop.required ? <span className="text-teal-600 dark:text-teal-400"> *</span> : null}
      </span>

      {(prop.valueType === "single_select" || prop.valueType === "multi_select") && (
        <div className="flex flex-wrap gap-2">
          <SelectChips prop={prop} current={current} setProp={setProp} />
        </div>
      )}

      {prop.valueType === "duration" && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="0"
            value={current?.durationValue ?? ""}
            onChange={(e) =>
              setProp(prop.code, (prev) => ({
                ...base,
                durationValue: e.target.value === "" ? undefined : Number(e.target.value),
                durationUnit: prev?.durationUnit,
              }))
            }
            className="border-input bg-card w-14 rounded-md border px-2 py-1.5 text-[12.5px] tabular-nums transition-colors outline-none focus-visible:border-teal-500"
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
        <div className="flex gap-2">
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

/** Severity slider — accent + caption colour track the value (mild→severe). */
function ScaleControl({
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
  const num = current?.num;
  const band: Band | null = num === undefined ? null : severityBand(num);
  const accent =
    band === "high" ? "accent-red-600" : band === "mid" ? "accent-amber-500" : "accent-teal-600";
  const wordColour =
    band === "high"
      ? "text-red-600 dark:text-red-400"
      : band === "mid"
        ? "text-amber-600 dark:text-amber-400"
        : band === "low"
          ? "text-teal-600 dark:text-teal-400"
          : "text-muted-foreground";
  const word =
    band === "high" ? "severe" : band === "mid" ? "moderate" : band === "low" ? "mild" : "not set";

  return (
    <div className="flex flex-col gap-2.5">
      <span className={LABEL}>
        {prop.display}
        {prop.required ? <span className="text-teal-600 dark:text-teal-400"> *</span> : null}
      </span>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          aria-label={prop.display}
          value={num ?? 0}
          onChange={(e) => setProp(prop.code, () => ({ ...base, num: Number(e.target.value) }))}
          className={`h-1.5 flex-1 cursor-pointer ${accent}`}
        />
        <span className="text-foreground w-10 text-right text-[13px] font-semibold tabular-nums">
          {num != null ? `${num}/10` : "–"}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">None</span>
        <span className={`font-medium ${wordColour}`}>{word}</span>
        <span className="text-muted-foreground">Worst</span>
      </div>
    </div>
  );
}

/** Governed contribution: propose this ad-hoc symptom to the shared catalog. */
function ProposeAdHoc({ symptom }: { symptom: CapturedSymptom }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(false);
  if (done) {
    return <span className="text-teal-700 dark:text-teal-400">proposed ✓</span>;
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
      className="text-teal-600 underline decoration-dotted underline-offset-2 hover:text-teal-700 disabled:opacity-50 dark:text-teal-400"
    >
      {pending ? "proposing…" : err ? "retry" : "new · propose to catalog"}
    </button>
  );
}
