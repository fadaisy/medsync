import { createHash } from "node:crypto";
import type { DxSignoff } from "./catalogue";

import raw from "@/data/clerking/clerking-diagnosis-catalogue.v1.json";
import signoff from "@/data/clerking/dx-signoff.v1.json";
import { parseDxCatalogue } from "./catalogue";

/** The diagnosis catalogue, parsed and indexed once per process, and its signature. */
export const DX_CATALOGUE = parseDxCatalogue(raw);

const list = (v: unknown): "all" | string[] => (v === "all" ? "all" : (v as string[]));
export const DX_SIGNOFF: DxSignoff & { catalogueSha256: string } = {
  profiles: list(signoff.profiles),
  rules: list(signoff.rules),
  referenceEntries: list(signoff.referenceEntries),
  namedScales: list(signoff.namedScales),
  withheld: signoff.withheld,
  catalogueSha256: signoff.catalogueSha256,
};

// The seed's namespace (scripts/emr/gen-seed.ts): diagnosis_terms rows are keyed by uuidV5 of
// "diagnosis_terms:" + the REF-DX-TERMS id, and have no text key (D-SI-22).
const UUID_NAMESPACE = "b08c11db-6eac-493f-8712-c8642d0d45ae";

export function uuidV5(name: string): string {
  const h = createHash("sha1")
    .update(Buffer.from(UUID_NAMESPACE.replace(/-/g, ""), "hex"))
    .update(name)
    .digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export const dxTermUuid = (dxId: string) => uuidV5(`diagnosis_terms:${dxId}`);

/** Term uuid → profile id, for every profile (the desk maps a condition's term to its profile). */
export const DX_TERM_IDS: Readonly<Record<string, string>> = Object.fromEntries(
  DX_CATALOGUE.profiles.map((p) => [dxTermUuid(p.id), p.id]),
);

/** What `/api/clerking/dx-catalogue` serves: the catalogue as signed and the term map. */
export const DX_SERVED = { catalogue: raw, termIds: DX_TERM_IDS };
