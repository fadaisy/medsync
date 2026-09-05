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

import { criterionFeatures } from "@/lib/ncd/catalog/schema";

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
    if (f.showWhen) {
      checkPredicate(f.showWhen, `${path}.showWhen`, features, out);
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

  // A property chain that loops would render forever.
  for (const f of catalog.features) {
    const seen = new Set<string>([f.code]);
    let cur = f.parent;
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
      cur = features.get(cur)?.parent;
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

/** Feature codes referenced anywhere in the catalog's logic. */
export function referencedFeatures(catalog: NcdCatalog): Set<string> {
  const out = new Set<string>();
  const add = (c: Criterion) => criterionFeatures(c).forEach((f) => out.add(f));
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
  (catalog.management ?? []).forEach((m) => {
    add(m.when);
    (m.contraindications ?? []).forEach(add);
  });
  return out;
}
