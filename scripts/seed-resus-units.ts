/* eslint-disable no-console */
/**
 * Register a hospital's care units, resus-bay defibrillator profiles and resus
 * settings (Resus Desk v2, migration 0068). These are FACTS ABOUT A REAL
 * HOSPITAL — what each unit can deliver, which defibrillator sits in which bay
 * and its manufacturer energy sequence (entered by biomedical engineering,
 * CSO-approved) — so nothing is seeded by the migration. The hospital supplies a
 * JSON file; this script upserts it (superadmin/owner action).
 *
 *   npx tsx scripts/seed-resus-units.ts path/to/hospital-resus.json
 *
 * Shape (see docs/resus-v2/hospital-resus.example.json — an EXAMPLE of the
 * format, not data about any hospital):
 *   { "hospitalId": "<uuid>",
 *     "settings": { "antiarrhythmic": "amiodarone" | "lidocaine" },
 *     "units": [{ "name", "unitType", "ageGroup", "capabilities": ["continuous_ecg", …], "active" }],
 *     "bays":  [{ "bayLabel", "deviceModel", "waveform", "energySequenceJ": [150, 200, 200] | null,
 *                 "capnography", "ultrasound", "mechanicalCpr", "verifiedBy": "<uuid>" }] }
 *
 * A bay without a verified energy sequence stays null: the console then shows
 * "highest available setting" only (ALS-NRG-02).
 */
import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";
import { z } from "zod";

for (const f of [".env", ".env.local"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}

const url = process.env.DATABASE_URL;
const file = process.argv[2];
if (!url || !file) {
  console.error("Usage: DATABASE_URL=… npx tsx scripts/seed-resus-units.ts <hospital-resus.json>");
  process.exit(1);
}

const CAPS = [
  "continuous_ecg",
  "arterial_line",
  "vasopressors",
  "niv_cpap",
  "invasive_ventilation",
  "rrt",
] as const;

const Input = z.object({
  hospitalId: z.string().uuid(),
  settings: z.object({ antiarrhythmic: z.enum(["amiodarone", "lidocaine"]) }).optional(),
  units: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        unitType: z.enum([
          "ward",
          "hdu",
          "icu",
          "theatre",
          "cath_lab",
          "labour_ward",
          "paeds_ward",
          "picu",
          "nicu",
          "ed_obs",
        ]),
        ageGroup: z.enum(["adult", "paediatric", "all"]).default("adult"),
        capabilities: z.array(z.enum(CAPS)).default([]),
        active: z.boolean().default(true),
      }),
    )
    .default([]),
  bays: z
    .array(
      z.object({
        bayLabel: z.string().min(1).max(60),
        deviceModel: z.string().max(120).nullable().default(null),
        waveform: z
          .enum([
            "monophasic",
            "biphasic_truncated_exponential",
            "rectilinear_biphasic",
            "pulsed_biphasic",
            "unknown",
          ])
          .default("unknown"),
        energySequenceJ: z
          .array(z.number().int().min(1).max(400))
          .min(1)
          .max(10)
          .nullable()
          .default(null),
        capnography: z.boolean().default(false),
        ultrasound: z.boolean().default(false),
        mechanicalCpr: z.boolean().default(false),
        verifiedBy: z.string().uuid().nullable().default(null),
      }),
    )
    .default([]),
});

const input = Input.parse(JSON.parse(readFileSync(file, "utf8")));
const sql = postgres(url, { prepare: false, max: 1 });

try {
  await sql.begin(async (tx) => {
    for (const u of input.units) {
      const has = (c: (typeof CAPS)[number]) => u.capabilities.includes(c);
      await tx`
        INSERT INTO public.hospital_care_units
          (hospital_id, name, unit_type, age_group, continuous_ecg, arterial_line, vasopressors,
           niv_cpap, invasive_ventilation, rrt, active)
        VALUES (${input.hospitalId}, ${u.name}, ${u.unitType}, ${u.ageGroup}, ${has("continuous_ecg")},
                ${has("arterial_line")}, ${has("vasopressors")}, ${has("niv_cpap")},
                ${has("invasive_ventilation")}, ${has("rrt")}, ${u.active})
        ON CONFLICT (hospital_id, name) DO UPDATE SET
          unit_type = EXCLUDED.unit_type, age_group = EXCLUDED.age_group,
          continuous_ecg = EXCLUDED.continuous_ecg, arterial_line = EXCLUDED.arterial_line,
          vasopressors = EXCLUDED.vasopressors, niv_cpap = EXCLUDED.niv_cpap,
          invasive_ventilation = EXCLUDED.invasive_ventilation, rrt = EXCLUDED.rrt,
          active = EXCLUDED.active`;
    }
    for (const b of input.bays) {
      await tx`
        INSERT INTO public.resus_bay_profiles
          (hospital_id, bay_label, device_model, waveform, energy_sequence_j, capnography, ultrasound,
           mechanical_cpr, verified_by, verified_at)
        VALUES (${input.hospitalId}, ${b.bayLabel}, ${b.deviceModel}, ${b.waveform}, ${b.energySequenceJ},
                ${b.capnography}, ${b.ultrasound}, ${b.mechanicalCpr}, ${b.verifiedBy},
                ${b.verifiedBy ? new Date() : null})
        ON CONFLICT (hospital_id, bay_label) DO UPDATE SET
          device_model = EXCLUDED.device_model, waveform = EXCLUDED.waveform,
          energy_sequence_j = EXCLUDED.energy_sequence_j, capnography = EXCLUDED.capnography,
          ultrasound = EXCLUDED.ultrasound, mechanical_cpr = EXCLUDED.mechanical_cpr,
          verified_by = EXCLUDED.verified_by, verified_at = EXCLUDED.verified_at`;
    }
    if (input.settings) {
      await tx`
        INSERT INTO public.hospital_resus_settings (hospital_id, antiarrhythmic)
        VALUES (${input.hospitalId}, ${input.settings.antiarrhythmic})
        ON CONFLICT (hospital_id) DO UPDATE SET antiarrhythmic = EXCLUDED.antiarrhythmic, updated_at = now()`;
    }
  });
  console.log(
    `Registered ${input.units.length} unit(s), ${input.bays.length} bay profile(s)${input.settings ? " and settings" : ""} for ${input.hospitalId}.`,
  );
} finally {
  await sql.end({ timeout: 5 });
}
