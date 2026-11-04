/* eslint-disable no-console */
/**
 * Dev seed for the reworked pharmacy (TECH-SPEC §8 "Seeds"): the prototype's sample rows for Controls, Patients and
 * Records at one test hospital. Never imported by the app; each area file is idempotent.
 *
 *   PHARMACY_SEED_OK=1 DATABASE_URL=… npx tsx scripts/seed-pharmacy-dev.ts <hospital-id>
 *
 * PHARMACY_SEED_OK must be set on purpose: these are sample patients and losses, never for a live hospital.
 */
import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { seedControls } from "./seed-pharmacy-dev/controls";
import { seedPatients } from "./seed-pharmacy-dev/patients";
import { seedRecords } from "./seed-pharmacy-dev/records";
import { seedRoster } from "./seed-pharmacy-dev/roster";
import { seedSetup } from "./seed-pharmacy-dev/setup";
import { seedStore } from "./seed-pharmacy-dev/store";

for (const f of [".env", ".env.local"]) if (existsSync(f)) process.loadEnvFile(f);

const url = process.env.DATABASE_URL;
const hospitalId = process.argv[2];
if (!url || !hospitalId || process.env.PHARMACY_SEED_OK !== "1") {
  console.error(
    "Usage: PHARMACY_SEED_OK=1 DATABASE_URL=… npx tsx scripts/seed-pharmacy-dev.ts <hospital-id>",
  );
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client);
try {
  for (const [name, seed] of [
    ["controls", seedControls],
    ["patients", seedPatients],
    ["records", seedRecords],
    ["roster", seedRoster],
    ["setup", seedSetup],
    ["store", seedStore],
  ] as const) {
    await seed(db, hospitalId);
    console.log(`seeded ${name}`);
  }
} finally {
  await client.end();
}
