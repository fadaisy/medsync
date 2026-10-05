/**
 * Renders the standard module to Markdown, so docs/ncd/NCDREG-v0.1-DRAFT.md and CONDITION-MODULES.md
 * can never drift from the code (§5). `npm run ncdreg:docs` writes them; a test re-renders and compares.
 */
import { CARE_BAND_RULE, FORMULAS, HTN_GRADE_TABLE } from "./calculations";
import { CLASSIFICATIONS } from "./classifications";
import { ALL_CODE_LISTS, MEDICINE_LIST, STANDARD_VERSION } from "./code-lists";
import { CONDITION_CATALOGUE } from "./conditions";
import { DICTIONARY } from "./dictionary";
import { ALL_INDICATORS, WINDOWS } from "./indicators";
import { CONFIRM_RANGES, CONSISTENCY_RULES, DUPLICATE_RULES, HARD_BLOCKS } from "./validation";

const esc = (s: string) => s.replace(/\|/g, "\\|");
const row = (cells: (string | number | boolean | undefined | null)[]) =>
  `| ${cells.map((c) => esc(c == null || c === "" ? "–" : String(c))).join(" | ")} |`;
const table = (head: string[], rows: (string | number | boolean | undefined | null)[][]) =>
  [row(head), `| ${head.map(() => "---").join(" | ")} |`, ...rows.map(row)].join("\n");

const HEADER = (title: string) =>
  [
    `# ${title}`,
    "",
    `Generated from \`lib/ncdreg/standard/\` by \`npm run ncdreg:docs\`. Do not edit by hand.`,
    "",
    `Standard version **${STANDARD_VERSION}**. Status: **draft** throughout. Nothing here is approved for patient data;`,
    "every item needs Clinical Safety Officer and Registry Technical Group sign-off (docs/ncd/SIGNOFF-REGISTER.md).",
    "",
  ].join("\n");

export function renderStandard(): string {
  const out: string[] = [HEADER("NCDReg version 0.1 (draft)")];
  out.push("## 1. Record types and data dictionary\n");
  for (const r of DICTIONARY.records) {
    out.push(`### ${r.record}\n\n${r.cardinality}; ${r.purpose}.\n`);
    out.push(
      table(
        [
          "Field",
          "Type",
          "Code list",
          "Unit",
          "Required",
          "Identifying (encrypted)",
          "Calculated",
          "Note",
        ],
        r.fields.map((x) => [
          x.name,
          x.type,
          x.codeList,
          x.unit,
          x.required ? "yes" : "",
          x.identifying ? "yes" : "",
          x.calculated ? "yes" : "",
          x.note,
        ]),
      ),
      "",
    );
  }
  out.push("## 2. Code lists\n");
  for (const l of ALL_CODE_LISTS) {
    out.push(
      `### ${l.label} (\`${l.id}\`, ${l.version}, ${l.status}${l.verified === false ? ", unverified" : ""})\n`,
    );
    out.push(
      table(
        ["Code", "Label"],
        l.codes.map((x) => [x.code, x.label]),
      ),
      "",
    );
  }
  out.push(
    `### Medicine list (${MEDICINE_LIST.version}, ${MEDICINE_LIST.status}, unverified ATC)\n`,
  );
  out.push(
    table(
      ["Code", "Label", "ATC", "Group"],
      MEDICINE_LIST.medicines.map((m) => [m.code, m.label, m.atc, m.group]),
    ),
    "",
  );
  out.push("No doses are recorded in this version.\n");
  out.push("## 3. Calculations\n");
  out.push(
    table(
      ["Id", "Formula version", "Status", "Definition"],
      Object.values(FORMULAS).map((x) => [x.id, x.version, x.status, x.text]),
    ),
    "",
  );
  out.push(
    `Hypertension grade table (${HTN_GRADE_TABLE.version}, ${HTN_GRADE_TABLE.status}): ${HTN_GRADE_TABLE.note}\n`,
  );
  out.push(
    table(
      ["Grade", "Systolic from", "Diastolic from"],
      HTN_GRADE_TABLE.grades.map((g) => [g.grade, g.systolic, g.diastolic]),
    ),
    "",
  );
  out.push(
    `Care band complication rule (${CARE_BAND_RULE.version}, ${CARE_BAND_RULE.status}): registrations ${CARE_BAND_RULE.complication_registrations.join(", ")}; ` +
      `events ${CARE_BAND_RULE.complication_events.join(", ")}; known cardiovascular disease; eGFR below 60 or ACR A2/A3; ` +
      "retinopathy of any grade or macular oedema; foot risk 2 or 3, current ulcer or amputation.\n",
  );
  out.push(
    'Every calculated category is shown as "category from latest result", never as a diagnosis.\n',
  );
  out.push("## 4. Outcome classifications\n");
  out.push(
    table(
      ["Id", "Version", "Status", "Rule"],
      Object.values(CLASSIFICATIONS).map((c) => [c.id, c.version, c.status, c.text]),
    ),
    "",
  );
  out.push("## 5. Validation\n");
  out.push(`### Hard blocks (${HARD_BLOCKS.version})\n`);
  out.push(
    table(
      ["Rule", "Blocks"],
      HARD_BLOCKS.rules.map((r) => [r.id, r.text]),
    ),
    "",
  );
  out.push(`### Confirm, never block (${CONFIRM_RANGES.version})\n`);
  out.push(
    table(
      ["Field", "Low", "High"],
      Object.entries(CONFIRM_RANGES.ranges).map(([k, [a, b]]) => [k, a, b]),
    ),
    "",
  );
  out.push("Systolic not above diastolic also asks for confirmation.\n");
  out.push(
    `### Consistency queries (${CONSISTENCY_RULES.version}): to the registry lead's query list, never an alert\n`,
  );
  out.push(
    table(
      ["Rule", "Query"],
      CONSISTENCY_RULES.rules.map((r) => [r.id, r.text]),
    ),
    "",
  );
  out.push(
    `### Duplicate check (${DUPLICATE_RULES.version}, ${DUPLICATE_RULES.status})\n\n` +
      `Definite: same hospital number or same national ID. Probable: same phone plus similar name, or similar name plus same sex plus birth year within ${DUPLICATE_RULES.birth_year_band}. ` +
      `Possible: similar name plus same sex (the ${DUPLICATE_RULES.possible_listed} closest are listed). Similar name: ${DUPLICATE_RULES.name_similarity}, threshold ${DUPLICATE_RULES.similar_name_threshold}.\n`,
  );
  out.push("## 6. Indicators\n");
  out.push(
    `Windows (${WINDOWS.version}): past 3 months = the reporting month and the two before it; past 12 months = the reporting month and the eleven before it; returned to care within ${WINDOWS.returned_days} days. Time zone: the facility's (Africa/Kampala by default).\n`,
  );
  out.push(
    table(
      ["Code", "Indicator", "Numerator", "Denominator", "Condition", "Version"],
      ALL_INDICATORS.map((i) => [
        i.code,
        i.label,
        i.numerator,
        i.denominator,
        i.condition,
        i.version,
      ]),
    ),
    "",
  );
  out.push(
    "G-indicators are computed for every enabled condition and reported as code plus condition, for example `G04.asthma`.\n",
  );
  out.push("## 7. Condition catalogue\n\nSee CONDITION-MODULES.md.\n");
  return out.join("\n");
}

