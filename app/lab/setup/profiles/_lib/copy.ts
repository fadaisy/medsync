import type { Blocker, MappingError, ProfileKind, Visibility } from "@/lib/lab/profiles";

/** Analyser profiles (§5.11, artboard 11): the route's own labels. */
export const PROFILES = {
  title: "Analyser profiles",
  lede: "A profile says, for each code an analyser prints, which result it fills in MedSync and who sees it. A profile is used only when every parameter is mapped, every open question is answered and every result is verified on this analyser.",
  add: "Add a profile",
  addTitle: "Add an analyser profile",
  addLede:
    "The profile starts from the model's codes. Answer its open questions and verify each result before it is used.",
  model: "Analyser model",
  chooseModel: "Choose a model",
  bench: "Bench (optional)",
  create: "Add the profile",
  cancel: "Cancel",
  none: "No analyser profile yet.",
  open: "Open",
  kind: {
    five_part: "5-part",
    three_part: "3-part",
    chemistry: "Chemistry",
    other: "Other",
  } as Record<ProfileKind, string>,
  parameters: (n: number) => `${n} parameter${n === 1 ? "" : "s"}`,
  noBench: "No bench named",
  state: {
    draft: "Draft",
    inUse: (date: string) => `In use since ${date}`,
    retired: "Retired",
  },
  readOnly: "A profile in use is not changed: add a new one.",
  columns: [
    "On the analyser",
    "Result in MedSync",
    "Who sees it",
    "Verified on this analyser (CLSI EP28)",
  ],
  visibility: {
    clinician: "Clinicians and lab",
    lab_only: "Lab only",
    never: "Never released",
  } as Record<Visibility, string>,
  researchConcept: "Research use: never imported",
  verifiedLabel: (code: string) => `${code} verified on this analyser (CLSI EP28)`,
  notReleased: "Not released",
  checksTitle: "Still to confirm",
  found: "What you found",
  record: "Record",
  recorded: "Recorded.",
  answered: (text: string) => `Found: ${text}`,
  saved: "Saved.",
  blockersTitle: "Before this profile is used",
  noBlockers: "Nothing left to do.",
  use: "Use this profile",
  used: "Profile in use. The one in use before it on this bench is retired.",
  sideCard:
    "MID and GRAN are never neutrophils. A 3-part analyser's middle cells and granulocytes are their own results.",
} as const;

const REFUSED: Record<MappingError["error"], string> = {
  research_use: "a research-use parameter is never released",
  wrong_differential: "this analyser cannot fill that differential",
  not_a_component: "the result is not part of this test",
  duplicate: "the code is mapped twice",
};

/** A blocker in words. `display` turns a concept id into its name. */
export function blockerWords(b: Blocker, display: (concept: string) => string): string {
  switch (b.kind) {
    case "unmapped":
      return `${b.code} is not mapped to a result.`;
    case "open_check":
      return `${b.code}: ${b.question}`;
    case "not_verified":
      return `${display(b.concept)} is not yet verified on this analyser.`;
    case "mapping":
      return `${b.error.code}: mapping refused (${REFUSED[b.error.error]}).`;
  }
}
