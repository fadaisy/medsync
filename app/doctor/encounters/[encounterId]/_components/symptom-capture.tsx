"use client";

import type { CatalogProperty, CatalogSymptom } from "@/lib/clerkship/catalog";
import type { CapturedPropertyValue, CapturedSymptom } from "@/lib/clerkship/symptom-engine";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangleIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  loadSymptomCatalogAction,
  loadSymptomPropertiesAction,
  proposeSymptomAction,
} from "../actions";

/**
 * Presenting-complaint composer (addendum: symptom engine). A single field: click
 * it and the symptom catalog drops down (grouped by body system); pick one and it
 * joins a compact list whose properties open inline — dense, no modal. The
 * generated HPC prose is rendered by the form, alongside the clinician's own
 * narrative. Decision-support — it structures, never diagnoses.
 */

const DURATION_UNITS = ["min", "hrs", "days", "wks", "mo"] as const;
const DURATION_LABEL: Record<string, string> = {
  min: "minutes",
  hrs: "hours",
  days: "days",
  wks: "weeks",
  mo: "months",
};

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

function summarise(s: CapturedSymptom): string {
  const parts: string[] = [];
  for (const p of s.properties) {
    if (p.valueType === "scale" || isRedFlagValue(p)) continue;
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

function chipClass(active: boolean, tone: "teal" | "danger" = "teal") {
  const on =
    tone === "danger"
      ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-500/40 dark:bg-red-950/40 dark:text-red-200"
      : "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200";
  const off =
    "text-foreground/70 ring-1 ring-inset ring-border hover:bg-muted/60 hover:text-foreground";
  return [
    "rounded px-2 py-0.5 text-[11.5px] transition-colors duration-150",
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
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      .slice(0, 12);
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

  function addSymptom(code: string, display: string, adHoc = false) {
    const item: CapturedSymptom = { symptomCode: code, symptomDisplay: display, properties: [] };
    if (adHoc) item.adHoc = true;
    onChange([...value, item]);
    setExpanded(value.length); // open the new one's properties
    setQuery("");
    setOpen(false);
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
    addSymptom(slug, name, true);
  }

  function updateSymptom(idx: number, next: CapturedSymptom) {
    onChange(value.map((s, i) => (i === idx ? next : s)));
  }

  function openMenu() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setOpen(true);
  }
  function deferClose() {
    blurTimer.current = setTimeout(() => setOpen(false), 130);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The single field — click to reveal the catalog */}
      <div className="relative">
        <SearchIcon
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2"
          aria-hidden
        />
        <Input
          className="pl-9"
          placeholder="Click to choose a symptom — chest pain, SOB, headache…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={openMenu}
          onBlur={deferClose}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        />

        {open ? (
          <div
            className="border-border bg-popover absolute top-full right-0 left-0 z-20 mt-1.5 max-h-72 overflow-y-auto rounded-lg border p-1.5 shadow-lg"
            onMouseDown={(e) => e.preventDefault()}
          >
            {catalog === null ? (
              <p className="text-muted-foreground px-2 py-1.5 text-[12px]">Loading…</p>
            ) : query.trim() ? (
              <>
                {matches.map((s) => (
                  <MenuItem key={s.code} onClick={() => addSymptom(s.code, s.display)}>
                    {s.display}
                    <span className="text-muted-foreground ml-auto text-[10px]">
                      {SYSTEM_LABEL[s.system] ?? s.system}
                    </span>
                  </MenuItem>
                ))}
                {canAddAdHoc ? (
                  <MenuItem onClick={addAdHoc}>
                    <span className="text-amber-700 dark:text-amber-300">Add “{query.trim()}”</span>
                    <span className="text-muted-foreground ml-auto text-[10px]">
                      not in catalog
                    </span>
                  </MenuItem>
                ) : null}
                {matches.length === 0 && !canAddAdHoc ? (
                  <p className="text-muted-foreground px-2 py-1.5 text-[12px]">No match.</p>
                ) : null}
              </>
            ) : (
              SYSTEM_ORDER.map((sys) => {
                const items = grouped.get(sys);
                if (!items?.length) return null;
                return (
                  <div key={sys} className="mb-1 last:mb-0">
                    <p className="text-muted-foreground px-2 pt-1.5 pb-1 text-[10px] font-medium tracking-[0.1em] uppercase">
                      {SYSTEM_LABEL[sys] ?? sys}
                    </p>
                    {items.map((s) => (
                      <MenuItem key={s.code} onClick={() => addSymptom(s.code, s.display)}>
                        {s.display}
                      </MenuItem>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      {/* Selected symptoms — compact list with inline properties */}
      {value.length > 0 ? (
        <div className="border-border/60 divide-border/60 flex flex-col divide-y rounded-lg border">
          {value.map((s, idx) => {
            const sev = s.properties.find((p) => p.valueType === "scale" && p.num != null)?.num;
            const redFlags = s.properties.filter(isRedFlagValue).flatMap((p) => p.labels ?? []);
            const summary = summarise(s);
            const isOpen = expanded === idx;
            return (
              <div key={s.symptomCode}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : idx)}
                    className="hover:bg-muted/40 flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-left"
                  >
                    <ChevronDownIcon
                      className={`text-muted-foreground size-3.5 shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                      aria-hidden
                    />
                    <span className="text-foreground text-[13px] font-medium">
                      {s.symptomDisplay}
                    </span>
                    {s.adHoc ? (
                      <span className="text-muted-foreground text-[10px]">new</span>
                    ) : null}
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
                    {!isOpen && summary ? (
                      <span className="text-muted-foreground ml-1 truncate text-[12px]">
                        — {summary}
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${s.symptomDisplay}`}
                    onClick={() => {
                      onChange(value.filter((_, i) => i !== idx));
                      setExpanded(null);
                    }}
                    className="text-muted-foreground hover:text-destructive mr-1.5 shrink-0 rounded-md p-1"
                  >
                    <XIcon className="size-3.5" aria-hidden />
                  </button>
                </div>
                {isOpen ? (
                  <div className="border-border/50 border-t px-3 py-3">
                    <CompactProps
                      symptom={s}
                      properties={propsBySymptom[s.symptomCode] ?? null}
                      onChange={(next) => updateSymptom(idx, next)}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-muted/70 text-foreground flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px]"
    >
      {children}
    </button>
  );
}

/** Dense, inline property editor — label-aligned rows, no modal. */
function CompactProps({
  symptom,
  properties,
  onChange,
}: {
  symptom: CapturedSymptom;
  properties: CatalogProperty[] | null;
  onChange: (next: CapturedSymptom) => void;
}) {
  function setProp(code: string, build: (prev?: CapturedPropertyValue) => CapturedPropertyValue) {
    const prev = symptom.properties.find((p) => p.propertyCode === code);
    const others = symptom.properties.filter((p) => p.propertyCode !== code);
    onChange({ ...symptom, properties: [...others, build(prev)] });
  }
  const get = (code: string) => symptom.properties.find((p) => p.propertyCode === code);

  if (properties === null) {
    return <p className="text-muted-foreground text-[12px]">Loading…</p>;
  }
  if (properties.length === 0) {
    return (
      <Row label="Note">
        <input
          value={symptom.note ?? ""}
          onChange={(e) => onChange({ ...symptom, note: e.target.value })}
          placeholder="No catalog properties — describe here…"
          className="border-input bg-card w-full rounded-md border px-2 py-1 text-[12px] outline-none focus-visible:border-teal-500"
        />
      </Row>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {properties.map((prop) => (
        <Row key={prop.code} label={prop.display} danger={isRedFlagProp(prop)}>
          <PropControl prop={prop} current={get(prop.code)} setProp={setProp} />
        </Row>
      ))}
      <Row label="Note">
        <input
          value={symptom.note ?? ""}
          onChange={(e) => onChange({ ...symptom, note: e.target.value })}
          placeholder="Anything else…"
          className="border-input bg-card w-full rounded-md border px-2 py-1 text-[12px] outline-none focus-visible:border-teal-500"
        />
      </Row>
      {symptom.adHoc ? (
        <Row label="Catalog">
          <ProposeAdHoc symptom={symptom} />
        </Row>
      ) : null}
    </div>
  );
}

function Row({
  label,
  danger,
  children,
}: {
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className={`w-24 shrink-0 text-[10px] font-medium tracking-[0.08em] uppercase ${
          danger
            ? "inline-flex items-center gap-1 text-red-600 dark:text-red-400"
            : "text-muted-foreground"
        }`}
      >
        {danger ? <AlertTriangleIcon className="size-2.5" aria-hidden /> : null}
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

function PropControl({
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
  const tone = isRedFlagProp(prop) ? "danger" : "teal";

  if (prop.valueType === "single_select" || prop.valueType === "multi_select") {
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

  if (prop.valueType === "scale") {
    const num = current?.num;
    const band = num == null ? null : severityBand(num);
    const accent =
      band === "high" ? "accent-red-600" : band === "mid" ? "accent-amber-500" : "accent-teal-600";
    return (
      <div className="flex w-full items-center gap-2">
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          aria-label={prop.display}
          value={num ?? 0}
          onChange={(e) => setProp(prop.code, () => ({ ...base, num: Number(e.target.value) }))}
          className={`h-1 flex-1 cursor-pointer ${accent}`}
        />
        <span className="text-foreground w-9 text-right text-[11.5px] font-medium tabular-nums">
          {num != null ? `${num}/10` : "–"}
        </span>
      </div>
    );
  }

  if (prop.valueType === "duration") {
    return (
      <>
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
          className="border-input bg-card w-12 rounded px-1.5 py-0.5 text-[11.5px] tabular-nums outline-none focus-visible:border-teal-500"
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
      </>
    );
  }

  if (prop.valueType === "boolean") {
    return (
      <>
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
      </>
    );
  }

  return (
    <input
      value={current?.text ?? ""}
      onChange={(e) => setProp(prop.code, () => ({ ...base, text: e.target.value }))}
      className="border-input bg-card w-full rounded px-1.5 py-0.5 text-[11.5px] outline-none focus-visible:border-teal-500"
    />
  );
}

/** Governed contribution: propose this ad-hoc symptom to the shared catalog. */
function ProposeAdHoc({ symptom }: { symptom: CapturedSymptom }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(false);
  if (done) return <span className="text-[11px] text-teal-700 dark:text-teal-400">proposed ✓</span>;
  return (
    <button
      type="button"
      disabled={pending}
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
      className="text-[11px] text-teal-600 underline decoration-dotted underline-offset-2 hover:text-teal-700 disabled:opacity-50 dark:text-teal-400"
    >
      {pending ? "proposing…" : err ? "retry" : "propose to catalog"}
    </button>
  );
}
