"use client";

import type {
  CatalogGroup,
  Feature,
  FeatureOption,
  NcdCatalog,
  Predicate,
  SiteProfile,
} from "@/lib/ncd/catalog/schema";
import type {
  CaptureEntry,
  CaptureMap,
  CaptureValue,
  DurationUnit,
  EvalContext,
} from "@/lib/ncd/engine/evaluate";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  BandageIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleSlashIcon,
  DropletsIcon,
  EyeIcon,
  FootprintsIcon,
  HeartPulseIcon,
  PenLineIcon,
  RotateCcwIcon,
  SirenIcon,
  TrendingDownIcon,
  WavesIcon,
  XIcon,
} from "lucide-react";

import { NcdInterpretation } from "@/app/doctor/encounters/[encounterId]/_components/ncd-interpretation";
import {
  displayAnyOf,
  displayPredicates,
  effectiveGroup,
  isPerformable,
  MAX_PROPERTY_DEPTH,
} from "@/lib/ncd/catalog/schema";
import { interpretations, ncdContext } from "@/lib/ncd/engine/assess";
import {
  contextOf,
  DURATION_UNITS,
  evaluatePredicate,
  isDuration,
  isEntry,
} from "@/lib/ncd/engine/evaluate";

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
 * ── Three registers, because a flat list was unreadable ──────────────────────
 * A clinician could not tell a finding from a property of one. Indent and a 2%
 * tint were carrying that entire load across forty rows, and 0.5px of type-size
 * difference was carrying the rest. So:
 *
 *   FINDING   a row on the card: white ground, weight 500, primary tone
 *   PROPERTY  inside a bordered Muted well headed "About {finding}"
 *   DEPTH 2   a monospace gutter glyph inside the SAME well, one tone lighter
 *
 * The hairline divider now separates FINDINGS ONLY. That is the highest-leverage
 * line here: a rule means "new question", and its absence means "same question",
 * where before it said "peer" about every adjacent pair. Nothing was added to
 * the interface to buy that.
 *
 * Depth clamps at two. There are exactly two devices and no third, and a catalog
 * reaching depth three has a modelling problem the UI must not paper over — so
 * the validator rejects it where catalogs are authored.
 *
 * ── Motion, deliberately sparse ──────────────────────────────────────────────
 * Answering a feature happens dozens of times per encounter, so the controls do
 * not animate: 100 ms colour only, and an :active press so the button feels
 * heard. The one exception is a property well's contents, which fade in over
 * 150 ms — the form grew because of what you just answered, and without that the
 * new rows read as a glitch. Nothing here is decorative.
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

/** Is this feature askable right now? Same evaluator the clinical rules use. */
export function isVisible(f: Feature, ctx: EvalContext): boolean {
  const met = (p: Predicate) => evaluatePredicate(p, ctx).state === "met";
  const anyOf = displayAnyOf(f);
  if (anyOf && !anyOf.some(met)) return false;
  return displayPredicates(f).every(met);
}

/* ── rows: one finding, then everything hanging off it ───────────────────── */

export interface CaptureRow {
  feature: Feature;
  /** 1 for a property, 2 for a property of one. Clamped at MAX_PROPERTY_DEPTH. */
  depth: number;
}

export interface CaptureBlock {
  finding: Feature;
  properties: CaptureRow[];
}

/**
 * Group the visible features into one block per finding.
 *
 * Written recursively because the previous flat version emitted a finding and
 * then only its DIRECT children — so a property of a property was dropped from
 * the form entirely. Not mis-indented: absent. The question never appeared, the
 * progress denominator still counted it, and nothing failed, because no test
 * reached this function. It is exported for that reason.
 *
 * A feature whose parent is not visible in this section is treated as a root, so
 * an orphan still renders rather than vanishing a second way.
 */