export function renderConditionModules(): string {
  const out: string[] = [HEADER("NCDReg condition modules")];
  out.push(
    table(
      [
        "Code",
        "Label",
        "Level",
        "Status",
        "Version",
        "Enabled by default",
        "Outcome",
        "Outcome label",
        "Review components",
      ],
      CONDITION_CATALOGUE.map((m) => [
        m.code,
        m.label,
        m.level,
        m.status,
        m.version,
        m.enabled_by_default ? "yes" : "no",
        m.outcome_classification.kind === "rule"
          ? `rule: ${m.outcome_classification.classification}`
          : "clinician recorded",
        m.outcome_label,
        m.review_components.map((r) => `${r.component} (${r.interval_months} m)`).join(", "),
      ]),
    ),
    "",
  );
  for (const m of CONDITION_CATALOGUE) {
    out.push(`## ${m.label} (\`${m.code}\`)\n`);
    out.push(
      `- Level: ${m.level}. Status: ${m.status}. Version ${m.version}, effective ${m.effective_from}.`,
    );
    out.push(`- Subtypes: ${m.subtypes.map((s) => s.code).join(", ")}.`);
    out.push(`- Basis of diagnosis: ${m.basis_of_diagnosis.map((s) => s.code).join(", ")}.`);
    out.push(
      `- Diagnosis codes: ${m.diagnosis_codes.length ? m.diagnosis_codes.map((d) => `${d.icd11}/${d.icd10} ${d.label}`).join("; ") + " (unverified)" : "none (sign-off register)"}.`,
    );
    out.push(
      `- Medicine groups offered first: ${m.medicine_groups.join(", ") || 'none; medicines through "other" until an approved list is supplied'}.`,
    );
    out.push(
      `- Visit fields: ${m.visit_fields.map((v) => `${v.code} (${v.type}${v.unit ? `, ${v.unit}` : ""}, ${v.requirement}, ${v.storage})`).join("; ") || "none beyond the shared fields"}.`,
    );
    out.push(
      `- Outcome: ${m.outcome_classification.kind === "rule" ? `rule \`${m.outcome_classification.classification}\`, classes ${m.outcome_classification.classes.join(", ")}; leading class ${m.outcome_classification.in_range}` : 'clinician-recorded control (controlled, partly_controlled, not_controlled, not_assessed); leading class controlled; tagged "Clinician-recorded"'}.`,
    );
    out.push(
      `- Admission reasons added: ${m.admission_reasons.map((a) => a.code).join(", ") || "none"}.`,
    );
    out.push(`- SMS banned terms: ${m.sms_banned_terms.join(", ")}.`);
    if (m.level === "core")
      out.push(
        "- Still empty: thresholds, diagnosis codes, medicine list, further subtypes (sign-off register).",
      );
    out.push("");
  }
  out.push(
    "Adding a condition needs a catalogue record and nothing else: no migration, no new screen, no new indicator code.\n",
  );
  return out.join("\n");
}
