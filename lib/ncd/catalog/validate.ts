/**
 * Catalog validation — pure. Turns the schema's invariants into failures a test
 * can assert, so a malformed or uncited catalog cannot ship.
 *
 * This exists because the dangerous failure mode for clinical reference data is
 * not a crash, it is a plausible-looking number with no provenance. Everything
 * checked here is structural or provenance-related; none of it judges clinical
 * correctness, which is the CSO's job. What it guarantees is that the CSO has
 * something reviewable in front of them: every threshold attributed to a named
 * body and version, every predicate pointing at a feature that exists, and no
 * silent placeholders.
 */
import type { Citation, Criterion, NcdCatalog, Predicate } from "@/lib/ncd/catalog/schema";

import { criterionFeatures, MAX_PROPERTY_DEPTH } from "@/lib/ncd/catalog/schema";

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: IssueSeverity;
  /** Dotted path to the offending entry, e.g. "complications.dkd.staging.kdigo_gfr". */
  path: string;
  message: string;
}

/** Rejected as provenance: a citation must actually identify a source. */
const PLACEHOLDER = /^(tbd|todo|n\/?a|unknown|placeholder|xxx|\?+|-+)$/i;

function checkCitation(c: Citation | undefined, path: string, out: ValidationIssue[]) {
  if (!c) {
    out.push({ severity: "error", path, message: "missing citation" });
    return;
  }
  for (const [field, value] of [
    ["standard", c.standard],
    ["version", c.version],
    ["title", c.title],
  ] as const) {
    if (!value || !String(value).trim() || PLACEHOLDER.test(String(value).trim())) {
      out.push({
        severity: "error",
        path: `${path}.${field}`,
        message: `citation.${field} is empty or a placeholder`,
      });
    }
  }
  // A source must be locatable OR the gap must be declared. Silence is the one
  // thing not allowed: an unverifiable value has to say so out loud.
  if (!c.url && !c.needsCsoInput) {
    out.push({
      severity: "error",
      path: `${path}.url`,
      message:
        "citation has no url and no needsCsoInput — an unverifiable value must declare itself",
    });
  }
  if (c.needsCsoInput && c.csoSigned) {
    out.push({
      severity: "error",
      path,
      message: "citation is marked csoSigned while still carrying needsCsoInput",
    });
  }
  if (!c.csoSigned) {
    out.push({
      severity: "warning",
      path,
      message: "not CSO-signed — gated dark until ratified",
    });
  }
}

function checkPredicate(
  p: Predicate,
  path: string,
  features: Map<string, { unit?: string; valueType?: string; options?: { value: string }[] }>,
  out: ValidationIssue[],
) {
  const f = features.get(p.feature);
  if (!f) {
    out.push({
      severity: "error",
      path,
      message: `predicate references unknown feature "${p.feature}"`,
    });
    return;
  }
  const numeric = [">=", ">", "<=", "<"].includes(p.op);
  // A duration threshold with no unit cannot be normalised, so it would silently
  // compare raw numbers across different scales.
  if (numeric && (f as { valueType?: string }).valueType === "duration" && !p.unit) {
    out.push({
      severity: "error",
      path,
      message: "duration threshold has no unit — it cannot be normalised before comparison",
    });
  }
  if (numeric && typeof p.value !== "number") {
    out.push({
      severity: "error",
      path,
      message: `operator "${p.op}" needs a numeric value`,
    });
  }
  // A threshold stated in a different unit from the feature it tests is the
  // classic silent 18x error between mmol/L and mg/dL.
  if (p.unit && f.unit && p.unit !== f.unit) {
    out.push({
      severity: "error",
      path,
      message: `threshold unit "${p.unit}" does not match feature unit "${f.unit}"`,
    });
  }
  if (numeric && !f.unit) {
    out.push({
      severity: "warning",
      path,
      message: "numeric comparison against a feature with no declared unit",
    });
  }
  if (p.op === "in" && !Array.isArray(p.value)) {
    out.push({ severity: "error", path, message: 'operator "in" needs an array value' });
  }
  if (["present", "absent"].includes(p.op) && p.value !== undefined) {
    out.push({
      severity: "warning",
      path,
      message: `operator "${p.op}" ignores its value`,
    });
  }
  // Selecting an option that does not exist can never match.
  if (f.options?.length) {
    const valid = new Set(f.options.map((o) => o.value));
    const vals = Array.isArray(p.value) ? p.value : p.value != null ? [p.value] : [];
    for (const v of vals) {
      if (typeof v === "string" && !valid.has(v)) {
        out.push({
          severity: "error",
          path,
          message: `option "${v}" is not defined on feature "${p.feature}"`,
        });
      }
    }
  }
}

