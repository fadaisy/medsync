/**
 * What a row of the EMHSLU list means for the item (SUPPLIES.md §A, §B). Pure, used by the generated migration and its
 * test. Each flag is a starting point the store keeper can change on the item; the PDF states none of them.
 */
export type IssueUnit = "piece" | "pair" | "packet" | "roll" | "test" | "strip" | "bottle";

export interface SupplyRow {
  section: "B" | "C" | "D";
  category: string;
  name: string;
  specification: string;
  unit: string;
  level: string;
  ven: string;
}

/** HC IV is HC4; a general hospital is H; the national laboratories count as the national level. */
const LEVELS: Record<string, string> = {
  HC1: "HC1",
  HC2: "HC2",
  HC3: "HC3",
  HC4: "HC4",
  "HC IV": "HC4",
  H: "H",
  GH: "H",
  RR: "RR",
  RRH: "RR",
  NR: "NR",
  NTRL: "NR",
  NRTL: "NR",
  UBTS: "NR",
};
export const levelOf = (printed: string) => LEVELS[printed] ?? null;

/** The EMHSLU sub-headings the spec names (§A); D's other headings stay as printed, under "Laboratory:". */
export function categoryOf(r: Pick<SupplyRow, "section" | "category" | "name">) {
  if (r.section !== "D") return r.category;
  if (r.category === "Rapid testing") return "Laboratory: rapid tests";
  if (/\bstrips?\b/i.test(r.name)) return "Laboratory: test strips";
  return `Laboratory: ${r.category}`;
}

const STERILE_NAME =
  /^(syringe|needle|cannula iv|set, infusion|blood (giving|transfusion) set|catheter|suction catheter|nasogastric|endotracheal|suture|polyglycolic|polyglactin|disposable umbilical|mucus extractor|surgeon gloves)/i;
const isSterile = (r: SupplyRow) => {
  const text = `${r.name} ${r.specification}`;
  if (/\bn?on[- ]?sterile/i.test(text)) return false; // the PDF also prints "on-sterile"
  return /\bsterile\b/i.test(text) || (r.section !== "D" && STERILE_NAME.test(r.name));
};

/** The EMHSLU unit where it is one of ours; B and C print none, so these start at piece. */
function unitOf(r: SupplyRow): IssueUnit {
  const u = r.unit.toLowerCase();
  if (u === "test" || u === "tests") return "test";
  if (u === "strip" || u === "strips") return "strip";
  if (/\bbottle\b/.test(u)) return "bottle";
  if (/gloves/i.test(r.category) && /surgeon|gynaecological|surgical/i.test(r.name)) return "pair";
  return "piece";
}

export function supplyDefaults(r: SupplyRow) {
  const kit = r.section === "D" && categoryOf(r) !== `Laboratory: ${r.category}`;
  return {
    category: categoryOf(r),
    issueUnit: unitOf(r),
    level: levelOf(r.level),
    sterile: isSterile(r),
    testKit: kit,
    noExpiry: /safety box/i.test(r.name),
    /** National programme kits (the prototype's HIV and malaria rapid tests). */
    freeIssue: r.category === "Rapid testing" && /^(hiv|wondflo hiv|malaria)/i.test(r.name),
  };
}

/** The type comes from the section, never from a person (§A). */
export const typeOfSection = (s: SupplyRow["section"]) =>
  s === "D" ? ("lab_supply" as const) : ("health_supply" as const);
