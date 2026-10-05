/**
 * Writes the documents generated from the NCDReg standard module (§5, §13). Run: npm run ncdreg:docs.
 * tests/ncdreg/standard.test.ts re-renders each one and fails if the file on disk differs.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { generatedDocs } from "../lib/ncdreg/standard/generated-docs";
import { EXPECTED } from "../tests/ncdreg-db/golden/expected";

for (const [path, render] of Object.entries(generatedDocs(EXPECTED))) {
  writeFileSync(resolve(__dirname, "..", path), render());
  process.stdout.write(`wrote ${path}\n`);
}
