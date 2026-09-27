import type { ExamSignoff } from "./classifiers";

import raw from "@/data/clerking/clerking-exam-catalogue.v1.json";
import signoff from "@/data/clerking/exam-signoff.v1.json";
import { parseExamCatalogue } from "./catalogue";

/** The examination catalogue, parsed and indexed once per process, and its signature. */
export const EXAM_CATALOGUE = parseExamCatalogue(raw);

export const EXAM_SIGNOFF: ExamSignoff & { catalogueSha256: string } = {
  flagRules: signoff.flagRules as ExamSignoff["flagRules"],
  referenceEntries: signoff.referenceEntries as ExamSignoff["referenceEntries"],
  classifiers: signoff.classifiers as ExamSignoff["classifiers"],
  withheld: signoff.withheld,
  catalogueSha256: signoff.catalogueSha256,
};
