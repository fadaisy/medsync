"use client";

import type { SymptomMeta } from "./diagnosis-reconciliation";
import type { NcdSuggestion } from "@/lib/clerkship/diagnosis/ncd-suggest";
import type { CatalogSearchResult } from "@/lib/clerkship/diagnosis/search";
import type { DiagnosisSuggestion } from "@/lib/clerkship/diagnosis/suggest";
import type { BpStandard } from "@/lib/clerkship/exam/bp";
import type { RecordedVitals } from "@/lib/clerkship/exam/types";
import type { CapturedStateInput } from "@/lib/clerkship/reasoning/context";
import type { ScoredDifferential } from "@/lib/clerkship/reasoning/types";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIcon,
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowDownToLineIcon,
  ArrowUpIcon,
  BrainCircuitIcon,
  CheckIcon,
  ChevronDownIcon,
  ListChecksIcon,
  MinusIcon,
  PauseCircleIcon,
  PlusIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { assembleClerkshipAbnormal } from "@/lib/clerkship/assemble";
import { matchNcds } from "@/lib/clerkship/diagnosis/ncd-suggest";
import { suggestDiagnoses } from "@/lib/clerkship/diagnosis/suggest";
import { buildCapturedContext } from "@/lib/clerkship/reasoning/context";
import { diagnosticPausePrompts, liveReasoningForCodes } from "@/lib/clerkship/reasoning/engine";
import { REASONING_MAPS } from "@/lib/clerkship/reasoning/maps";
import { renderProblemRepresentation } from "@/lib/clerkship/synthesis";
import { ICD10_CODES } from "@/lib/encounter/reference-codes";
import { cn } from "@/lib/utils";
import {
  loadClerkshipPicklistsAction,
  loadRosCatalogAction,
  loadSymptomCatalogAction,
} from "../actions";
import { CodeCombobox } from "./code-combobox";
import { DiagnosisPicker } from "./diagnosis-picker";
import { DiagnosisFeatures } from "./diagnosis-reconciliation";
import { RichTextEditor } from "./rich-text";

/**
 * Assessment — the clerkship's convergence (GATE A-signed model), three sections,
 * all DECISION-SUPPORT (assemble + propose; the clinician decides):
 *
 *  1. CLINICAL PICTURE — every finding already flagged abnormal, assembled
 *     vitals-up with provenance, sitting directly above the editable one-liner it
 *     summarises (one tap pulls the assembled representation in — never auto-set,
 *     never invents a finding).
 *  2. DIAGNOSIS — the reasoning engine's ranked, evidence-backed suggestions
 *     (chronic NCDs + acute), Select (records the CLINICIAN'S working diagnosis,
 *     carrying the catalog ICD-10) / Reject (kept visible as considered & excluded;
 *     must-not-miss never silently dropped), plus the catalog picker / free add.
 *  3. WORKING DIAGNOSES — the record of decisions: each is an editable row
 *     (name · ICD-10 · must-not-miss · remove) with its supporting-feature
 *     reconciliation inline (present ✓ / tap a missing symptom to capture it).
 *     The diagnosis of record is always the clinician's.
 */

export type DxRow = { text: string; icd10: string; mustNotMiss: boolean };
export type ExcludedDx = { text: string; mustNotMiss: boolean };

const SOURCE_LABEL: Record<string, string> = {
  vitals: "Vitals",
  examination: "Examination",
  ros: "ROS",
  background: "Background",
};

/** Short clinical tags for diagnosis evidence kinds. */
const EVIDENCE_TAG: Record<string, string> = {
  feature: "For",
  symptom: "Sx",
  risk: "Risk",
  against: "Against",
};

