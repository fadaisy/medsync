/* eslint-disable no-console -- owner CLI */
/**
 * The Summary and Impression baseline (PROMPT-CLERKING-SUMMARY-IMPRESSION §14, STOP 0), run in a
 * READ ONLY transaction: counts only; no row content is read or decrypted.
 *
 *   npm run emr:si-counts
 *
 * - duplicate_term_on_visit: the same coded diagnosis current twice on one visit (S-3 before the
 *   guard; typed duplicates are ciphertext and are not counted here);
 * - visits_over_one_diagnosis_signed: visits with a signed v2 clerking note and more than one
 *   current diagnosis (the notes whose Impression the record could change before D-SI-20);
 * - v2_drafts_open: v2 clerking drafts not yet signed (they open with the old s12 words, if any,
 *   in "In my words");
 * - confirm_diagnosis_open: diagnosis co-signature requests waiting (0 until 0084 is applied).
 */
import type { EmrDb } from "@/lib/emr/db";
import { sql } from "drizzle-orm";

import { rowsOf, runCli } from "./_cli";

export const SI_COUNT_QUERIES: Readonly<Record<string, string>> = {
  duplicate_term_on_visit: `
    WITH cur AS (
      SELECT c.term_id, coalesce(e.visit_id, e.id) AS visit
        FROM public.conditions c
        JOIN public.encounters e ON e.id = c.encounter_id
       WHERE c.category = 'encounter_diagnosis' AND c.status <> 'entered_in_error'
         AND c.term_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.conditions s WHERE s.supersedes_id = c.id))
    SELECT count(*) AS count FROM (
      SELECT visit, term_id FROM cur GROUP BY visit, term_id HAVING count(*) > 1) d`,
  visits_over_one_diagnosis_signed: `
    WITH cur AS (
      SELECT coalesce(e.visit_id, e.id) AS visit
        FROM public.conditions c
        JOIN public.encounters e ON e.id = c.encounter_id
       WHERE c.category = 'encounter_diagnosis' AND c.status <> 'entered_in_error'
         AND NOT EXISTS (SELECT 1 FROM public.conditions s WHERE s.supersedes_id = c.id)),
    many AS (SELECT visit FROM cur GROUP BY visit HAVING count(*) > 1)
    SELECT count(DISTINCT m.visit) AS count
      FROM many m
      JOIN public.encounters e ON coalesce(e.visit_id, e.id) = m.visit
      JOIN public.clinical_notes n ON n.encounter_id = e.id
     WHERE n.template_id = 'tpl.clerking.adult_v2' AND n.state = 'signed'`,
  v2_drafts_open: `
    SELECT count(*) AS count FROM public.clinical_notes
     WHERE template_id = 'tpl.clerking.adult_v2' AND state = 'draft'`,
  confirm_diagnosis_open: `
    SELECT count(*) AS count FROM public.clinical_cosign_requests
     WHERE action_kind = 'confirm_diagnosis' AND state = 'pending_review'`,
};

export async function siCounts(db: EmrDb): Promise<{ tbl: string; count: number }[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`);
    const out: { tbl: string; count: number }[] = [];
    for (const [tbl, q] of Object.entries(SI_COUNT_QUERIES)) {
      const [r] = rowsOf<{ count: string | number }>(await tx.execute(sql.raw(q)));
      out.push({ tbl, count: Number(r?.count ?? 0) });
    }
    return out;
  });
}

if (process.argv[1]?.endsWith("si-counts.ts"))
  void runCli(
    `
Count the Summary and Impression baseline (§14). Read only; counts only. Keep the output with the
release notes.`,
    async ({ db }) => {
      console.table(await siCounts(db));
    },
    { writes: false },
  );
