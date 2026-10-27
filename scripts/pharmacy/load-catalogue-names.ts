/* eslint-disable no-console -- owner CLI: it reports to the terminal */
/**
 * Propose the signed other names and abbreviations (GATE A §5, `data/pharmacy/catalogue/names.v1.json`) onto the
 * medicines and substances already in the shared catalogue (catalogue slice Step 3). One curator confirms each.
 * Run after the seed's medicines are confirmed, and again whenever more are: a re-run proposes only what is new.
 * A name that fits nothing yet is listed, not forced.
 *
 *   npm run pharmacy:catalogue-names            # dry run
 *   npm run pharmacy:catalogue-names -- --apply --actor <your auth user id>
 */
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { eq } from "drizzle-orm";

import {
  catMedicineIngredients,
  catMedicines,
  catSubstances,
} from "@/db/schema/pharmacy-catalogue";
import { planNames } from "@/lib/pharmacy/shared-catalogue/names";
import { proposeNames } from "@/lib/pharmacy/shared-catalogue/store";
import { asActor, DryRun, runCli } from "../emr/_cli";

export async function loadCatalogueNames(db: EmrDb, apply: boolean, actor?: string) {
  const substances = await db
    .select({
      id: catSubstances.id,
      key: catSubstances.key,
      emhsluClass: catSubstances.emhsluClass,
    })
    .from(catSubstances);
  const rows = await db
    .select({
      id: catMedicines.id,
      formCode: catMedicines.doseFormCode,
      strengthText: catMedicines.strengthText,
      key: catSubstances.key,
    })
    .from(catMedicines)
    .innerJoin(catMedicineIngredients, eq(catMedicineIngredients.medicineId, catMedicines.id))
    .innerJoin(catSubstances, eq(catSubstances.id, catMedicineIngredients.substanceId));
  const medicines = new Map<
    string,
    { id: string; formCode: string | null; strengthText: string | null; ingredientKeys: string[] }
  >();
  for (const r of rows) {
    const m = medicines.get(r.id) ?? {
      id: r.id,
      formCode: r.formCode,
      strengthText: r.strengthText,
      ingredientKeys: [],
    };
    m.ingredientKeys.push(r.key);
    medicines.set(r.id, m);
  }
  const plan = planNames(substances, [...medicines.values()]);
  let counts = { proposed: 0, already: 0 };
  try {
    await db.transaction(async (t) => {
      const tx = t as unknown as EmrTx;
      await asActor(tx, actor);
      counts = await proposeNames(tx, plan.planned);
      if (!apply) throw new DryRun();
    });
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
  }
  return { ...plan, ...counts };
}

if (process.argv[1]?.endsWith("load-catalogue-names.ts"))
  void runCli(
    "Propose the signed catalogue names. Dry run by default; --apply --actor <uuid> writes proposals.",
    async ({ db, apply, actor }) => {
      const r = await loadCatalogueNames(db, apply, actor);
      console.log(
        `${r.planned.length} names fit; ${r.proposed} proposals ${apply ? "written" : "would be written"}.`,
      );
      for (const u of r.unmatched) console.log(`  not yet: ${u.name} (${u.why})`);
    },
  );