function checkCriterion(
  c: Criterion,
  path: string,
  features: Map<string, { unit?: string; valueType?: string; options?: { value: string }[] }>,
  out: ValidationIssue[],
) {
  if (!c.all?.length && !c.any?.length && !c.atLeast?.of.length) {
    out.push({ severity: "error", path, message: "criterion has no predicates" });
  }
  if (c.atLeast) {
    const m = c.atLeast.of.length;
    if (c.atLeast.n < 1 || c.atLeast.n > m) {
      out.push({
        severity: "error",
        path,
        message: `atLeast.n (${c.atLeast.n}) must be between 1 and the ${m} predicates given`,
      });
    }
  }
  if (!c.label?.trim()) {
    out.push({
      severity: "error",
      path,
      message: "criterion has no label — it is shown verbatim to the clinician",
    });
  }
  checkCitation(c.citation, `${path}.citation`, out);
  [...(c.all ?? []), ...(c.any ?? []), ...(c.atLeast?.of ?? [])].forEach((p, i) =>
    checkPredicate(p, `${path}.predicate[${i}]`, features, out),
  );
}

function dupes(codes: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const c of codes) {
    if (seen.has(c)) dup.add(c);
    seen.add(c);
  }
  return [...dup];
}

/**
 * Validate a catalog. Returns every issue found — errors block shipping,
 * warnings are reportable (an unsigned catalog is legitimate while it is still
 * gated dark, but it must be visible that it is unsigned).
 */
