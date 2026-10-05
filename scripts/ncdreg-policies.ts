/**
 * Writes the generated blocks of migration 0093 from lib/ncdreg (§8.1): the row-level policies from
 * table-access.ts and the capability seed from capabilities.ts. Run: npm run ncdreg:policies.
 * tests/ncdreg/policies.test.ts fails if the migration's blocks differ from what this renders.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  generatedMigrationBlocks,
  MIGRATION_0093,
  replaceBlock,
} from "../lib/ncdreg/migration-blocks";

const path = resolve(__dirname, "..", MIGRATION_0093);
let sql = readFileSync(path, "utf8");
for (const [name, body] of Object.entries(generatedMigrationBlocks()))
  sql = replaceBlock(sql, name, body);
writeFileSync(path, sql);
process.stdout.write(`wrote ${MIGRATION_0093}\n`);