export function AssessmentSynthesis({
  captured,
  pcCodes,
  vitals,
  bpStandard,
  differential,
  excluded,
  conditionCodes,
  summary,
  onSummaryChange,
  onAgree,
  onExclude,
  onUnexclude,
  onPickDiagnosis,
  onCaptureSymptom,
  onDifferentialChange,
}: {
  captured: CapturedStateInput;
  pcCodes: string[];
  vitals: RecordedVitals;
  bpStandard: BpStandard;
  differential: DxRow[];
  excluded: ExcludedDx[];
  /** Real PMH condition CODES (picklist codes — not display strings) for NCD
   *  risk-factor matching. From the form's pmhItems[].code + pmhScreen yes-keys. */
  conditionCodes: string[];
  /** The editable problem-representation / one-liner (co-located with abnormals). */
  summary: string;
  onSummaryChange: (s: string) => void;
  onAgree: (dx: ScoredDifferential) => void;
  onExclude: (dx: ScoredDifferential) => void;
  onUnexclude: (text: string) => void;
  /** Commit a diagnosis chosen from the catalog picker (same path as Select). */
  onPickDiagnosis: (r: CatalogSearchResult) => void;
  /** Capture a missing supporting symptom (reconciliation) as a present ROS row. */
  onCaptureSymptom: (obs: { symptomCode: string; symptomDisplay: string; system: string }) => void;
  /** Edit the committed working-diagnoses list (remove / toggle / free-text add). */
  onDifferentialChange: (rows: DxRow[]) => void;
}) {
  // ── code→display(+system) maps for diagnosis feature reconciliation ──
  // Loaded once from the live catalogs (ROS + HPC symptoms, condition picklist).
  const [symptomMeta, setSymptomMeta] = useState<Map<string, SymptomMeta>>(new Map());
  const [conditionMeta, setConditionMeta] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [ros, hpc, picklists] = await Promise.all([
          loadRosCatalogAction(),
          loadSymptomCatalogAction(),
          loadClerkshipPicklistsAction(),
        ]);
        if (!live) return;
        const sym = new Map<string, SymptomMeta>();
        for (const s of hpc) sym.set(s.code, { display: s.display, system: s.system });
        for (const s of ros) sym.set(s.code, { display: s.display, system: s.system }); // ROS wins (has system)
        setSymptomMeta(sym);
        setConditionMeta(new Map((picklists.condition ?? []).map((c) => [c.code, c.display])));
      } catch {
        // honest: reconciliation renders with codes only if catalogs can't load.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // ── the assembled abnormals (vitals-up; the shared single-source assembly,
  //    reused by the disposition cross-check so the two can never disagree) ──
  const items = useMemo(
    () => assembleClerkshipAbnormal(captured, vitals, bpStandard),
    [captured, vitals, bpStandard],
  );

  // ── the reasoning engine's live differential (the rail's same computation) ──
  const reasoning = useMemo(
    () => liveReasoningForCodes(REASONING_MAPS, pcCodes, buildCapturedContext(captured)),
    [pcCodes, captured],
  );

  const decidedTexts = useMemo(
    () =>
      new Set([
        ...differential.map((d) => d.text.trim().toLowerCase()),
        ...excluded.map((d) => d.text.trim().toLowerCase()),
      ]),
    [differential, excluded],
  );

  // ── the diagnostic-logic suggestions — the reasoning engine's scored
  //    differential joined with the catalog (ICD-10 + provenance), ranked by
  //    support; must-not-miss floats regardless; decided ones drop out ──
  const suggestionList = useMemo(
    () =>
      suggestDiagnoses(reasoning.scored).filter(
        (s) => !decidedTexts.has(s.dx.trim().toLowerCase()),
      ),
    [reasoning.scored, decidedTexts],
  );

  const representation = renderProblemRepresentation(items);

  // ── captured code sets — shared by NCD matching + diagnosis reconciliation ──
  const capturedSymptomCodes = useMemo(
    () =>
      new Set<string>([
        ...captured.hpcItems.map((h) => h.symptomCode),
        ...captured.ros.filter((o) => o.status === "present").map((o) => o.symptomCode),
      ]),
    [captured],
  );
  // Real condition CODES (picklist codes), not normalised display strings — so a
  // risk factor like "diabetes_t2" actually matches a captured PMH item.
  const capturedConditionCodes = useMemo(() => new Set(conditionCodes), [conditionCodes]);

  // ── the NCD layer — chronic conditions supported by the captured clerkship,
  //    ranked by support, with cited defining criteria (criteria inform, never
  //    auto-diagnose; needs_cso_input thresholds stay flagged) ──
  const ncdSuggestions = useMemo(
    () =>
      matchNcds({
        symptomCodes: capturedSymptomCodes,
        conditionCodes: capturedConditionCodes,
      }).filter((n) => !decidedTexts.has(n.dx.trim().toLowerCase())),
    [capturedSymptomCodes, capturedConditionCodes, decidedTexts],
  );

  // Select a suggestion = the clinician's working diagnosis (carries the catalog
  // ICD-10); Reject = considered & excluded (must-not-miss retained).
  const selectSuggestion = (sg: DiagnosisSuggestion) => {
    const s = reasoning.scored.find((x) => x.dx === sg.dx);
    if (s) onAgree(s);
  };
  const rejectSuggestion = (sg: DiagnosisSuggestion) => {
    const s = reasoning.scored.find((x) => x.dx === sg.dx);
    if (s) onExclude(s);
  };

  // ── working-diagnoses list edits (the record of decisions) ──
  const insertAssembled = () =>
    onSummaryChange(summary.trim() ? `${summary.trim()}\n\n${representation}` : representation);
  const setRow = (i: number, next: DxRow) =>
    onDifferentialChange(differential.map((r, j) => (j === i ? next : r)));
  const removeRow = (i: number) => onDifferentialChange(differential.filter((_, j) => j !== i));
  const addRow = () =>
    onDifferentialChange([...differential, { text: "", icd10: "", mustNotMiss: false }]);

  const nothingToDecide =
    suggestionList.length === 0 && ncdSuggestions.length === 0 && excluded.length === 0;

  // ── the reasoning aids folded in from the (now-hidden-on-this-step) rail ──
  const fired = reasoning.basis.length > 0;
  const mnmCount = reasoning.scored.filter((d) => d.likelihood === "must_not_miss").length;

  return (
    <div className="flex flex-col gap-4">
      {/* ── 1 · Clinical picture — abnormals (vitals-up) + the one-liner ── */}
      <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-3.5 shadow-sm">
        <h4 className="font-display text-foreground inline-flex items-center gap-1.5 text-[13px] font-medium">
          <ActivityIcon className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
          Clinical picture
        </h4>

        {items.length === 0 ? (
          <p className="text-muted-foreground text-[12px]">
            Nothing flagged abnormal yet — abnormal vitals, positive findings, cluster patterns, ROS
            positives and active background assemble here as you capture them. Not-examined is never
            summarised as normal.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {(["vitals", "examination", "ros", "background"] as const).map((src) => {
              const inSrc = items.filter((i) => i.source === src);
              if (!inSrc.length) return null;
              return (
                <div key={src} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-muted-foreground w-24 shrink-0 font-mono text-[9.5px] tracking-[0.12em] uppercase">
                    {SOURCE_LABEL[src]}
                  </span>
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {inSrc.map((i, n) => (
                      <span
                        key={`${i.label}-${n}`}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] ring-1 ring-inset",
                          i.severity === "critical"
                            ? "bg-red-50 text-red-700 ring-red-500/30 dark:bg-red-950/30 dark:text-red-300"
                            : i.severity === "borderline"
                              ? "bg-amber-50 text-amber-800 ring-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300"
                              : "bg-muted/40 text-foreground/80 ring-border",
                        )}
                        title={i.detail}
                      >
                        {i.mustNotMiss ? (
                          <AlertTriangleIcon className="size-3" aria-label="must-not-miss" />
                        ) : null}
                        {i.label}
                        {i.detail ? (
                          <span className="text-muted-foreground/80 text-[9.5px]">{i.detail}</span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* the editable one-liner, co-located with the abnormals it summarises */}
        <div className="border-border/60 flex flex-col gap-1.5 border-t pt-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-[11.5px]">Working summary / one-liner</span>
            {representation ? (
              <button
                type="button"
                onClick={insertAssembled}
                className="tap text-muted-foreground border-border ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:text-teal-700 dark:hover:text-teal-300"
              >
                <ArrowDownToLineIcon className="size-3" aria-hidden /> Insert assembled
              </button>
            ) : null}
          </div>
          <RichTextEditor
            value={summary}
            onChange={onSummaryChange}
            placeholder="One-liner: age, salient features, working impression…"
          />
          <p className="text-muted-foreground/70 text-[10px]">
            Assembled from captured findings only — you refine it; it never invents a finding.
          </p>
        </div>
      </section>

      {/* ── 2 · Form the diagnosis — clinical reasoning + ranked, selectable
              suggestions fused into ONE surface. The docked reasoning rail is
              hidden on this step; its aids (traps, red flags, discriminators,
              diagnostic pause) live here, aimed at committing a diagnosis. ── */}
      <section className="border-border bg-card flex flex-col gap-2.5 rounded-xl border p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-display text-foreground inline-flex items-center gap-1.5 text-[13px] font-medium">
            <BrainCircuitIcon className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
            Form the diagnosis
          </h4>
          {mnmCount ? (
            <span className="scale-in inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 tabular-nums dark:bg-amber-950/40 dark:text-amber-300">
              <ShieldAlertIcon className="size-3" aria-hidden /> {mnmCount} must-not-miss
            </span>
          ) : null}
          {fired ? (
            <span className="text-muted-foreground ml-auto inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.14em] uppercase">
              <span aria-hidden className="pulse-dot size-1.5 rounded-full bg-teal-500" /> live
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground text-[10.5px]">
          Decision support — the differential broadens + narrows as you work; you decide. Nothing is
          recorded until you select.
        </p>

        {/* safety-first: known-disease traps + red flags surface immediately */}
        {reasoning.knownDiseaseTraps.map((t, i) => (
          <div
            key={i}
            className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-900 ring-1 ring-amber-500/30 ring-inset dark:bg-amber-950/30 dark:text-amber-200"
          >
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{t}</span>
          </div>
        ))}
        {reasoning.redFlags.length ? (
          <AidGroup title="Red flags — re-check" tone="amber">
            <AidChips items={reasoning.redFlags} tone="amber" />
          </AidGroup>
        ) : null}

        {/* the live differential — now selectable. Chronic (NCD) layer first. */}
        {ncdSuggestions.length ? (
          <div className="flex flex-col gap-1.5">
            <AidLabel>Chronic (NCD) — supported by this clerkship</AidLabel>
            {ncdSuggestions.map((n) => (
              <NcdRow key={n.code} n={n} onPick={onPickDiagnosis} />
            ))}
          </div>
        ) : null}

        {nothingToDecide ? (
          <p className="text-muted-foreground text-[12px]">
            {pcCodes.length
              ? "Every suggestion has been decided — your working diagnoses are below."
              : "Add a presenting complaint and the differential appears here, ranked + selectable. You can also search the catalog or add your own below."}
          </p>
        ) : null}

        {suggestionList.length ? (
          <div className="flex flex-col gap-1.5">
            {ncdSuggestions.length ? <AidLabel>Acute / other</AidLabel> : null}
            {suggestionList.map((sg) => (
              <AcuteRow
                key={sg.dx}
                sg={sg}
                onSelect={() => selectSuggestion(sg)}
                onReject={() => rejectSuggestion(sg)}
              />
            ))}
          </div>
        ) : null}

        {excluded.length ? (
          <div className="border-border/60 flex flex-col gap-1 border-t pt-2">
            <AidLabel>Considered &amp; excluded — kept on the record</AidLabel>
            <div className="flex flex-wrap gap-1">
              {excluded.map((d) => (
                <span
                  key={d.text}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] ring-1 ring-inset",
                    d.mustNotMiss
                      ? "bg-red-50/60 text-red-700/80 ring-red-500/30 dark:bg-red-950/20 dark:text-red-300/80"
                      : "text-muted-foreground bg-muted/40 ring-border",
                  )}
                >
                  {d.mustNotMiss ? <AlertTriangleIcon className="size-3" aria-hidden /> : null}
                  <span className="line-through">{d.text}</span>
                  <button
                    type="button"
                    onClick={() => onUnexclude(d.text)}
                    aria-label={`Reconsider ${d.text}`}
                    className="tap hover:text-foreground"
                    title="Reconsider"
                  >
                    <PlusIcon className="size-3" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* aids to refine the decision — what would discriminate, what to confirm */}
        {reasoning.toAsk.length ||
        reasoning.riskFactorsPresent.length ||
        reasoning.riskFactorsToCheck.length ? (
          <div className="border-border/60 flex flex-col gap-2 border-t pt-2.5">
            {reasoning.toAsk.length ? (
              <AidGroup title="To discriminate — ask / examine next">
                <AidChips items={reasoning.toAsk.slice(0, 8)} tone="neutral" />
              </AidGroup>
            ) : null}
            {reasoning.riskFactorsPresent.length ? (
              <AidGroup title="Risk factors present">
                <AidChips items={reasoning.riskFactorsPresent} tone="teal" />
              </AidGroup>
            ) : null}
            {reasoning.riskFactorsToCheck.length ? (
              <AidGroup title="Risk factors to check">
                <AidChips items={reasoning.riskFactorsToCheck.slice(0, 6)} tone="muted" />
              </AidGroup>
            ) : null}
          </div>
        ) : null}

        {/* add your own / search the catalog — same commit path as Select */}
        <div className="border-border/60 flex flex-col gap-1.5 border-t pt-2.5">
          <AidLabel>Search the catalog or add a diagnosis not listed</AidLabel>
          <DiagnosisPicker onPick={onPickDiagnosis} />
        </div>

        {/* anti-anchoring reflection before committing */}
        {fired ? (
          <div className="rounded-lg bg-teal-50/60 p-2.5 dark:bg-teal-950/20">
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-teal-700 dark:text-teal-300">
              <PauseCircleIcon className="size-3.5" aria-hidden /> Diagnostic pause — before you
              commit
            </span>
            <ul className="text-muted-foreground mt-1 flex list-disc flex-col gap-0.5 pl-5 text-[11px]">
              {diagnosticPausePrompts().map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-muted-foreground/70 text-[10px]">
          {fired ? `From ${reasoning.basis.join(", ")}. ` : ""}Decision-support, not a verdict —
          Select records <em>your</em> working diagnosis (with its catalog ICD-10); Reject keeps it
          considered &amp; excluded. Must-not-miss always surfaces.
        </p>
      </section>

      {/* ── 3 · Working diagnoses — the record + per-dx feature reconciliation ── */}
      <section className="border-border bg-card flex flex-col gap-2.5 rounded-xl border p-3.5 shadow-sm">
        <h4 className="font-display text-foreground inline-flex items-center gap-1.5 text-[13px] font-medium">
          <ListChecksIcon className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
          Working diagnoses — verify supporting features
        </h4>

        {differential.length === 0 ? (
          <p className="text-muted-foreground text-[12px]">
            No working diagnosis yet — Select a suggestion above, pick from the catalog, or add your
            own below. The diagnosis of record is always yours.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {differential.map((row, i) => (
              <div
                key={i}
                className={cn(
                  "scale-in flex flex-col gap-2 rounded-lg border p-2.5",
                  row.mustNotMiss
                    ? "border-red-300 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/15"
                    : "border-border bg-muted/20",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {row.mustNotMiss ? (
                    <ShieldAlertIcon
                      className="size-3.5 shrink-0 text-red-600 dark:text-red-400"
                      aria-label="must-not-miss"
                    />
                  ) : null}
                  <Input
                    className="h-8 min-w-40 flex-1 text-[12.5px]"
                    placeholder="Diagnosis"
                    value={row.text}
                    onChange={(ev) => setRow(i, { ...row, text: ev.target.value })}
                  />
                  <CodeCombobox
                    options={ICD10_CODES}
                    placeholder="ICD-10"
                    value={row.icd10}
                    onChange={(v) => setRow(i, { ...row, icd10: v })}
                  />
                  <label className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px]">
                    <input
                      type="checkbox"
                      checked={row.mustNotMiss}
                      onChange={(ev) => setRow(i, { ...row, mustNotMiss: ev.target.checked })}
                    />
                    must-not-miss
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove ${row.text || "diagnosis"}`}
                    onClick={() => removeRow(i)}
                    className="tap text-muted-foreground hover:text-destructive ml-auto rounded-md p-0.5 transition-colors"
                  >
                    <XIcon className="size-3.5" aria-hidden />
                  </button>
                </div>
                <DiagnosisFeatures
                  text={row.text}
                  symptomCodes={capturedSymptomCodes}
                  conditionCodes={capturedConditionCodes}
                  symptomMeta={symptomMeta}
                  conditionMeta={conditionMeta}
                  onCaptureSymptom={onCaptureSymptom}
                />
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addRow}
          className="tap text-muted-foreground hover:text-foreground hover:bg-muted/60 inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] transition-colors"
        >
          <PlusIcon className="size-3" aria-hidden /> Add diagnosis
        </button>

        <p className="text-muted-foreground/70 text-[10px]">
          Tap a missing symptom to record it present (ROS) — nothing is auto-filled; missing
          features stay blank until you add them. Risk factors are recorded in Background.
        </p>
      </section>
    </div>
  );
}

/** Compact uppercase section label inside the diagnosis surface. */
function AidLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.12em] uppercase">
      {children}
    </span>
  );
}

/** A titled group of reasoning chips (red flags / discriminators / risk factors). */
function AidGroup({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "amber";
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn(
          "text-[9.5px] font-medium tracking-widest uppercase",
          tone === "amber" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
        )}
      >
        {title}
      </span>
      {children}
    </div>
  );
}

function AidChips({
  items,
  tone,
}: {
  items: string[];
  tone: "amber" | "teal" | "muted" | "neutral";
}) {
  const cls =
    tone === "amber"
      ? "bg-amber-50 text-amber-800 ring-amber-500/25 dark:bg-amber-950/30 dark:text-amber-300"
      : tone === "teal"
        ? "bg-teal-50 text-teal-700 ring-teal-500/25 dark:bg-teal-950/30 dark:text-teal-300"
        : tone === "muted"
          ? "bg-muted/50 text-muted-foreground ring-border"
          : "bg-muted/60 text-foreground/75 ring-border";
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((x, i) => (
        <span
          key={i}
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[11px] leading-tight ring-1 ring-inset",
            cls,
          )}
        >
          {x}
        </span>
      ))}
    </div>
  );
}

/** Chronic (NCD) suggestion — "supported by" stays visible; the verbose defining
 *  criteria are COLLAPSED behind a toggle (default hidden) to cut wordiness; the
 *  "pending CSO" honesty marker stays on each unratified criterion when shown. */
function NcdRow({ n, onPick }: { n: NcdSuggestion; onPick: (r: CatalogSearchResult) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border p-2",
        n.mustNotMiss
          ? "border-red-300 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/15"
          : "border-border bg-muted/20",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-foreground text-[12.5px] font-medium">
          {n.mustNotMiss ? (
            <ShieldAlertIcon
              className="mr-1 inline size-3.5 text-red-600 dark:text-red-400"
              aria-label="must-not-miss"
            />
          ) : null}
          {n.dx}
        </span>
        {n.icd10 ? (
          <span className="text-muted-foreground font-mono text-[9.5px]">{n.icd10}</span>
        ) : null}
        <span className="rounded bg-teal-100 px-1 text-[8.5px] font-semibold tracking-wide text-teal-800 uppercase dark:bg-teal-950/40 dark:text-teal-300">
          NCD
        </span>
        <button
          type="button"
          onClick={() =>
            onPick({
              code: n.code,
              display: n.dx,
              icd10: n.icd10,
              category: "ncd",
              mustNotMiss: n.mustNotMiss,
            })
          }
          className="tap ml-auto inline-flex items-center gap-1 rounded-md bg-teal-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-teal-700"
        >
          <CheckIcon className="size-3" aria-hidden /> Select
        </button>
      </div>
      {n.matchedSymptoms.length || n.matchedRiskFactors.length ? (
        <p className="text-muted-foreground text-[10.5px]">
          supported by: {[...n.matchedSymptoms, ...n.matchedRiskFactors].join(", ")}
        </p>
      ) : null}
      {n.definingCriteria.length ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="tap text-muted-foreground/80 hover:text-foreground inline-flex w-fit items-center gap-1 text-[10px]"
            >
              <ChevronDownIcon
                className={cn("size-3 transition-transform", open && "rotate-180")}
                aria-hidden
              />
              {open ? "Hide" : "Show"} defining criteria ({n.definingCriteria.length})
            </button>
            {/* honesty stays at-a-glance even while collapsed: flag unratified
                criteria here so the marker is never hidden behind the toggle */}
            {n.definingCriteria.some((c) => c.confidence === "needs_cso_input") ? (
              <span
                title="Some defining criteria are not yet CSO-ratified"
                className="rounded bg-amber-100 px-1 text-[8px] font-semibold tracking-wide text-amber-800 uppercase dark:bg-amber-950/40 dark:text-amber-300"
              >
                pending CSO
              </span>
            ) : null}
          </div>
          {open ? (
            <ul className="reveal-up flex flex-col gap-1">
              {n.definingCriteria.map((c) => (
                <li
                  key={`${c.measure}:${c.threshold}`}
                  className="border-border/60 bg-card text-muted-foreground flex flex-col gap-0.5 rounded border px-2 py-1 text-[10.5px] leading-snug"
                >
                  <span className="flex flex-wrap items-center gap-1">
                    <span className="text-foreground/80 font-medium">{c.measure}</span>
                    {c.confidence === "needs_cso_input" ? (
                      <span className="rounded bg-amber-100 px-1 text-[8px] font-semibold tracking-wide text-amber-800 uppercase dark:bg-amber-950/40 dark:text-amber-300">
                        pending CSO
                      </span>
                    ) : null}
                  </span>
                  <span>{c.threshold}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Acute / other suggestion — the reasoning engine's ranked differential, now
 *  selectable; a trend arrow shows rule-in/rule-out and short evidence chips show
 *  why. Replaces the duplicated row that used to live in the docked rail. */
function AcuteRow({
  sg,
  onSelect,
  onReject,
}: {
  sg: DiagnosisSuggestion;
  onSelect: () => void;
  onReject: () => void;
}) {
  const Icon =
    sg.status === "supported" ? ArrowUpIcon : sg.status === "lowered" ? ArrowDownIcon : MinusIcon;
  const iconColor =
    sg.status === "supported"
      ? "text-teal-600 dark:text-teal-400"
      : sg.status === "lowered"
        ? "text-muted-foreground/60"
        : "text-muted-foreground";
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-2",
        sg.mustNotMiss
          ? "border-red-300 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20"
          : "border-border bg-muted/20",
        sg.status === "lowered" && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Icon className={cn("size-3.5 shrink-0", iconColor)} aria-hidden />
        <span className="text-foreground text-[12.5px] font-medium">{sg.dx}</span>
        {sg.icd10 ? (
          <span className="text-muted-foreground font-mono text-[9.5px]">{sg.icd10}</span>
        ) : null}
        {sg.mustNotMiss ? (
          <span className="rounded bg-red-100 px-1 text-[9px] font-semibold tracking-wide text-red-800 uppercase dark:bg-red-950/40 dark:text-red-300">
            must-not-miss
          </span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onSelect}
            className="tap inline-flex items-center gap-1 rounded-md bg-teal-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-teal-700"
          >
            <CheckIcon className="size-3" aria-hidden /> Select
          </button>
          <button
            type="button"
            onClick={onReject}
            className="tap text-muted-foreground border-border hover:text-foreground inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"
          >
            <XIcon className="size-3" aria-hidden /> Reject
          </button>
        </div>
      </div>
      {sg.evidence.length ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-muted-foreground/70 text-[9.5px]">why:</span>
          {sg.evidence.map((e) => (
            <span
              key={`${e.kind}:${e.label}`}
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] ring-1 ring-inset",
                e.kind === "against"
                  ? "text-muted-foreground/70 bg-muted/30 ring-border"
                  : "ring-border bg-card",
              )}
            >
              <span className="text-muted-foreground/60 text-[8px] font-semibold tracking-wide uppercase">
                {EVIDENCE_TAG[e.kind]}
              </span>
              {e.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