export function validateCatalog(catalog: NcdCatalog): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const features = new Map(catalog.features.map((f) => [f.code, f]));
  const capabilities = new Set(catalog.capabilities.map((c) => c.code));
  const sections = new Set(catalog.sections.map((s) => s.id));

  for (const [label, codes] of [
    ["features", catalog.features.map((f) => f.code)],
    ["capabilities", catalog.capabilities.map((c) => c.code)],
    ["sections", catalog.sections.map((s) => s.id)],
    ["complications", catalog.complications.map((c) => c.code)],
  ] as const) {
    for (const d of dupes([...codes])) {
      out.push({ severity: "error", path: label, message: `duplicate code "${d}"` });
    }
  }

  // Two sections at the same order render in an arbitrary relative position —
  // a silently wrong form, which is worse than a loud one.
  for (const d of dupes(catalog.sections.map((x) => String(x.order)))) {
    out.push({
      severity: "error",
      path: "sections",
      message: `two or more sections share order ${d}`,
    });
  }

  for (const f of catalog.features) {
    const path = `features.${f.code}`;
    if (f.requires && !capabilities.has(f.requires)) {
      out.push({
        severity: "error",
        path,
        message: `requires undeclared capability "${f.requires}"`,
      });
    }
    if (!sections.has(f.section)) {
      out.push({ severity: "error", path, message: `unknown section "${f.section}"` });
    }
    if ((f.valueType === "single_select" || f.valueType === "multi_select") && !f.options?.length) {
      out.push({ severity: "error", path, message: `${f.valueType} feature has no options` });
    }
    // A free-text list is capture the engine must never reason over. Tying the
    // shape to the flag here means the safety property cannot be lost by someone
    // reusing a convenient valueType.
    if (f.valueType === "text_list" && !f.offProtocol) {
      out.push({
        severity: "error",
        path,
        message: "text_list is only valid on an offProtocol feature",
      });
    }
    if (
      f.offProtocol &&
      (f.parent || f.showWhen || f.showWhenAll || f.showWhenAny || f.dangerSign || f.suggests)
    ) {
      out.push({
        severity: "error",
        path,
        message: "an offProtocol feature cannot gate, flag or point at anything",
      });
    }
    if (f.valueType === "number" && !f.unit) {
      out.push({ severity: "warning", path, message: "numeric feature has no unit" });
    }
    if (f.citation) checkCitation(f.citation, `${path}.citation`, out);

    // A property of a finding that does not exist can never appear, so the
    // question it asks is silently lost rather than loudly broken.
    if (f.parent) {
      if (!features.has(f.parent)) {
        out.push({ severity: "error", path, message: `unknown parent feature "${f.parent}"` });
      } else if (f.parent === f.code) {
        out.push({ severity: "error", path, message: "feature is its own parent" });
      } else if (f.section !== features.get(f.parent)?.section) {
        out.push({
          severity: "warning",
          path,
          message:
            "property sits in a different section from its parent, so it will render apart from it",
        });
      }
    }
    // An effect against an option that does not exist can never be shown, and an
    // option missing from the table reads as "no effect" without saying so.
    if (f.optionEffects?.length) {
      const valid = new Set((f.options ?? []).map((o) => o.value));
      for (const e of f.optionEffects) {
        if (!valid.has(e.option)) {
          out.push({
            severity: "error",
            path,
            message: `optionEffects names option "${e.option}", which this feature does not define`,
          });
        }
      }
      for (const o of f.options ?? []) {
        if (!f.optionEffects.some((e) => e.option === o.value)) {
          out.push({
            severity: "error",
            path,
            message: `option "${o.value}" has no entry in optionEffects — silence reads as "no effect"`,
          });
        }
      }
    }
    if (f.showWhen) {
      checkPredicate(f.showWhen, `${path}.showWhen`, features, out);
    }
    (f.showWhenAll ?? []).forEach((p, i) =>
      checkPredicate(p, `${path}.showWhenAll[${i}]`, features, out),
    );
    (f.showWhenAny ?? []).forEach((p, i) =>
      checkPredicate(p, `${path}.showWhenAny[${i}]`, features, out),
    );

    // A group must be declared on the section that renders it, and a property
    // must not claim one — it belongs to whichever band its finding sits in, and
    // two different answers would put a question in a band its parent is not in.
    if (f.group) {
      if (f.parent) {
        out.push({
          severity: "error",
          path,
          message: "a property must not declare a group — it inherits its finding's",
        });
      }
      const declared = catalog.sections.find((s) => s.id === f.section)?.groups ?? [];
      if (!declared.some((g) => g.id === f.group)) {
        out.push({
          severity: "error",
          path,
          message: `group "${f.group}" is not declared on section "${f.section}"`,
        });
      }
    }
    // A pointer at a complication that does not exist can never prompt anything.
    for (const code of f.suggests ?? []) {
      if (!catalog.complications.some((c) => c.code === code)) {
        out.push({
          severity: "error",
          path,
          message: `suggests unknown complication "${code}"`,
        });
      }
    }
    if (f.dangerSign) {
      checkCitation(f.dangerSign.citation, `${path}.dangerSign.citation`, out);
      if (f.dangerSign.when) {
        checkCriterion(f.dangerSign.when, `${path}.dangerSign.when`, features, out);
      }
      if (!f.dangerSign.action.trim()) {
        out.push({
          severity: "error",
          path,
          message: "danger sign has no action — a warning with nothing to do is noise",
        });
      }
    }
  }

  // A property chain that loops would render forever; one that runs too deep has
  // no register left to render it in, and would be silently flattened.
  for (const f of catalog.features) {
    const seen = new Set<string>([f.code]);
    let cur = f.parent;
    let depth = 0;
    while (cur) {
      if (seen.has(cur)) {
        out.push({
          severity: "error",
          path: `features.${f.code}`,
          message: `parent chain forms a cycle at "${cur}"`,
        });
        break;
      }
      seen.add(cur);
      depth += 1;
      if (depth > MAX_PROPERTY_DEPTH) {
        out.push({
          severity: "error",
          path: `features.${f.code}`,
          message: `property chain is ${depth} deep — the form renders at most ${MAX_PROPERTY_DEPTH}`,
        });
        break;
      }
      cur = features.get(cur)?.parent;
    }
  }

  // Sections declare their bands; a band nobody is in renders as an empty heading.
  for (const s of catalog.sections) {
    for (const d of dupes((s.groups ?? []).map((g) => g.id))) {
      out.push({ severity: "error", path: `sections.${s.id}`, message: `duplicate group "${d}"` });
    }
    for (const d of dupes((s.groups ?? []).map((g) => String(g.order)))) {
      out.push({
        severity: "error",
        path: `sections.${s.id}`,
        message: `two or more groups share order ${d}`,
      });
    }
    const byId = new Map((s.groups ?? []).map((g) => [g.id, g]));
    for (const g of s.groups ?? []) {
      /**
       * A group nests ONE level. A region inside a region is a section that
       * should have been split, and a parent that does not exist is a band that
       * renders nowhere.
       */
      if (g.parent !== undefined) {
        const parent = byId.get(g.parent);
        if (!parent) {
          out.push({
            severity: "error",
            path: `sections.${s.id}.groups.${g.id}`,
            message: `parent group "${g.parent}" is not declared in this section`,
          });
        } else if (parent.parent !== undefined) {
          out.push({
            severity: "error",
            path: `sections.${s.id}.groups.${g.id}`,
            message: `nested two deep under "${g.parent}" — groups nest one level`,
          });
        }
      }
      // A parent group holds its regions' features, not its own: counting only
      // direct members would call a fully populated segment empty.
      const children = new Set((s.groups ?? []).filter((c) => c.parent === g.id).map((c) => c.id));
      const members = catalog.features.filter(
        (f) => f.section === s.id && (f.group === g.id || (f.group && children.has(f.group))),
      );
      if (!members.length) {
        out.push({
          /**
           * In a stacked section an empty group is a dangling heading over
           * nothing, which is a defect. In a SEGMENTED one it is a tab the
           * surface renders as "not built yet" — a legible state while a
           * section is being built out, and one a clinician can tell apart from
           * "nothing to record here". Still worth saying out loud, so it stays
           * a warning rather than passing silently.
           */
          severity: s.segmented ? "warning" : "error",
          path: `sections.${s.id}.groups.${g.id}`,
          message: s.segmented
            ? "segment has no features yet — it renders as a not-built-yet card"
            : "group has no features — it would render as an empty heading",
        });
      }
    }
    // Half-grouped is worse than ungrouped: the ungrouped rows fall below the
    // last band and read as belonging to it.
    // Off-protocol capture renders outside the banded card, so it is in no band.
    const inSection = catalog.features.filter(
      (f) => f.section === s.id && !f.parent && !f.offProtocol,
    );
    const grouped = inSection.filter((f) => f.group);
    if (grouped.length && grouped.length !== inSection.length) {
      out.push({
        severity: "error",
        path: `sections.${s.id}`,
        message: `${inSection.length - grouped.length} of ${inSection.length} findings have no group — group all of them or none`,
      });
    }
  }

  // Off-protocol capture is free text. A rule that reads it is a rule decided by
  // prose, which is precisely what the citation discipline exists to prevent.
  const offProtocol = new Set(catalog.features.filter((f) => f.offProtocol).map((f) => f.code));
  if (offProtocol.size) {
    for (const code of referencedFeatures(catalog)) {
      if (offProtocol.has(code)) {
        out.push({
          severity: "error",
          path: `features.${code}`,
          message: "off-protocol feature is referenced by a clinical rule",
        });
      }
    }
  }

  for (const set of catalog.diagnosis) {
    const path = `diagnosis.${set.id}`;
    if (!set.anyOf.length) {
      out.push({ severity: "error", path, message: "criteria set has no criteria" });
    }
    checkCitation(set.citation, `${path}.citation`, out);
    set.anyOf.forEach((c) => checkCriterion(c, `${path}.${c.id}`, features, out));
  }

  for (const cl of catalog.classifications ?? []) {
    const path = `classifications.${cl.code}`;
    checkCitation(cl.citation, `${path}.citation`, out);
    cl.supportedBy.forEach((c) => checkCriterion(c, `${path}.supportedBy.${c.id}`, features, out));
    (cl.refutedBy ?? []).forEach((c) =>
      checkCriterion(c, `${path}.refutedBy.${c.id}`, features, out),
    );
    for (const d of cl.discriminators ?? []) {
      if (!features.has(d)) {
        out.push({ severity: "error", path, message: `unknown discriminator feature "${d}"` });
      }
    }
  }

  for (const comp of catalog.complications) {
    const path = `complications.${comp.code}`;
    checkCitation(comp.citation, `${path}.citation`, out);
    if (!comp.establishedBy.length) {
      out.push({ severity: "error", path, message: "complication has no establishedBy criteria" });
    }
    comp.establishedBy.forEach((c) =>
      checkCriterion(c, `${path}.establishedBy.${c.id}`, features, out),
    );
    for (const s of comp.screenedBy) {
      if (!features.has(s)) {
        out.push({ severity: "error", path, message: `screenedBy unknown feature "${s}"` });
      }
    }
    if (!comp.screenedBy.length) {
      out.push({
        severity: "warning",
        path,
        message: "no screenedBy features — this complication can never appear in the gaps list",
      });
    }
    // An acute complication with no emergency action is the failure mode where
    // a DKA renders as a checklist row.
    if (comp.timing === "acute" && !comp.emergency) {
      out.push({
        severity: "error",
        path,
        message: "acute complication has no emergency action",
      });
    }
    if (comp.timing === "chronic" && comp.emergency) {
      out.push({
        severity: "warning",
        path,
        message: "chronic complication carries an emergency action",
      });
    }
    if (comp.emergency) checkCitation(comp.emergency.citation, `${path}.emergency.citation`, out);
    for (const st of comp.staging ?? []) {
      const sp = `${path}.staging.${st.id}`;
      checkCitation(st.citation, `${sp}.citation`, out);
      if (!st.stages.length)
        out.push({ severity: "error", path: sp, message: "staging has no stages" });
      for (const d of dupes(st.stages.map((s) => s.code))) {
        out.push({ severity: "error", path: sp, message: `duplicate stage code "${d}"` });
      }
      st.stages.forEach((s) => checkCriterion(s.when, `${sp}.${s.code}`, features, out));
    }
    for (const si of comp.screeningIntervals ?? []) {
      checkCitation(si.citation, `${path}.screeningInterval.citation`, out);
      if (si.months <= 0) {
        out.push({ severity: "error", path, message: "screening interval must be positive" });
      }
      if (si.forStage) {
        const known = (comp.staging ?? []).some((st) =>
          st.stages.some((s) => s.code === si.forStage),
        );
        if (!known) {
          out.push({
            severity: "error",
            path,
            message: `screening interval references unknown stage "${si.forStage}"`,
          });
        }
      }
    }
  }

  for (const vc of catalog.validityCaveats ?? []) {
    const path = `validityCaveats.${vc.id}`;
    checkCitation(vc.citation, `${path}.citation`, out);
    checkCriterion(vc.when, `${path}.when`, features, out);
    if (!features.has(vc.feature)) {
      out.push({ severity: "error", path, message: `unknown feature "${vc.feature}"` });
    }
    // A caveat that blocks diagnosis without saying what to use instead leaves
    // the clinician stuck: they are told not to trust the test and offered
    // nothing in its place.
    if (vc.blocksDiagnosis && !vc.alternative) {
      out.push({
        severity: "warning",
        path,
        message: "blocksDiagnosis without an `alternative` — the clinician is left with no route",
      });
    }
  }

  for (const rm of catalog.riskModels ?? []) {
    const path = `riskModels.${rm.id}`;
    checkCitation(rm.citation, `${path}.citation`, out);
    for (const r of rm.requires) {
      if (!features.has(r)) {
        out.push({ severity: "error", path, message: `requires unknown feature "${r}"` });
      }
    }
    if (!rm.bands.length) out.push({ severity: "error", path, message: "risk model has no bands" });
    rm.bands.forEach((b) => checkCriterion(b.when, `${path}.${b.code}`, features, out));
    // Applying a risk equation outside the population it was derived in, without
    // saying so, is how a borrowed number gets read as a local one.
    if (!rm.validatedIn?.length && !rm.applicabilityNote) {
      out.push({
        severity: "warning",
        path,
        message: "no validatedIn population and no applicabilityNote",
      });
    }
  }

  for (const t of catalog.interpretation ?? []) {
    const path = `interpretation.${t.id}`;
    checkCitation(t.citation, `${path}.citation`, out);
    if (!features.has(t.feature)) {
      out.push({ severity: "error", path, message: `unknown feature "${t.feature}"` });
    }
    if (!t.bands.length) {
      out.push({ severity: "error", path, message: "interpretation table has no bands" });
      continue;
    }

    // The bands must TILE the number line: no gap a value could fall through,
    // no overlap that would put one value in two bands.
    const first = t.bands[0]!;
    const last = t.bands[t.bands.length - 1]!;
    if (first.from !== undefined) {
      out.push({ severity: "error", path, message: "lowest band is not open below" });
    }
    if (last.to !== undefined) {
      out.push({ severity: "error", path, message: "highest band is not open above" });
    }
    for (let i = 0; i < t.bands.length - 1; i++) {
      if (t.bands[i]!.to !== t.bands[i + 1]!.from) {
        out.push({
          severity: "error",
          path,
          message: `bands leave a gap or overlap between "${t.bands[i]!.code}" and "${t.bands[i + 1]!.code}"`,
        });
      }
    }

    for (const b of t.bands) {
      if (b.alert && (!b.alert.title.trim() || !b.alert.action.trim())) {
        out.push({
          severity: "error",
          path,
          message: `band "${b.code}" raises an alert with no title or action`,
        });
      }
    }

    /**
     * THE ANTI-DRIFT RULE. The diagnostic band's boundary has to be a threshold
     * that standard's own criteria actually use. Without this the table and the
     * criteria are two sources of truth for the same number, and the first edit
     * to one of them makes the surface disagree with the verdict beneath it.
     */
    const diag = t.bands.find((b) => b.tone === "diagnostic");
    const set = catalog.diagnosis.find((d) => d.standard === t.standard);
    if (diag?.from !== undefined && set) {
      const used = new Set(
        set.anyOf
          .flatMap((c) => [...(c.all ?? []), ...(c.any ?? []), ...(c.atLeast?.of ?? [])])
          .filter((pr) => pr.feature === t.feature && typeof pr.value === "number")
          .map((pr) => pr.value as number),
      );
      if (used.size && !used.has(diag.from)) {
        out.push({
          severity: "error",
          path,
          message: `diagnostic band starts at ${diag.from}, which is not a threshold ${t.standard} uses for "${t.feature}" (${[...used].join(", ")})`,
        });
      }
    }
  }

  for (const d of dupes((catalog.interpretation ?? []).map((t) => t.id))) {
    out.push({ severity: "error", path: "interpretation", message: `duplicate table "${d}"` });
  }

  for (const tf of catalog.therapyFlags ?? []) {
    const path = `therapyFlags.${tf.id}`;
    checkCitation(tf.citation, `${path}.citation`, out);
    checkCriterion(tf.when, `${path}.when`, features, out);
    if (!tf.action.trim()) {
      out.push({
        severity: "error",
        path,
        message: "therapy flag has no action — a warning with nothing to do is noise",
      });
    }
    // The one boundary this construct exists inside. A flag that carries a dose
    // has stopped being decision support and started prescribing.
    //
    // A unit followed by "/" is a RATE, not a dose — "eGFR below 30 mL/min" is a
    // threshold the guideline states and the flag must be free to quote it. The
    // lookahead is what separates the two, and it was added because the guard
    // caught exactly that sentence on its first run.
    if (/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|units?|u|ml)\b(?!\s*\/)/i.test(tf.action)) {
      out.push({
        severity: "error",
        path,
        message: "therapy flag action contains a dose — this engine never prescribes",
      });
    }
  }

  for (const d of dupes((catalog.therapyFlags ?? []).map((t) => t.id))) {
    out.push({ severity: "error", path: "therapyFlags", message: `duplicate flag "${d}"` });
  }

  for (const ms of catalog.management ?? []) {
    const path = `management.${ms.id}`;
    checkCitation(ms.citation, `${path}.citation`, out);
    checkCriterion(ms.when, `${path}.when`, features, out);
    (ms.contraindications ?? []).forEach((c) =>
      checkCriterion(c, `${path}.contraindication.${c.id}`, features, out),
    );
  }

  return out;
}

