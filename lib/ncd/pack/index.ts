/**
 * The diabetes knowledge pack, loaded once from `data/ncd/diabetes-pack.json`.
 *
 * Read from disk rather than imported: the file is about 1 MB, and importing it would make
 * TypeScript infer a literal type for all of it (the type-checker runs out of memory) and
 * would put it in any bundle that touched this module. Server and test use only; a route
 * that runs it must list the file in `outputFileTracingIncludes`. Shadow only (I10).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DiabetesPack, PackInput, PackResult } from "@/lib/ncd/pack/types";

import { runProtocol } from "@/lib/ncd/pack/engine";

export const DIABETES_PACK_PATH = join(process.cwd(), "data", "ncd", "diabetes-pack.json");

let cached: DiabetesPack | undefined;
export function diabetesPack(): DiabetesPack {
  return (cached ??= JSON.parse(readFileSync(DIABETES_PACK_PATH, "utf8")) as DiabetesPack);
}

export function runDiabetesPack(input: PackInput): PackResult {
  return runProtocol(diabetesPack(), input);
}
