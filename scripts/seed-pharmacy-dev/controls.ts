/**
 * Dev seed for Controls (rework PRD §6.5; TECH-SPEC §8 "Seeds"), ported from the prototype's cd.js, handover.js and
 * cases.js seeds: two controlled medicines on a ward with witnessed doses (one residue not recorded), a balance check
 * on the ward one short (its High case opens itself and is assigned), a 17:00 handover at the store with a controlled
 * line (accepting it writes the store's balance check), and a closed case reported by hand. Local and dev only; never
 * imported by the app. Runs once per hospital (it stops if its sample doses are there).
 *
 * ponytail: it needs two staff at the hospital, a ward place and a store place; the second person is put on today's
 * roster as the witness. Sample names are invented.
 */
import { sql } from "drizzle-orm";

type Db = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };
const rows = <T>(r: unknown): T[] =>
  (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];
const H = 3_600_000;

/** [medicine id, name, class, opening balance on the ward] */
const MEDS: [string, string, string, number][] = [
  ["proto_morph", "Morphine injection 10 mg/mL", "narcotic", 10],
  ["proto_diaz", "Diazepam injection 10 mg/2 mL", "psychotropic", 6],
];
/** [medicine, hours ago, patient, bed, dose mg, route, residue mg, residue disposed] */
const DOSES: [string, number, string, string, number, string, number, boolean][] = [
  ["proto_morph", 40, "Sample patient 61", "Bed 4", 10, "IM", 0, true],
  ["proto_morph", 30, "Sample patient 61", "Bed 4", 10, "IM", 0, true],
  ["proto_morph", 20, "Sample patient 63", "Bed 12", 2.5, "IV", 7.5, false],
  ["proto_diaz", 26, "Sample patient 81", "Cot 2", 5, "Rectal", 5, true],
];