export const errorsOf = (issues: ValidationIssue[]) => issues.filter((i) => i.severity === "error");

/**
 * Feature codes referenced anywhere in the catalog's logic — including the
 * display gates, which are evaluated by the same evaluator the clinical rules
 * use. Leaving them out made a typo in a `showWhen` invisible to the
 * unknown-feature test, so the question it gated simply never appeared.
 */
export function referencedFeatures(catalog: NcdCatalog): Set<string> {
  const out = new Set<string>();
  const add = (c: Criterion) => criterionFeatures(c).forEach((f) => out.add(f));
  catalog.features.forEach((f) => {
    if (f.showWhen) out.add(f.showWhen.feature);
    (f.showWhenAll ?? []).forEach((p) => out.add(p.feature));
    (f.showWhenAny ?? []).forEach((p) => out.add(p.feature));
    if (f.dangerSign?.when) add(f.dangerSign.when);
  });
  catalog.diagnosis.forEach((s) => s.anyOf.forEach(add));
  (catalog.classifications ?? []).forEach((c) => {
    c.supportedBy.forEach(add);
    (c.refutedBy ?? []).forEach(add);
    (c.discriminators ?? []).forEach((d) => out.add(d));
  });
  catalog.complications.forEach((c) => {
    c.establishedBy.forEach(add);
    c.screenedBy.forEach((s) => out.add(s));
    (c.staging ?? []).forEach((st) => st.stages.forEach((s) => add(s.when)));
  });
  (catalog.riskModels ?? []).forEach((m) => {
    m.requires.forEach((r) => out.add(r));
    m.bands.forEach((b) => add(b.when));
  });
  (catalog.validityCaveats ?? []).forEach((v) => {
    add(v.when);
    out.add(v.feature);
  });
  (catalog.therapyFlags ?? []).forEach((t) => add(t.when));
  (catalog.interpretation ?? []).forEach((t) => out.add(t.feature));
  (catalog.management ?? []).forEach((m) => {
    add(m.when);
    (m.contraindications ?? []).forEach(add);
  });
  return out;
}
