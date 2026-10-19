import { LABWS2_QUALITY } from "@/content/lab-workspace-v2-quality";

/**
 * The New QC plan form (Lab Workspace v2, prompt 5.11; S26), pure parts: the test options for the chosen
 * analyser (by name, with unit, section and whether that analyser runs it; never a concept id) and what is still
 * missing before Save draft. The form sends the same `saveQcPlanAction` arguments the plan dialog sends.
 */

export interface PlanComponent {
  conceptId: string;
  name: string;
  unit: string | null;
  section: string | null;
}

export interface PlanAnalyser {
  id: string;
  model: string;
  section: string | null;
  linkedConcepts: readonly string[];
}

export interface TestOption {
  value: string;
  label: string;
  detail: string;
  unavailable?: boolean;
}

const P = LABWS2_QUALITY.newPlan;

/**
 * Options for the test combobox. A test the analyser does not list is shown and marked, not choosable. An
 * analyser that lists no tests at all (registered before its components were named) offers every test, each
 * saying so, rather than none.
 */
export function testOptions(
  components: readonly PlanComponent[],
  analyser: PlanAnalyser | null,
): TestOption[] {
  return components
    .map((c) => {
      const unit = c.unit ?? P.noUnit;
      if (!analyser)
        return {
          value: c.conceptId,
          label: c.name,
          detail: [unit, c.section].filter(Boolean).join(" · "),
        };
      if (!analyser.linkedConcepts.length)
        return {
          value: c.conceptId,
          label: c.name,
          detail: P.testNotListed(unit, c.section, analyser.model),
        };
      const runs = analyser.linkedConcepts.includes(c.conceptId);
      return {
        value: c.conceptId,
        label: c.name,
        detail: runs
          ? P.testRunOn(unit, c.section, analyser.model)
          : P.testNotRunOn(unit, c.section, analyser.model),
        ...(runs ? {} : { unavailable: true }),
      };
    })
    .sort(
      (a, b) => Number(!!a.unavailable) - Number(!!b.unavailable) || a.label.localeCompare(b.label),
    );
}

export interface PlanDraftState {
  analyserId: string;
  conceptId: string;
  unit: string;
  lotId: string;
  levels: readonly { label: string; mean: string; sd: string }[];
  frequency: string;
  n: number | null;
  rejectRules: readonly string[];
  source: string;
}

const decimal = (s: string) => s.trim() !== "" && Number.isFinite(Number(s));

/** What Save draft still needs, in the order of the form (an empty list means it can save). */
export function planMissing(d: PlanDraftState, testChoosable: boolean): string[] {
  const N = P.need;
  const out: string[] = [];
  if (!d.analyserId) out.push(N.analyser);
  if (!d.conceptId || !testChoosable) out.push(N.test);
  else if (!d.unit.trim()) out.push(N.unit);
  if (!d.levels.length) out.push(N.levels);
  if (!d.lotId) out.push(N.lot);
  if (!d.frequency) out.push(N.when);
  else if (d.frequency === "per_n_samples" && !(d.n && d.n > 0)) out.push(N.n);
  if (d.levels.some((l) => !l.label.trim())) out.push(N.label);
  if (d.levels.some((l) => !decimal(l.mean))) out.push(N.mean);
  if (d.levels.some((l) => !decimal(l.sd) || Number(l.sd) <= 0)) out.push(N.sd);
  if (!d.rejectRules.length) out.push(N.reject);
  if (d.source.trim().length < 3) out.push(N.source);
  return out;
}
