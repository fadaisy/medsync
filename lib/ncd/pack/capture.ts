/**
 * Server side of the pack's go-live (NCD_DM_PACK_LIVE): the form catalog the clinician fills, and the lean pack the
 * browser evaluates. Read from disk, never imported (the pack is ~1 MB; see index.ts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NcdCatalog } from "@/lib/ncd/catalog/schema";
import type { DiabetesPack } from "@/lib/ncd/pack/types";

import { ncdPackLive } from "@/lib/encounter/feature";
import { DIABETES_CATALOG } from "@/lib/ncd/catalog/diabetes";
import { diabetesPack } from "@/lib/ncd/pack";

export const PACK_CAPTURE_PATH = join(process.cwd(), "data", "ncd", "diabetes-pack-capture.json");

/** Fields the platform supplies from the encounter, never asked on the form (P0-01, P0-02). */
export const PLATFORM_FIELDS = new Set(["age_years", "pregnancy_possible", "care_setting"]);

let catalog: NcdCatalog | undefined;
/** The live v0.1.0 form plus the pack's own sections and questions. Same id, so a draft carries across. */
export function packCaptureCatalog(): NcdCatalog {
  if (catalog) return catalog;
  const add = JSON.parse(readFileSync(PACK_CAPTURE_PATH, "utf8")) as {
    capabilities: NcdCatalog["capabilities"];
    sections: NcdCatalog["sections"];
    features: NcdCatalog["features"];
  };
  const pack = diabetesPack();
  catalog = {
    ...DIABETES_CATALOG,
    version: `${DIABETES_CATALOG.version}+pack-${pack.pack.version}`,
    capabilities: [...DIABETES_CATALOG.capabilities, ...add.capabilities],
    sections: [...DIABETES_CATALOG.sections, ...add.sections],
    features: [
      ...DIABETES_CATALOG.features,
      ...add.features.filter((f) => !PLATFORM_FIELDS.has(f.code)),
    ],
  };
  return catalog;
}

/** The pack fields the form adds (the translator passes them straight through). */
export function packFieldCodes(): string[] {
  const live = new Set(DIABETES_CATALOG.features.map((f) => f.code));
  return packCaptureCatalog()
    .features.filter((f) => !live.has(f.code))
    .map((f) => f.code);
}

/** The form for this deployment: the pack's when it is live, the v0.1.0 form otherwise. */
export function ncdCatalog(): NcdCatalog {
  return ncdPackLive() ? packCaptureCatalog() : DIABETES_CATALOG;
}

const DROP = new Set([
  "citation",
  "citations",
  "quote",
  "review",
  "signed",
  "sources",
  "note",
  "notes",
  "researchNote",
  "why",
  "refs_dm",
  "verification",
]);
let lean: DiabetesPack | undefined;
/** The pack without its citations and notes: what the engine reads, small enough to send to the browser. */
export function leanDiabetesPack(): DiabetesPack {
  if (lean) return lean;
  const strip = (n: unknown): unknown =>
    Array.isArray(n)
      ? n.map(strip)
      : n && typeof n === "object"
        ? Object.fromEntries(
            Object.entries(n)
              .filter(([k]) => !DROP.has(k))
              .map(([k, v]) => [k, strip(v)]),
          )
        : n;
  const { refs: _refs, ...rest } = diabetesPack();
  lean = { ...(strip(rest) as Omit<DiabetesPack, "refs">), refs: {} };
  return lean;
}