export function buildBlocks(visible: Feature[]): CaptureBlock[] {
  const shown = new Set(visible.map((f) => f.code));
  const childrenOf = new Map<string, Feature[]>();
  for (const f of visible) {
    if (!f.parent || !shown.has(f.parent)) continue;
    const list = childrenOf.get(f.parent) ?? [];
    list.push(f);
    childrenOf.set(f.parent, list);
  }

  const walk = (code: string, depth: number, out: CaptureRow[]) => {
    for (const child of childrenOf.get(code) ?? []) {
      out.push({ feature: child, depth: Math.min(depth, MAX_PROPERTY_DEPTH) });
      walk(child.code, depth + 1, out);
    }
  };

  return visible
    .filter((f) => !f.parent || !shown.has(f.parent))
    .map((finding) => {
      const properties: CaptureRow[] = [];
      walk(finding.code, 1, properties);
      return { finding, properties };
    });
}

/** Per-section progress, used by the rail. */
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
  const ctx = contextOf(catalog.features, values, site);
  return [...catalog.sections]
    .sort((a, b) => a.order - b.order)
    .filter((s) => (by.get(s.id) ?? []).length)
    .map((s) => {
      // Conditional fields are not yet askable, so counting them would show a
      // denominator the clinician cannot reach. Off-protocol notes are excluded
      // outright: a section must not read as unfinished because nobody had a
      // free-text remark to add, and must not read as finished because they did.
      const fs = (by.get(s.id) ?? []).filter((f) => !f.offProtocol && isVisible(f, ctx));
      // Numerator and denominator over the SAME population. Counting `answered`
      // across every visible feature while subtracting the unavailable ones from
      // `total` let a site-blocked section show a green tick over unanswered
      // clinical questions.
      const askable = fs.filter((f) => isPerformable(f, site));
      return {
        id: s.id,
        display: s.display,
        description: s.description,
        // An explicit "could not do it today" is an answered question, not an
        // outstanding one — which is what the profile card already believed.
        answered: askable.filter((f) => {
          const st = values[f.code]?.state;
          return st === "recorded" || st === "unavailable";
        }).length,
        total: askable.length,
        unavailable: fs.length - askable.length,
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
  const ordered = useMemo(
    () => [...catalog.sections].sort((a, b) => a.order - b.order),
    [catalog.sections],
  );
  const index = ordered.findIndex((s) => s.id === sectionId);
  const section = ordered[index];

  const featureIndex = useMemo(
    () => new Map(catalog.features.map((f) => [f.code, f])),
    [catalog.features],
  );

  /**
   * Which features are visible right now — evaluated by the SAME evaluator the
   * clinical rules use, so what the form shows and what the engine reasons about
   * can never drift apart. The effect is that an unasked symptom never spawns a
   * page of questions about itself.
   */
  /**
   * The interpretation table, where this section holds the tests it reads.
   *
   * Which section that is comes from the CATALOG — a table's feature knows its
   * own section — rather than from a hardcoded id here. Hypertension gets its
   * blood-pressure bands under whichever section it files them in, with no
   * change to this component.
   */
  const interpretation = useMemo(() => {
    const inSection = new Set(
      catalog.features.filter((f) => f.section === sectionId).map((f) => f.code),
    );
    if (!catalog.interpretation?.some((t) => inSection.has(t.feature))) return [];
    return interpretations(catalog, ncdContext(catalog, values, site)).filter((i) =>
      inSection.has(i.feature),
    );
  }, [catalog, sectionId, values, site]);

  const visible = useMemo(() => {
    const ctx = contextOf(catalog.features, values, site);
    // A test the interpretation table captures is NOT also a row in the card.
    // The input belongs with the scale that reads it, and rendering both would
    // put the same question on the screen twice.
    const inTable = new Set(interpretation.map((i) => i.feature));
    return catalog.features.filter(
      (f) => f.section === sectionId && !f.offProtocol && !inTable.has(f.code) && isVisible(f, ctx),
    );
  }, [catalog.features, sectionId, values, site, interpretation]);

  /** Findings in group order, each carrying its own properties. */
  const banded = useMemo(() => {
    const groups = section?.groups ?? [];
    const order = new Map(groups.map((g) => [g.id, g.order]));
    const blocks = buildBlocks(visible).map((b) => ({
      ...b,
      group: effectiveGroup(b.finding, featureIndex),
    }));
    const byId = new Map(groups.map((g) => [g.id, g]));
    return blocks
      .map((b, i) => ({ b, i }))
      .sort((x, y) => {
        const ox = order.get(x.b.group ?? "") ?? Number.MAX_SAFE_INTEGER;
        const oy = order.get(y.b.group ?? "") ?? Number.MAX_SAFE_INTEGER;
        return ox - oy || x.i - y.i;
      })
      .map(({ b }, i, arr) => ({
        ...b,
        // A band is drawn where the group CHANGES, so it is a property of the
        // ordered list rather than of the block — computed here rather than
        // tracked in a variable the render mutates as it goes.
        band: b.group && b.group !== arr[i - 1]?.b.group ? byId.get(b.group) : undefined,
      }));
  }, [visible, section, featureIndex]);

  /** Off-protocol capture for this section, if the catalog declares any. */
  const offProtocol = useMemo(
    () => catalog.features.filter((f) => f.section === sectionId && f.offProtocol),
    [catalog.features, sectionId],
  );

  /**
   * Which wells are folded, and WHICH QUESTIONS each held when it was folded.
   *
   * The codes are the point. A well may now be folded with questions still
   * unanswered, so the old guarantee — that a well conjuring a new question
   * became unfoldable — is gone. Remembering what was there instead lets a well
   * that has since grown a question open itself again.
   *
   * Held here rather than per-row so it survives a re-render, and deliberately
   * NOT persisted: how a form is folded is not a clinical fact.
   */
  const [folded, setFolded] = useState<Map<string, string[]>>(new Map());

  const set = (code: string, v: CaptureMap[string]) => {
    const next = { ...values };
    if (v === undefined) delete next[code];
    else next[code] = v;
    onChange(next);
  };

  if (!section) return null;

  return (
    <section key={sectionId} className="flex flex-col">
      <header className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
        <span
          aria-hidden
          className="bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300 shrink-0 self-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <h3 className="font-display text-foreground text-body-l leading-tight font-medium tracking-[-0.012em]">
          {section.display}
        </h3>
        {section.description ? (
          <p className="text-muted-foreground text-caption">{section.description}</p>
        ) : null}
      </header>

      <NcdInterpretation
        rows={interpretation}
        renderInput={(code) => {
          const f = featureIndex.get(code);
          if (!f) return null;
          const performable = isPerformable(f, site);
          if (!performable) {
            return (
              <span className="text-muted-foreground text-caption inline-flex items-center gap-1">
                <CircleSlashIcon className="size-3" aria-hidden />
                not available here
              </span>
            );
          }
          return (
            <>
              <ValueEditor feature={f} value={values[code]} onSet={(v) => set(code, v)} left />
              {values[code] ? (
                <button
                  type="button"
                  onClick={() => set(code, undefined)}
                  title="Clear — back to not assessed"
                  aria-label={`Clear ${f.display}`}
                  className={`tap text-muted-foreground hover:text-foreground rounded p-1 ${EASE} ${TAP}`}
                >
                  <RotateCcwIcon className="size-3" aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    set(code, { state: "unavailable", capability: f.requires ?? "site" })
                  }
                  title="Could not be done today"
                  aria-label={`${f.display} — could not be done today`}
                  className={`tap text-muted-foreground/70 hover:text-foreground rounded px-1.5 py-0.5 text-[10.5px] ${EASE} ${TAP}`}
                >
                  n/a
                </button>
              )}
            </>
          );
        }}
      />

      {/* One card, banded — not six cards. Elevation is a truth claim, and this
          is one protocol for one section. The divider now separates findings
          only, so a rule reliably means "new question". */}
      <div
        className={`border-border bg-card divide-gray-150 divide-y overflow-hidden rounded-xl border shadow-xs ${
          banded.length ? "" : "hidden"
        } ${interpretation.length ? "mt-3" : ""}`}
      >
        {banded.map(({ finding, properties, band }) => {
          return (
            <div key={finding.code}>
              {band ? <GroupBand group={band} /> : null}
              <FeatureRow
                feature={finding}
                site={site}
                depth={0}
                value={values[finding.code]}
                onSet={(v) => set(finding.code, v)}
              />
              {properties.length ? (
                <PropertyWell
                  finding={finding}
                  properties={properties}
                  site={site}
                  values={values}
                  featureIndex={featureIndex}
                  foldedAt={folded.get(finding.code)}
                  onToggle={(codes) =>
                    setFolded((prev) => {
                      const next = new Map(prev);
                      if (codes) next.set(finding.code, codes);
                      else next.delete(finding.code);
                      return next;
                    })
                  }
                  onSet={set}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {offProtocol.map((f) => (
        <OffProtocolBlock
          key={f.code}
          feature={f}
          value={values[f.code]}
          onSet={(v) => set(f.code, v)}
        />
      ))}
    </section>
  );
}

/** Has this question been dealt with — answered, or explicitly marked undoable? */
export const isSettled = (v: CaptureMap[string]) =>
  v?.state === "recorded" || v?.state === "unavailable";

/** How much of a finding's history has been taken. */
export function wellFold(properties: CaptureRow[], values: CaptureMap) {
  const settled = properties.filter((p) => isSettled(values[p.feature.code])).length;
  return { settled, total: properties.length, complete: settled === properties.length };
}

/**
 * Has the form asked something new since this well was folded?
 *
 * Any well may now be folded, answered or not — so the rule that used to make
 * that safe (a well conjuring a question became unfoldable, because the new
 * question arrived unsettled) no longer holds. This replaces it: the codes
 * present at the moment of folding are remembered, and a well that has since
 * grown a question unfolds itself to show it.
 *
 * Without this, recording "one eye" would add "Which eye" inside a folded well
 * and nobody would ever see it.
 */
/**
 * Flagged questions still unanswered — the one thing a folded summary must show
 * in full rather than compress.
 *
 * Folding used to be impossible while anything was unanswered, which made this
 * unnecessary. Now that a well folds freely, a danger-sign question could
 * otherwise be folded out of sight while unasked, which is the failure the whole
 * flag list exists to prevent.
 */
export function unansweredFlags(properties: CaptureRow[], values: CaptureMap): CaptureRow[] {
  return properties.filter((p) => p.feature.dangerSign && !isSettled(values[p.feature.code]));
}

export function foldStale(foldedAt: string[] | undefined, properties: CaptureRow[]): boolean {
  if (!foldedAt) return false;
  return properties.some((p) => !foldedAt.includes(p.feature.code));
}

/**
 * A recorded value in the fewest words that remain true.
 *
 * Used only in a folded well, so it carries a real burden: if it loses
 * information the fold becomes a way to hide an answer, rather than a way to
 * compress one. Multi-selects therefore name the first two and COUNT the rest
 * rather than trailing off.
 */
export function summarise(feature: Feature, v: CaptureMap[string]): string {
  if (v?.state === "unavailable") return "not obtainable";
  if (v?.state !== "recorded") return "—";
  const val = v.value;
  const label = (o: string) => feature.options?.find((x) => x.value === o)?.display ?? o;

  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (isDuration(val)) return `${val.value} ${val.unit}`;
  if (isEntry(val)) return label(val.option);
  if (Array.isArray(val)) {
    const opts = val.map((e) => label(isEntry(e) ? e.option : String(e)));
    return opts.length > 2 ? `${opts.slice(0, 2).join(", ")} +${opts.length - 2}` : opts.join(", ");
  }
  if (typeof val === "number") return feature.unit ? `${val} ${feature.unit}` : String(val);
  return label(String(val));
}

/**
 * A finding's properties, foldable once they are all dealt with.
 *
 * THE RULE THAT MAKES THIS SAFE: a well can only fold when EVERY visible
 * property is settled. An unanswered question is never hidden, and because a
 * newly-conjured property arrives unanswered, answering something that opens a
 * further question forces the well back open on its own — no effect, no
 * synchronisation, just the same condition read again.
 *
 * Folded is not hidden. The summary states every answer, so folding compresses
 * the record rather than concealing it, and a danger sign among the folded rows
 * keeps its badge on the summary line.
 */
function PropertyWell({
  finding,
  properties,
  site,
  values,
  featureIndex,
  foldedAt,
  onToggle,
  onSet,
}: {
  finding: Feature;
  properties: CaptureRow[];
  site: SiteProfile;
  values: CaptureMap;
  featureIndex: Map<string, Feature>;
  /** The property codes present when this well was folded, or undefined if open. */
  foldedAt?: string[];
  onToggle: (codes: string[] | undefined) => void;
  onSet: (code: string, v: CaptureMap[string]) => void;
}) {
  const { settled, total, complete } = wellFold(properties, values);
  const folded = Boolean(foldedAt) && !foldStale(foldedAt, properties);
  const bodyId = `props-${finding.code}`;

  // Never folded out of sight: a question that carries a flag and has not been
  // answered is the one thing a summary must still show in full.
  const openFlags = unansweredFlags(properties, values);

  return (
    <div
      role="group"
      aria-label={`About ${finding.display}`}
      className="border-brand-100 bg-brand-50/40 dark:border-brand-900/40 dark:bg-brand-950/15 mr-3 mb-2 ml-6 rounded-md border"
    >
      <div className="ncd-reveal flex items-baseline gap-1.5 px-2.5 pt-2 pb-1">
        <span className="text-caption text-brand-600/90 dark:text-brand-400/90 shrink-0 font-medium">
          About
        </span>
        <span className="text-caption text-brand-800/70 dark:text-brand-300/70 min-w-0 truncate">
          {finding.display}
        </span>
        <span className="ml-auto flex shrink-0 items-baseline gap-1.5">
          <span
            className={`text-caption tabular-nums ${
              complete
                ? "text-brand-700/70 dark:text-brand-400/70"
                : "text-amber-700 dark:text-amber-400"
            }`}
          >
            {settled}/{total}
            {complete ? "" : " asked"}
          </span>
          <button
            type="button"
            onClick={() => onToggle(folded ? undefined : properties.map((p) => p.feature.code))}
            aria-expanded={!folded}
            aria-controls={bodyId}
            className={`tap text-caption text-brand-700 hover:bg-brand-100/70 dark:text-brand-300 dark:hover:bg-brand-900/40 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${EASE} ${TAP}`}
          >
            {folded ? <ChevronDownIcon className="size-3" /> : <ChevronUpIcon className="size-3" />}
            {folded ? "Show" : "Hide"}
          </button>
        </span>
      </div>

      <div id={bodyId} className="ncd-reveal">
        {folded ? (
          <>
            <ul className="flex flex-wrap gap-x-3 gap-y-0.5 px-2.5 pb-2">
              {properties.map(({ feature }) => {
                const answered = isSettled(values[feature.code]);
                return (
                  <li key={feature.code} className="text-caption min-w-0">
                    <span
                      className={
                        answered
                          ? "text-brand-700/70 dark:text-brand-400/70"
                          : "text-muted-foreground/70"
                      }
                    >
                      {feature.display}
                    </span>{" "}
                    {/* An unasked question reads as a gap, not as a value. The
                        dash is paired with the muted label and the "n asked"
                        count, so it never depends on colour alone. */}
                    <span
                      className={
                        answered
                          ? "text-foreground/80 font-medium"
                          : "text-muted-foreground/50 italic"
                      }
                    >
                      {answered ? summarise(feature, values[feature.code]) : "not asked"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {openFlags.length ? (
              <p className="text-caption flex flex-wrap items-center gap-1.5 px-2.5 pb-2 text-amber-800 dark:text-amber-300">
                <AlertTriangleIcon className="size-3 shrink-0" aria-hidden />
                <span className="font-medium">Still unanswered, and flagged:</span>
                {openFlags.map((p) => p.feature.display).join(" · ")}
              </p>
            ) : null}
          </>
        ) : (
          properties.map(({ feature, depth }) => (
            <FeatureRow
              key={feature.code}
              feature={feature}
              site={site}
              depth={depth}
              parentDisplay={feature.parent ? featureIndex.get(feature.parent)?.display : undefined}
              value={values[feature.code]}
              onSet={(v) => onSet(feature.code, v)}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Icons a catalog may name. A registry rather than an import in the catalog,
 * so a data file never reaches for a UI library — the property that lets
 * hypertension ship as data instead of as code. An unknown name simply gets no
 * icon; a missing glyph must never cost a clinician their band heading.
 */
const GROUP_ICONS: Record<string, LucideIcon> = {
  droplets: DropletsIcon,
  bandage: BandageIcon,
  siren: SirenIcon,
  falling: TrendingDownIcon,
  foot: FootprintsIcon,
  eye: EyeIcon,
  pulse: HeartPulseIcon,
  waves: WavesIcon,
};

/**
 * A landmark, not a rail.
 *
 * Sticky answers "where am I", which is orientation. Navigation is the ability
 * to JUMP, and that stays with the section rail — so this carries no click
 * target, no aria-current, and deliberately no progress count. A count invites
 * completion-chasing, completion-chasing wants a jump target, and a second
 * navigable hierarchy is exactly what a long section must not grow.
 *
 * Sentence case, not uppercase: these are headings a clinician reads, and
 * setting a nine-word clinical phrase in caps makes it slower to read while
 * making it shout. The type scale's uppercase step is for one- or two-word
 * labels; this is a sentence.
 *
 * Colour is two-valued on purpose. The design system permits a monochrome base
 * with accents and forbids decorative colour, so a hue per group would be
 * decoration — the icon carries the differentiation and the accent is spent
 * only on the band that means act now.
 */
function GroupBand({ group }: { group: CatalogGroup }) {
  const Icon = group.icon ? GROUP_ICONS[group.icon] : undefined;
  const alert = group.tone === "alert";
  return (
    <div
      className={`sticky top-0 z-10 flex items-baseline gap-2 border-y px-3 py-2 first:border-t-0 ${
        alert
          ? "border-amber-200/70 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/35"
          : "border-brand-100 bg-brand-50 dark:border-brand-900/50 dark:bg-brand-950/35"
      }`}
    >
      {Icon ? (
        <span
          aria-hidden
          className={`grid size-5 shrink-0 translate-y-0.5 place-items-center rounded-md ${
            alert ? "bg-amber-500 text-white" : "bg-brand-600 text-white"
          }`}
        >
          <Icon className="size-3" />
        </span>
      ) : null}
      <h4
        className={`text-body-s shrink-0 font-medium ${
          alert ? "text-amber-900 dark:text-amber-200" : "text-brand-900 dark:text-brand-100"
        }`}
      >
        {group.display}
      </h4>
      {group.description ? (
        <p
          className={`text-caption min-w-0 truncate ${
            alert
              ? "text-amber-800/70 dark:text-amber-300/70"
              : "text-brand-700/70 dark:text-brand-300/70"
          }`}
        >
          {group.description}
        </p>
      ) : null}
    </div>
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
  parentDisplay,
}: {
  feature: Feature;
  site: SiteProfile;
  value: CaptureMap[string];
  onSet: (v: CaptureMap[string]) => void;
  /** 0 finding, 1 property, 2 property of a property. */
  depth?: number;
  parentDisplay?: string;
}) {
  const performable = isPerformable(feature, site);
  const recorded = value?.state === "recorded" ? value.value : undefined;
  const markedUnavailable = value?.state === "unavailable";

  // A checkable list with a detail box beside each option needs the whole row;
  // nothing else does, now that properties lay out as aligned columns.
  const wide = performable && Boolean(feature.optionDetail);
  const nested = depth > 0;

  return (
    <div
      /**
       * Properties lay out as ALIGNED COLUMNS, findings do not.
       *
       * The scatter this fixes: every control was `ml-auto justify-end`, so a
       * wrapping chip group had a ragged LEFT edge and each row's options began
       * at a different x. Nine rows of that is nine different starting points
       * for the eye. A grid gives one label column, one control column and one
       * action column, so a well reads down instead of zig-zagging.
       *
       * Findings keep label-left / answer-right: they are overwhelmingly Yes/No
       * and already form a clean column of their own.
       */
      className={`group/row gap-x-3 gap-y-1 ${
        nested
          ? "px-2.5 py-1"
          : "bg-card hover:bg-brand-50/40 dark:hover:bg-brand-950/20 ease-expo-out px-3 py-2 transition-colors duration-100"
      } ${
        wide
          ? "flex flex-col"
          : nested
            ? "grid grid-cols-[7rem_minmax(0,1fr)_1.5rem] items-baseline"
            : "flex flex-wrap items-center"
      }`}
    >
      <span
        className={`flex min-w-0 items-start gap-1.5 ${wide || nested ? "" : "flex-[1_1_11rem]"}`}
      >
        {/* Depth 2 is a glyph in the text column, never a second box: two
            adjacent 1px borders read as 2px, which the design system forbids. */}
        {depth >= 2 ? (
          <span
            aria-hidden
            className="text-caption shrink-0 font-mono text-gray-400 select-none dark:text-gray-500"
          >
            →
          </span>
        ) : null}
        <span className="flex min-w-0 flex-col">
          <span
            className={`text-body-s ${
              depth === 0
                ? "text-foreground font-medium"
                : depth === 1
                  ? "text-gray-600 dark:text-gray-300"
                  : "text-gray-500 dark:text-gray-400"
            } ${!performable ? "text-muted-foreground" : ""} ${feature.dangerSign ? "inline-flex items-center gap-1.5" : ""}`}
          >
            {feature.display}
            {/* Marked before it is answered, so the clinician knows the question
                carries weight rather than discovering it after the fact. */}
            {feature.dangerSign ? (
              <span
                title={feature.dangerSign.action}
                className={`text-caption inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-px font-medium ring-1 ring-inset ${
                  feature.dangerSign.severity === "red"
                    ? "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60"
                    : "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60"
                }`}
              >
                <AlertTriangleIcon className="size-3" aria-hidden />
                Danger sign
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
          <ValueEditor
            feature={feature}
            value={value}
            onSet={onSet}
            labelSuffix={depth >= 2 && parentDisplay ? parentDisplay : undefined}
          />
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
        /* A fourth grid child would otherwise land in the 7rem label column. */
        <span
          className={`text-muted-foreground text-[10.5px] ${nested ? "col-span-full" : "w-full"}`}
        >
          Recorded as not obtainable at this visit — a referral, not an outstanding task.
        </span>
      ) : null}
    </div>
  );
}

/**
 * Off-protocol capture: outside the card, unfilled, dashed, never brand.
 *
 * The distinction is a patient-safety property, not a stylistic one. Brand
 * indigo is what an engine-recognised selection looks like everywhere else on
 * this surface, so the absence of the accent IS the signal — and it has to hold
 * in every state, because an input that lit up on focus would, for that moment,
 * look exactly like a value the engine had accepted.
 *
 * The affordances that are missing are missing on purpose. No danger-sign chip:
 * there is no citation. No `n/a`: "unavailable" is a claim about a site's
 * capability, and there is no capability for a symptom nobody defined.
 */
function OffProtocolBlock({
  feature,
  value,
  onSet,
}: {
  feature: Feature;
  value: CaptureMap[string];
  onSet: (v: CaptureMap[string]) => void;
}) {
  const [draft, setDraft] = useState("");
  const items = value?.state === "recorded" && Array.isArray(value.value) ? value.value : [];
  const list = items.map(String);

  const commit = (next: string[]) =>
    next.length ? onSet({ state: "recorded", value: next }) : onSet(undefined);

  const add = () => {
    const t = draft.trim();
    if (!t || list.includes(t)) return setDraft("");
    commit([...list, t]);
    setDraft("");
  };

  return (
    <div className="border-border mt-3 rounded-xl border border-dashed bg-transparent px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={OVERLINE}>Not in the protocol</span>
        <span className="text-caption text-muted-foreground">
          Recorded in the notes. The engine does not read these — they raise no flag and change no
          verdict.
        </span>
      </div>

      {list.map((t) => (
        <div key={t} className="flex items-start gap-2 py-1.5">
          <PenLineIcon
            className="mt-0.5 size-3.5 shrink-0 text-gray-400 dark:text-gray-500"
            aria-hidden
          />
          <span className="text-body-s min-w-0 flex-1 text-gray-600 dark:text-gray-300">{t}</span>
          <button
            type="button"
            onClick={() => commit(list.filter((x) => x !== t))}
            aria-label={`Remove ${t}`}
            className={`tap text-muted-foreground hover:text-foreground rounded p-1 ${EASE} ${TAP}`}
          >
            <XIcon className="size-3" aria-hidden />
          </button>
        </div>
      ))}

      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        placeholder={feature.display}
        aria-label={feature.display}
        className="text-body-s text-muted-foreground focus-visible:text-foreground w-full bg-transparent py-1.5 outline-none placeholder:text-gray-400"
      />
    </div>
  );
}

/* ── value editors, one per valueType ────────────────────────────────────── */

function ValueEditor({
  feature,
  value,
  onSet,
  labelSuffix,
  left,
}: {
  feature: Feature;
  value: CaptureMap[string];
  onSet: (v: CaptureMap[string]) => void;
  /** Carries the true parent into the accessible name where depth is clamped. */
  labelSuffix?: string;
  /** Lay the options out from the left, for the aligned column of a well. */
  left?: boolean;
}) {
  const current = value?.state === "recorded" ? value.value : undefined;
  const put = (v: CaptureValue) => onSet({ state: "recorded", value: v });
  const label = labelSuffix ? `${feature.display} — ${labelSuffix}` : feature.display;

  if (feature.valueType === "boolean") {
    return (
      <Segmented
        label={label}
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
      <span
        role={multi ? "group" : undefined}
        aria-label={multi ? label : undefined}
        className={`flex flex-wrap items-center gap-1 ${left ? "justify-start" : "justify-end"}`}
      >
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
              // Unticking the last option is NOT a recorded negative. An empty
              // array satisfies `absent`, so leaving it recorded would manufacture
              // the very absence-of-evidence claim the engine exists to refuse.
              const list = [...next];
              return list.length ? put(list) : onSet(undefined);
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
          aria-label={label}
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
          aria-label={`${label} — unit`}
          value={unit}
          onChange={(e) => put({ value: d?.value ?? 0, unit: e.target.value as DurationUnit })}
          className="border-input bg-card text-foreground/85 ease-expo-out focus-visible:border-brand-500 rounded-md border px-1.5 py-1 text-[11.5px] transition-[border-color] duration-100 outline-none"
        >
          {DURATION_UNITS.map((u) => (
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
      aria-label={label}
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
      className={`border-input bg-card ease-expo-out focus-visible:border-brand-500 focus-visible:ring-brand-500/25 rounded-md border px-2 py-1 transition-[border-color,box-shadow] duration-100 outline-none focus-visible:ring-2 ${
        feature.valueType === "number"
          ? "w-[6.5rem] text-right font-mono text-[12px] tabular-nums"
          : "text-body-s w-full min-w-[8rem] flex-1"
      } ${current != null ? "text-foreground" : "text-muted-foreground"}`}
    />
  );
}

function Segmented({
  options,
  active,
  onPick,
  tone,
  label,
}: {
  options: FeatureOption[];
  active?: string;
  onPick: (v: string) => void;
  tone: "teal" | "slate";
  label?: string;
}) {
  return (
    <span
      role="group"
      aria-label={label}
      className="border-border inline-flex overflow-hidden rounded-md border"
    >
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
