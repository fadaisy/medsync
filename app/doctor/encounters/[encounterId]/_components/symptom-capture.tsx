"use client";

import type { CatalogProperty, CatalogSymptom } from "@/lib/clerkship/catalog";
import type { CapturedPropertyValue, CapturedSymptom } from "@/lib/clerkship/symptom-engine";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangleIcon,
  BrainIcon,
  ChevronRightIcon,
  HeartPulseIcon,
  PencilLineIcon,
  PlusIcon,
  SearchIcon,
  SoupIcon,
  StethoscopeIcon,
  ThermometerIcon,
  WindIcon,
  XIcon,
} from "lucide-react";

import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { renderSymptomProse } from "@/lib/clerkship/symptom-engine";
import {
  loadSymptomCatalogAction,
  loadSymptomPropertiesAction,
  proposeSymptomAction,
} from "../actions";

/**
 * Presenting-complaint composer (addendum: symptom engine). Search or tap a
 * symptom from the body-system palette → it becomes a card showing a live
 * clinical summary, a severity band, and a red-flag signal. Tap the card →
 * a dialog laying its Hutchison's properties out by shape, with the red-flag
 * checklist in its own danger section. Near-zero typing; the whole complaint is
 * rendered as prose. Decision-support: it structures the history, never diagnoses.
 */

const DURATION_UNITS = ["min", "hrs", "days", "wks", "mo"] as const;
const DURATION_LABEL: Record<string, string> = {
  min: "minutes",
  hrs: "hours",
  days: "days",
  wks: "weeks",
  mo: "months",
};

const EASE = "transition-[color,background-color,border-color] duration-150 ease-expo-out";
const SECTION_LABEL = "text-muted-foreground text-[10px] font-medium tracking-[0.1em] uppercase";

const SYSTEM_ORDER = [
  "cardiovascular",
  "respiratory",
  "gastrointestinal",
  "neurological",
  "general",
] as const;

const SYSTEMS: Record<string, { label: string; Icon: ComponentType<{ className?: string }> }> = {
  cardiovascular: { label: "Cardiovascular", Icon: HeartPulseIcon },
  respiratory: { label: "Respiratory", Icon: WindIcon },
  gastrointestinal: { label: "Gastrointestinal", Icon: SoupIcon },
  neurological: { label: "Neurological", Icon: BrainIcon },
  general: { label: "General", Icon: ThermometerIcon },
};
const sysMeta = (system: string) => SYSTEMS[system] ?? { label: system, Icon: StethoscopeIcon };

type Band = "low" | "mid" | "high";
const severityBand = (n: number): Band => (n <= 3 ? "low" : n <= 6 ? "mid" : "high");
const BAND_PILL: Record<Band, string> = {
  low: "border-teal-500/60 bg-teal-50 text-teal-700 dark:border-teal-400/40 dark:bg-teal-950/40 dark:text-teal-200",
  mid: "border-amber-500/60 bg-amber-50 text-amber-700 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-200",
  high: "border-red-500/60 bg-red-50 text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-200",
};
const BAND_WORD: Record<Band, string> = { low: "mild", mid: "moderate", high: "severe" };

const isRedFlagProp = (p: CatalogProperty) =>
  p.code.endsWith("redflags") || p.display.toLowerCase().includes("red flag");
const isRedFlagValue = (p: CapturedPropertyValue) =>
  p.propertyCode.endsWith("redflags") || p.propertyDisplay.toLowerCase().includes("red flag");

