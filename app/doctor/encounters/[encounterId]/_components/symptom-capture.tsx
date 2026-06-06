"use client";

import type { CatalogProperty, CatalogSymptom } from "@/lib/clerkship/catalog";
import type { CapturedPropertyValue, CapturedSymptom } from "@/lib/clerkship/symptom-engine";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckIcon, PlusIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";

import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
  "transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-expo-out";

const SECTION_LABEL = "text-muted-foreground text-[10px] font-medium tracking-[0.1em] uppercase";

function pillClass(active: boolean) {
  return [
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium",
    EASE,
    active
      ? "border-teal-500/60 bg-teal-50 text-teal-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:border-teal-400/40 dark:bg-teal-950/40 dark:text-teal-200"
      : "border-border bg-card text-foreground/70 shadow-sm hover:border-teal-300 hover:bg-teal-50/50 hover:text-foreground dark:hover:bg-teal-950/20",
  ].join(" ");
}

/** Attio-style soft pill: a check leads when selected, an optional glyph otherwise. */
function Pill({
  active = false,
  leadingIcon,
  onClick,
  children,
}: {
  active?: boolean;
  leadingIcon?: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={pillClass(active)}>
      {active ? (
        <CheckIcon className="-ml-0.5 size-3.5 shrink-0" aria-hidden />
      ) : leadingIcon ? (
        <span className="text-muted-foreground -ml-0.5 shrink-0">{leadingIcon}</span>
      ) : null}
      <span>{children}</span>
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
                className={`group border-border bg-card inline-flex items-center gap-2 rounded-full border py-1 pr-1 pl-3 shadow-sm ${EASE} hover:border-teal-300 hover:shadow`}
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
                  {count > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-teal-100 px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-teal-700 tabular-nums dark:bg-teal-950/50 dark:text-teal-300">
                      {count}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-[10.5px]">add detail</span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${s.symptomDisplay}`}
                  onClick={() => {
                    onChange(value.filter((_, i) => i !== idx));
                    setOpenIdx(null);
                  }}
                  className="text-muted-foreground hover:bg-muted hover:text-destructive rounded-full p-1"
                >
                  <XIcon className="size-3.5" aria-hidden />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      {/* Search / add */}
      <div className="flex flex-col gap-2.5">
        <div className="relative">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2"
            aria-hidden
          />
          <Input
            className="pl-9"
            placeholder={
              value.length ? "Add another symptom…" : "Search symptoms — chest pain, SOB, fever…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {catalog === null ? (
          <span className="text-muted-foreground text-[12px]">Loading catalog…</span>
        ) : matches.length || canAddAdHoc ? (
          <div className="flex flex-col gap-1.5">
            <span className={SECTION_LABEL}>{query.trim() ? "Matches" : "Common"}</span>
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
                  className={`inline-flex items-center gap-1.5 rounded-full border border-dashed border-amber-400/70 bg-amber-50 px-3 py-1.5 text-[12.5px] font-medium text-amber-800 ${EASE} hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200`}
                >
                  <PlusIcon className="size-3" aria-hidden />
                  Add “{query.trim()}”
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground text-[12px]">
            No match — keep typing to add it.
          </span>
        )}
      </div>

      {/* Generated prose */}
      {value.length > 0 ? (
        <div className="border-border/70 bg-muted/30 rounded-lg border px-3 py-2">
          <span className={SECTION_LABEL}>Reads as</span>
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
  const count = symptom.properties.length + (symptom.note?.trim() ? 1 : 0);

  return (
    <DialogContent
      showCloseButton={false}
      className="gap-0 overflow-hidden rounded-2xl p-0 shadow-2xl shadow-black/10 sm:max-w-md"
    >
      {/* Header */}
      <div className="border-border/70 flex items-center gap-3 border-b px-4 py-3.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600 ring-1 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900/50">
          <SlidersHorizontalIcon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-[15px] leading-tight">
            {symptom.symptomDisplay}
          </DialogTitle>
          <p className="text-muted-foreground mt-0.5 text-[11px] leading-tight">
            {symptom.adHoc ? <ProposeAdHoc symptom={symptom} /> : "Tap the details that apply"}
          </p>
        </div>
        <DialogClose
          aria-label="Close"
          className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1.5"
        >
          <XIcon className="size-4" aria-hidden />
        </DialogClose>
      </div>

      {/* Body */}
      <div className="flex max-h-[58vh] flex-col gap-4 overflow-y-auto px-4 py-4">
        {properties === null ? (
          <span className="text-muted-foreground text-[12px]">Loading properties…</span>
        ) : properties.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center text-[12px]">
            No catalog properties for this symptom yet — use the note below.
          </p>
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

        <label className="flex flex-col gap-1.5">
          <span className={SECTION_LABEL}>Note (optional)</span>
          <Input
            placeholder="Anything not captured above…"
            value={symptom.note ?? ""}
            onChange={(e) => onChange({ ...symptom, note: e.target.value })}
          />
        </label>
      </div>

      {/* Footer */}
      <div className="border-border/70 bg-muted/40 flex items-center justify-between border-t px-4 py-3">
        <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
          {count > 0 ? `${count} detail${count > 1 ? "s" : ""} captured` : "No details yet"}
        </span>
        <DialogClose
          className={`inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-1.5 text-[12.5px] font-medium text-white shadow-sm ${EASE} hover:bg-teal-700`}
        >
          <CheckIcon className="size-3.5" aria-hidden />
          Done
        </DialogClose>
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
    <div className="flex flex-col gap-2">
      <span className={SECTION_LABEL}>
        {prop.display}
        {prop.required ? <span className="text-teal-600 dark:text-teal-400"> *</span> : null}
      </span>

      {(prop.valueType === "single_select" || prop.valueType === "multi_select") && (
        <div className="flex flex-wrap gap-1.5">
          {prop.options.map((o) => {
            const labels = current?.labels ?? [];
            const active = labels.includes(o.display);
            return (
              <Pill
                key={o.value}
                active={active}
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
        </div>
      )}

      {prop.valueType === "scale" && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                type="button"
                className={`size-8 rounded-lg border text-[12px] font-medium tabular-nums ${EASE} ${
                  current?.num === n
                    ? "border-teal-600 bg-teal-600 text-white shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-teal-300"
                }`}
                onClick={() => setProp(prop.code, () => ({ ...base, num: n }))}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="text-muted-foreground flex justify-between px-0.5 text-[9.5px]">
            <span>None</span>
            <span>Worst</span>
          </div>
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
            className={`border-input bg-card focus-visible:ring-ring/40 w-16 rounded-lg border px-2.5 py-1.5 text-[12.5px] tabular-nums outline-none ${EASE} focus-visible:border-teal-500 focus-visible:ring-2`}
          />
          {DURATION_UNITS.map((u) => {
            const active = current?.durationUnit === DURATION_LABEL[u];
            return (
              <button
                key={u}
                type="button"
                className={`rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${EASE} ${
                  active
                    ? "border-teal-500/60 bg-teal-50 text-teal-700 dark:border-teal-400/40 dark:bg-teal-950/40 dark:text-teal-200"
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

/** Governed contribution: propose this ad-hoc symptom to the shared catalog. */
function ProposeAdHoc({ symptom }: { symptom: CapturedSymptom }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(false);
  if (done) {
    return <span className="text-teal-700 dark:text-teal-400">Proposed to catalog ✓</span>;
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
      {pending
        ? "Proposing…"
        : err
          ? "Retry — propose to catalog"
          : "New symptom · propose to catalog"}
    </button>
  );
}
