/** Helpers to write catalogue-shaped patients on the PGlite lane as the demo loader. */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pg } from "../emr-db/_pglite";
import type { NcdFacility } from "./_ncd";
import type { NcdDb } from "@/lib/ncdreg/db";
import type { ScenarioPatient } from "@/lib/ncdreg/demo/catalogue";

import { parseCatalogue } from "@/lib/ncdreg/demo/catalogue";
import { writeScenarioPatient } from "@/lib/ncdreg/demo/writer";
import { moduleByCode } from "@/lib/ncdreg/standard/conditions";
import { ctxFor, enableModule } from "./_engine";

export const CATALOGUE = parseCatalogue(
  JSON.parse(
    readFileSync(resolve(__dirname, "../../docs/ncd/demo/ncd-demo-catalog.v1.json"), "utf8"),
  ),
);
export const ACTORS = Object.fromEntries(CATALOGUE.demo_actors.map((a) => [a.role, a.label]));

/** A demo load row and a demo_loader context for the facility's registry lead. */
export async function demoLoader(pg: Pg, db: NcdDb, f: NcdFacility, day0: string) {
  const id = randomUUID();
  await pg.query(
    `INSERT INTO public.ncd_demo_load (id, facility_id, mode, catalogue_version, seed, day0, status, started_by) VALUES ($1, $2, 'full_clinic', $3, 1, $4, 'loading', $5)`,
    [id, f.facilityId, CATALOGUE.version, day0, f.users.registry_lead],
  );
  for (const code of CATALOGUE.condition_modules_enabled_while_on)
    await enableModule((s, p) => pg.query(s, p), f.facilityId, moduleByCode.get(code)!);
  const ctx = await ctxFor(db, f, "registry_lead", {
    principal: "demo_loader",
    demoLoadId: id,
    at: `${day0}T09:00:00+03:00`,
  });
  return { id, ctx: { ...ctx, actorLabel: (r: string) => ACTORS[r] ?? null } };
}

export async function writeAll(
  ctx: Awaited<ReturnType<typeof demoLoader>>["ctx"],
  ps: readonly ScenarioPatient[],
  day0: string,
  demoLoadId: string,
) {
  let commands = 0;
  let t = performance.now();
  for (const [i, p] of ps.entries()) {
    commands += (await writeScenarioPatient(ctx, p, { day0, demoLoadId })).commands;
    if ((i + 1) % 100 === 0) {
      process.stdout.write(
        `written ${i + 1}: ${Math.round(performance.now() - t)} ms for the last 100\n`,
      );
      t = performance.now();
    }
  }
  return commands;
}
