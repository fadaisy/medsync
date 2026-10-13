import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HmisForm } from "./hmis105";

import { sha256 } from "./research-import";

/**
 * The HMIS 105 form version (HM-1, GATE A P10): a committed data file, pinned by its SHA-256 on every mapping
 * and report, as the CFC addendum is. Read once per server process. The path is a constant, so file tracing
 * cannot follow it: `next.config.ts` names the file in `outputFileTracingIncludes` for the routes that read it.
 */
export const HMIS_FORM_FILE = "data/lab/hmis105-2019-09.json";

export type HmisFormFile = HmisForm & { source: string; note: string };

let cached: { form: HmisFormFile; hash: string } | null = null;

export function hmisForm(): { form: HmisFormFile; hash: string } {
  if (cached) return cached;
  const raw = readFileSync(join(process.cwd(), HMIS_FORM_FILE), "utf8");
  cached = { form: JSON.parse(raw) as HmisFormFile, hash: sha256(raw) };
  return cached;
}
