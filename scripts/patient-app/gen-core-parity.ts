// Regenerates packages/patient-core/fixtures/core-parity.json's `expected` from its `cases` (S8).
import { readFileSync, writeFileSync } from "node:fs";

import { runCoreFixture } from "../../packages/patient-core/core-parity";

const path = "packages/patient-core/fixtures/core-parity.json";
const fx = JSON.parse(readFileSync(path, "utf8"));
fx.expected = runCoreFixture(fx.cases);
writeFileSync(path, JSON.stringify(fx, null, 2) + "\n");
process.stdout.write(`${fx.cases.length} cases\n`);
