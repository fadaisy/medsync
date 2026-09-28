import type { Signoff } from "./flags";

import signoff from "@/data/clerking/catalogue-signoff.v1.json";
import raw from "@/data/clerking/clerking-history-catalogue.v1.json";
import legacy from "@/data/clerking/legacy-conversion.v1.json";
import tokenMap from "@/data/clerking/token-map.v1.json";
import { parseCatalogue } from "./catalogue";
import { parseLegacyTable } from "./legacy";

/** The signed clerking catalogue, parsed once per process (the JSON ships with the build). */
export const CLERKING_CATALOGUE = parseCatalogue(raw);
export const CLERKING_SIGNOFF: Signoff & { catalogueSha256: string } = {
  flagRules: signoff.flagRules === "all" ? "all" : [],
  referenceEntries: signoff.referenceEntries === "all" ? "all" : [],
  withheld: signoff.withheld,
  catalogueSha256: signoff.catalogueSha256,
};
export const CLERKING_TOKEN_MAP: Readonly<Record<string, string>> = tokenMap.map;
/** The signed v1 → v2 conversion table (the only thing "Continue in the new format" reads). */
export const CLERKING_LEGACY = parseLegacyTable(legacy);