/** A compact "central · crushing · radiating to left arm" summary for the card. */
function summarise(s: CapturedSymptom): string {
  const parts: string[] = [];
  for (const p of s.properties) {
    if (p.valueType === "scale" || isRedFlagValue(p)) continue; // severity → pill, red flags → badge
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

function pillClass(active: boolean, tone: "teal" | "danger" = "teal") {
  const on =
    tone === "danger"
      ? "border-red-500 bg-red-50 text-red-700 dark:border-red-400/50 dark:bg-red-950/40 dark:text-red-200"
      : "border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-400/50 dark:bg-teal-950/40 dark:text-teal-200";
  const off =
    tone === "danger"
      ? "border-border bg-card text-foreground/75 hover:border-red-300 hover:bg-red-50/50 hover:text-red-700 dark:hover:bg-red-950/20"
      : "border-border bg-card text-foreground/75 hover:border-teal-300 hover:bg-teal-50/50 hover:text-foreground dark:hover:bg-teal-950/20";
  return [
    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px]",
    EASE,
    active ? on : off,
  ].join(" ");
}

function Pill({
  active = false,
  tone = "teal",
  leadingIcon,
  onClick,
  children,
}: {
  active?: boolean;
  tone?: "teal" | "danger";
  leadingIcon?: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={pillClass(active, tone)}>
      {leadingIcon ? <span className="-ml-0.5 shrink-0 opacity-60">{leadingIcon}</span> : null}
      {children}
    </button>
  );
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

  return (
    <div className="flex flex-col gap-3">
      {/* Added symptom cards */}
      {value.length > 0 ? (
        <div className="flex flex-col gap-2">
          {value.map((s, idx) => (
            <SymptomCard
              key={s.symptomCode}
              symptom={s}
              system={systemByCode.get(s.symptomCode) ?? ""}
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
        <span className="text-muted-foreground text-[12px]">Loading catalog…</span>
      ) : query.trim() ? (
        <div className="flex flex-wrap gap-1.5">
          {matches.map((s) => (
            <Pill
              key={s.code}
              leadingIcon={<PlusIcon className="size-3" aria-hidden />}
              onClick={() => addSymptom(s)}
            >
              {s.display}
            </Pill>
          ))}
          {canAddAdHoc ? (
            <button
              type="button"
              onClick={addAdHoc}
              className={`inline-flex items-center gap-1 rounded-md border border-dashed border-amber-400/70 bg-amber-50 px-2 py-1 text-[12px] text-amber-800 ${EASE} hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200`}
            >
              <PlusIcon className="size-3" aria-hidden />
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
        // Full body-system palette (the inviting menu).
        <div className="flex flex-col gap-2.5">
          {SYSTEM_ORDER.map((sys) => {
            const items = grouped.get(sys);
            if (!items?.length) return null;
            const { label, Icon } = sysMeta(sys);
            return (
              <div key={sys} className="flex flex-col gap-1.5">
                <div className="text-muted-foreground flex items-center gap-1.5">
                  <Icon className="size-3.5" aria-hidden />
                  <span className={SECTION_LABEL}>{label}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((s) => (
                    <Pill
                      key={s.code}
                      leadingIcon={<PlusIcon className="size-3" aria-hidden />}
                      onClick={() => addSymptom(s)}
                    >
                      {s.display}
                    </Pill>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Compact "add more" row once the complaint is under way.
        <div className="flex flex-wrap gap-1.5">
          {matches.slice(0, 12).map((s) => (
            <Pill
              key={s.code}
              leadingIcon={<PlusIcon className="size-3" aria-hidden />}
              onClick={() => addSymptom(s)}
            >
              {s.display}
            </Pill>
          ))}
        </div>
      )}

      {/* Generated prose */}
      {value.length > 0 ? (
        <div className="border-border/70 bg-muted/30 rounded-md border px-3 py-2">
          <span className={SECTION_LABEL}>Presenting complaint reads as</span>
          <p className="text-foreground mt-1 text-[12.5px] leading-relaxed">
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

function SymptomCard({
  symptom,
  system,
  onOpen,
  onRemove,
}: {
  symptom: CapturedSymptom;
  system: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { Icon } = sysMeta(system);
  const sev = symptom.properties.find((p) => p.valueType === "scale" && p.num != null)?.num;
  const redFlags = symptom.properties.filter(isRedFlagValue).flatMap((p) => p.labels ?? []);
  const summary = summarise(symptom);

  return (
    <div
      className={`border-border bg-card flex items-stretch overflow-hidden rounded-lg border ${EASE} hover:border-teal-300`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="hover:bg-muted/40 flex flex-1 items-start gap-2.5 px-3 py-2.5 text-left"
      >
        <span
          className="text-muted-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center"
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-foreground text-[13px] font-semibold">
              {symptom.symptomDisplay}
            </span>
            {symptom.adHoc ? (
              <span className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[8.5px] tracking-wide text-amber-800 uppercase dark:bg-amber-950/40 dark:text-amber-200">
                new
              </span>
            ) : null}
            {sev != null ? (
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${BAND_PILL[severityBand(sev)]}`}
              >
                {sev}/10 {BAND_WORD[severityBand(sev)]}
              </span>
            ) : null}
            {redFlags.length ? (
              <span className="inline-flex items-center gap-0.5 rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-300">
                <AlertTriangleIcon className="size-2.5" aria-hidden />
                {redFlags.length} red flag{redFlags.length > 1 ? "s" : ""}
              </span>
            ) : null}
          </span>
          <span className="text-muted-foreground mt-0.5 flex items-center gap-1 text-[12px]">
            {summary ? (
              <span className="truncate">{summary}</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400">
                <PencilLineIcon className="size-3" aria-hidden /> Tap to add details
              </span>
            )}
            {summary ? <ChevronRightIcon className="size-3 shrink-0" aria-hidden /> : null}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`Remove ${symptom.symptomDisplay}`}
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive hover:bg-muted/40 border-border/70 border-l px-2.5"
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

  const { label: sysLabel, Icon } = sysMeta(system);
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
      <div className="border-border/70 flex items-center gap-3 border-b px-4 py-3">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600 ring-1 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900/50"
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-[15px] leading-tight">
            {symptom.symptomDisplay}
          </DialogTitle>
          <p className="text-muted-foreground mt-0.5 text-[11px] leading-tight">
            {symptom.adHoc ? (
              <ProposeAdHoc symptom={symptom} />
            ) : (
              `${sysLabel} · tap the details that apply`
            )}
          </p>
        </div>
        <DialogClose
          aria-label="Close"
          className="text-muted-foreground hover:bg-muted hover:text-foreground -mr-1 rounded-md p-1.5"
        >
          <XIcon className="size-4" aria-hidden />
        </DialogClose>
      </div>

      {/* Body */}
      <div className="max-h-[68vh] overflow-y-auto px-4 py-4">
        {properties === null ? (
          <span className="text-muted-foreground text-[12px]">Loading properties…</span>
        ) : (
          <div className="flex flex-col gap-5">
            {real.length === 0 ? (
              <p className="text-muted-foreground text-[12px]">
                No catalog properties for this symptom yet — use the note below.
              </p>
            ) : (
              <>
                {compactProps.length ? (
                  <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
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

                {wideProps.length ? (
                  <div className="border-border/60 flex flex-col gap-4 border-t pt-4">
                    {wideProps.map((prop) => (
                      <PropertyControl
                        key={prop.code}
                        prop={prop}
                        current={get(prop.code)}
                        setProp={setProp}
                      />
                    ))}
                  </div>
                ) : null}

                {redFlagProps.length ? (
                  <RedFlagSection props={redFlagProps} get={get} setProp={setProp} />
                ) : null}
              </>
            )}

            <label className="border-border/60 flex flex-col gap-1.5 border-t pt-4">
              <span className={SECTION_LABEL}>Note (optional)</span>
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
      <div className="border-border/70 bg-muted/40 flex items-center justify-between border-t px-4 py-2.5">
        <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
          {count > 0 ? `${count} detail${count > 1 ? "s" : ""} captured` : "No details yet"}
        </span>
        <DialogClose
          className={`rounded-md bg-teal-600 px-3.5 py-1.5 text-[12px] font-medium text-white ${EASE} hover:bg-teal-700`}
        >
          Done
        </DialogClose>
      </div>
    </DialogContent>
  );
}

/** Red-flag checklist — a distinct safety section; selected flags read as danger. */
function RedFlagSection({
  props,
  get,
  setProp,
}: {
  props: CatalogProperty[];
  get: (code: string) => CapturedPropertyValue | undefined;
  setProp: (code: string, build: (prev?: CapturedPropertyValue) => CapturedPropertyValue) => void;
}) {
  const anySelected = props.some((p) => (get(p.code)?.labels?.length ?? 0) > 0);
  return (
    <div className="rounded-lg border border-amber-300/70 bg-amber-50/50 p-3 dark:border-amber-500/30 dark:bg-amber-950/20">
      <div className="mb-2 flex items-center gap-1.5">
        <AlertTriangleIcon className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
        <span className="text-[10px] font-medium tracking-[0.1em] text-amber-700 uppercase dark:text-amber-400">
          Red flags — screen before closing
        </span>
        {anySelected ? (
          <span className="ml-auto rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
            flagged
          </span>
        ) : null}
      </div>
      {props.map((prop) => (
        <div key={prop.code} className="flex flex-wrap gap-1.5">
          <SelectChips prop={prop} current={get(prop.code)} setProp={setProp} tone="danger" />
        </div>
      ))}
    </div>
  );
}

/** Single / multi select rendered as toggle chips (teal, or danger for red flags). */
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
          <Pill
            key={o.value}
            active={active}
            tone={tone}
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
          </Pill>
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
      <span className={SECTION_LABEL}>
        {prop.display}
        {prop.required ? <span className="text-teal-600 dark:text-teal-400"> *</span> : null}
      </span>

      {(prop.valueType === "single_select" || prop.valueType === "multi_select") && (
        <div className="flex flex-wrap gap-1.5">
          <SelectChips prop={prop} current={current} setProp={setProp} />
        </div>
      )}

      {prop.valueType === "duration" && (
        <div className="flex flex-wrap items-center gap-1.5">
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
            className={`border-input bg-card w-14 rounded-md border px-2 py-1 text-[12px] tabular-nums outline-none ${EASE} focus-visible:border-teal-500`}
          />
          {DURATION_UNITS.map((u) => {
            const active = current?.durationUnit === DURATION_LABEL[u];
            return (
              <button
                key={u}
                type="button"
                className={`rounded-md border px-2.5 py-1 text-[11.5px] font-medium ${EASE} ${
                  active
                    ? "border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-400/50 dark:bg-teal-950/40 dark:text-teal-200"
                    : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-teal-300"
                }`}
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
            );
          })}
        </div>
      )}

      {prop.valueType === "boolean" && (
        <div className="flex gap-1.5">
          {[
            { label: "Yes", v: true },
            { label: "No", v: false },
          ].map((opt) => (
            <Pill
              key={opt.label}
              active={current?.bool === opt.v}
              onClick={() =>
                setProp(prop.code, (prev) => ({
                  ...base,
                  bool: prev?.bool === opt.v ? undefined : opt.v,
                }))
              }
            >
              {opt.label}
            </Pill>
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

/**
 * Severity slider whose colour tracks the value — teal (mild) → amber (moderate)
 * → red (severe). The band is a clinical signal (intensity), not decoration.
 */
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
  const badge = band === null ? "border-border text-muted-foreground" : BAND_PILL[band];
  const wordColour =
    band === "high"
      ? "text-red-600 dark:text-red-400"
      : band === "mid"
        ? "text-amber-600 dark:text-amber-400"
        : band === "low"
          ? "text-teal-600 dark:text-teal-400"
          : "text-muted-foreground";

  return (
    <div className="flex flex-col gap-2">
      <span className={SECTION_LABEL}>
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
        <span
          className={`flex h-7 w-9 shrink-0 items-center justify-center rounded-md border text-[13px] font-semibold tabular-nums ${badge}`}
        >
          {num ?? "–"}
        </span>
      </div>
      <div className="flex items-center justify-between px-0.5 text-[9.5px]">
        <span className="text-muted-foreground">0 · None</span>
        <span className={`font-medium ${wordColour}`}>{band ? BAND_WORD[band] : "Not set"}</span>
        <span className="text-muted-foreground">10 · Worst</span>
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
    return <span className="text-[11px] text-teal-700 dark:text-teal-400">proposed ✓</span>;
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
      className="text-[11px] text-teal-600 underline decoration-dotted underline-offset-2 hover:text-teal-700 disabled:opacity-50 dark:text-teal-400"
    >
      {pending ? "proposing…" : err ? "retry" : "new · propose to catalog"}
    </button>
  );
}