export async function seedControls(db: Db, hospitalId: string) {
  const one = async <T>(q: ReturnType<typeof sql>) => rows<T>(await db.execute(q))[0];
  const staff = rows<{ user_id: string }>(
    await db.execute(sql`SELECT user_id FROM public.staff_affiliations WHERE hospital_id = ${hospitalId}::uuid
      AND state IN ('approved','active') GROUP BY user_id ORDER BY min(created_at) LIMIT 2`),
  );
  if (staff.length < 2) return { skipped: "needs two staff at this hospital" };
  const [a, b] = [staff[0]!.user_id, staff[1]!.user_id];
  const ward = await one<{
    id: string;
  }>(sql`SELECT id FROM public.pharmacy_locations WHERE hospital_id = ${hospitalId}::uuid
      AND kind = 'ward' AND archived_at IS NULL ORDER BY name LIMIT 1`);
  const store = await one<{
    id: string;
  }>(sql`SELECT id FROM public.pharmacy_locations WHERE hospital_id = ${hospitalId}::uuid
      AND kind IN ('store','dispensing_point') AND archived_at IS NULL ORDER BY kind, name LIMIT 1`);
  if (!ward || !store) return { skipped: "needs a ward place and a store place" };
  const done = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM public.pharmacy_cd_doses
      WHERE hospital_id = ${hospitalId}::uuid AND patient_label LIKE 'Sample patient%'`);
  if (done?.n) return { skipped: "already seeded" };
  const now = Date.now();

  // The roster: the first person in charge, the second the witness on the ward and the store.
  for (const [user, place, role] of [
    [a, null, "in_charge"],
    [b, ward.id, "second_nurse"],
    [b, null, "technician"],
  ] as const)
    await db.execute(sql`INSERT INTO public.pharmacy_duty_roster (hospital_id, user_id, location_id, role, shift, date_from, date_to, created_by)
      VALUES (${hospitalId}::uuid, ${user}::uuid, ${place}::uuid, ${role}, 'call', current_date - 2, current_date + 7, ${a}::uuid)`);
  await db.execute(sql`INSERT INTO public.pharmacy_cd_prescribers (hospital_id, user_id, department, created_by)
    VALUES (${hospitalId}::uuid, ${a}::uuid, 'Medical', ${a}::uuid)`);
  const witness = async (action: string) =>
    (await one<{
      id: string;
    }>(sql`INSERT INTO public.pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome)
      VALUES (${hospitalId}::uuid, ${a}::uuid, ${b}::uuid, 'witness', ${action}, 'passed') RETURNING id`))!
      .id;

  const batch: Record<string, Record<string, string>> = {};
  for (const [med, name, cls, qty] of MEDS) {
    await db.execute(sql`INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, controlled_class, created_by)
      SELECT ${hospitalId}::uuid, ${med}, ${name}, 'ampoule', ${cls}, ${a}::uuid
       WHERE NOT EXISTS (SELECT 1 FROM public.pharmacy_products WHERE hospital_id = ${hospitalId}::uuid AND medicine_id = ${med})`);
    const p = (await one<{ id: string }>(
      sql`SELECT id FROM public.pharmacy_products WHERE hospital_id = ${hospitalId}::uuid AND medicine_id = ${med} LIMIT 1`,
    ))!;
    batch[med] = {};
    for (const [place, n] of [
      [ward.id, qty],
      [store.id, 20],
    ] as const) {
      const no = `${med.slice(6).toUpperCase()}-${place === ward.id ? "W" : "S"}1`;
      const bt = (await one<{
        id: string;
      }>(sql`INSERT INTO public.pharmacy_batches (hospital_id, location_id, product_id, batch_number, expiry,
          first_batch_number, first_expiry, created_by)
        VALUES (${hospitalId}::uuid, ${place}::uuid, ${p.id}::uuid, ${no}, current_date + 400, ${no}, current_date + 400, ${a}::uuid) RETURNING id`))!;
      batch[med][place] = bt.id;
      await db.execute(sql`INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at,
          actor_user_id, source_kind, reason_note, idempotency_key)
        VALUES (${hospitalId}::uuid, ${place}::uuid, ${bt.id}::uuid, 'received', ${n}, ${new Date(now - 7 * 24 * H)}, ${a}::uuid,
          'delivery', 'Balance brought forward (sample)', ${`seed-controls:${no}:in`})`);
    }
  }

  // Witnessed doses on the ward (the last one leaves 7.5 mg residue not recorded).
  for (const [med, ago, patient, bed, mg, route, residue, disposed] of DOSES) {
    const dose = (await one<{
      id: string;
    }>(sql`INSERT INTO public.pharmacy_cd_doses (hospital_id, location_id, medicine_id, patient_label, bed,
        prescriber_user_id, dose_mg, route, units, residue_mg, residue_disposed, created_by)
      VALUES (${hospitalId}::uuid, ${ward.id}::uuid, ${med}, ${patient}, ${bed}, ${a}::uuid, ${mg}, ${route}, 1, ${residue}, ${disposed}, ${a}::uuid)
      RETURNING id`))!;
    await db.execute(sql`INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at,
        actor_user_id, witness_attestation_id, source_kind, source_id, reason_code, reason_note, idempotency_key)
      VALUES (${hospitalId}::uuid, ${ward.id}::uuid, ${batch[med]![ward.id]}::uuid, 'ward_used', -1, ${new Date(now - ago * H)}, ${a}::uuid,
        ${await witness("controlled:cd_dose")}::uuid, 'adjustment', ${dose.id}::uuid, 'cd_dose', ${patient}, ${`seed-controls:dose:${dose.id}`})`);
  }

  // A balance check on the ward: diazepam one short, which opens a High case due in 24 h; the in-charge assigns it.
  const check = (await one<{
    id: string;
  }>(sql`INSERT INTO public.pharmacy_cd_checks (hospital_id, location_id, checked_by, witness_attestation_id)
    VALUES (${hospitalId}::uuid, ${ward.id}::uuid, ${a}::uuid, ${await witness("controlled:cd_check")}::uuid) RETURNING id`))!;
  await db.execute(sql`INSERT INTO public.pharmacy_cd_check_lines (check_id, hospital_id, medicine_id, expected, counted) VALUES
    (${check.id}::uuid, ${hospitalId}::uuid, 'proto_morph', 7, 7), (${check.id}::uuid, ${hospitalId}::uuid, 'proto_diaz', 5, 4)`);
  await db.execute(sql`UPDATE public.pharmacy_cases SET owner_user_id = ${b}::uuid, assigned_by = ${a}::uuid, assigned_at = now(), changed_by = ${a}::uuid
    WHERE source_type = 'cd_check' AND source_id = ${check.id}::uuid`);
  await db.execute(sql`INSERT INTO public.pharmacy_case_events (hospital_id, case_id, kind, what, actor_user_id)
    SELECT hospital_id, id, 'assigned', ${b}, ${a}::uuid FROM public.pharmacy_cases WHERE source_type = 'cd_check' AND source_id = ${check.id}::uuid`);

  // Yesterday's 17:00 handover at the store, morphine counted; accepting it writes the store's balance check.
  const slot = new Date(Math.floor((now + 3 * H) / (24 * H)) * 24 * H - 3 * H - 7 * H);
  const ho = (await one<{
    id: string;
  }>(sql`INSERT INTO public.pharmacy_shift_handovers (hospital_id, location_id, slot_at, from_user_id, to_user_id,
      keys_handed, notes, created_at)
    VALUES (${hospitalId}::uuid, ${store.id}::uuid, ${slot}, ${a}::uuid, ${b}::uuid, true, 'Two patients owed metronidazole', ${new Date(slot.getTime() + 10 * 60_000)})
    RETURNING id`))!;
  await db.execute(sql`INSERT INTO public.pharmacy_shift_handover_lines (handover_id, hospital_id, medicine_id, high_risk, expected, counted)
    VALUES (${ho.id}::uuid, ${hospitalId}::uuid, 'proto_morph', false, 20, 20)`);
  await db.execute(sql`INSERT INTO public.pharmacy_shift_handover_items (handover_id, hospital_id, n, text, seen_at)
    VALUES (${ho.id}::uuid, ${hospitalId}::uuid, 0, '2 patients owed metronidazole', ${new Date(slot.getTime() + 10 * 60_000)})`);
  await db.execute(
    sql`UPDATE public.pharmacy_shift_handovers SET accepted_at = ${new Date(slot.getTime() + 15 * 60_000)} WHERE id = ${ho.id}::uuid`,
  );

  // A case reported by hand, investigated, signed off.
  const c = (await one<{
    id: string;
  }>(sql`INSERT INTO public.pharmacy_cases (hospital_id, source_type, medicine_id, location_id, qty, what, severity,
      due_at, owner_user_id, assigned_by, assigned_at, findings, submitted_by, submitted_at, signed_off_by, signed_off_at, created_by, created_at)
    VALUES (${hospitalId}::uuid, 'manual', 'proto_morph', ${store.id}::uuid, 0, 'Ampoule seal looked tampered with', 'high',
      now() - interval '5 days', ${b}::uuid, ${a}::uuid, now() - interval '6 days',
      ${JSON.stringify({ cause: "Broken or wasted, not recorded", actions: ["Batch quarantined"], prevent: ["Second-person check at every dose"] })}::jsonb,
      ${b}::uuid, now() - interval '5 days 2 hours', ${a}::uuid, now() - interval '5 days', ${a}::uuid, now() - interval '6 days')
    RETURNING id`))!;
  for (const [kind, what, ago] of [
    ["opened", "Ampoule seal looked tampered with", 144],
    ["assigned", b, 143],
    ["step", "Quarantined the batch", 140],
    ["submitted", "Broken or wasted, not recorded", 122],
    ["signed_off", null, 120],
  ] as const)
    await db.execute(sql`INSERT INTO public.pharmacy_case_events (hospital_id, case_id, kind, what, actor_user_id, created_at)
      VALUES (${hospitalId}::uuid, ${c.id}::uuid, ${kind}, ${what}, ${kind === "submitted" || kind === "step" ? b : a}::uuid, ${new Date(now - ago * H)})`);

  return {
    ward: ward.id,
    store: store.id,
    doses: DOSES.length,
    check: check.id,
    handover: ho.id,
    cases: 2,
  };
}
