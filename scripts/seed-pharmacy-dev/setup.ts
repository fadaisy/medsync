/**
 * Dev seed for Set-up › Going live, Places, Rules and Messages (SETUP-TABS.md; PROMPT-SETUP step 2): every state the
 * four tabs show — blockers open and done, an overdue item, a missed handover and one with differences, an offline
 * device, a place with cold stock and no fridge, fridges in range, near the limit and out of range, a typed fridge
 * with a reading due, suppliers due in 6 days and at 90 % of budget, two proposals (one signed once), unsigned
 * groups, an outbox with every status and opt-outs. Local and dev only; never imported by the app. Runs once.
 *
 * ponytail: needs the roster seed first (the in-charge and listed staff) and a store; supplier phones are left empty
 * on purpose (never invented); the outbox numbers are the test range +256 700 000 0xx, encrypted like real ones.
 */
import { sql } from "drizzle-orm";

import { blindIndex, encrypt } from "@/lib/encryption";

type Db = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };
const rows = <T>(r: unknown): T[] =>
  (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];
const kampala = (offsetMin = 0) => new Date(Date.now() + offsetMin * 60_000);
const day = (n: number) =>
  new Date(Date.now() + 3 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);

export async function seedSetup(db: Db, hospitalId: string) {
  const h = sql`${hospitalId}::uuid`;
  const one = async <T>(q: ReturnType<typeof sql>) => rows<T>(await db.execute(q))[0];
  if (
    (
      await one<{ ok: boolean }>(
        sql`SELECT to_regclass('public.pharmacy_suppliers') IS NOT NULL AS ok`,
      )
    )?.ok !== true
  )
    return { skipped: "apply 0274 first" };
  if (
    (
      await one<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM public.pharmacy_suppliers WHERE hospital_id = ${h}`,
      )
    )?.n
  )
    return { skipped: "already seeded" };
  const people = rows<{ user_id: string }>(
    await db.execute(sql`SELECT user_id FROM public.pharmacy_roster_people WHERE hospital_id = ${h} AND ended_at IS NULL
      ORDER BY created_at`),
  ).map((p) => p.user_id);
  const boss = (
    await one<{
      u: string;
    }>(sql`SELECT p.user_id AS u FROM public.pharmacy_roster_people p WHERE p.hospital_id = ${h}
      AND p.ended_at IS NULL AND private.pharmacy_is_in_charge(p.user_id, ${h}) LIMIT 1`)
  )?.u;
  if (!boss || people.length < 3) return { skipped: "run the roster seed first" };
  const other = people.find((p) => p !== boss)!;
  const places = rows<{ id: string; kind: string; name: string }>(
    await db.execute(sql`SELECT id, kind, name FROM public.pharmacy_locations WHERE hospital_id = ${h}
      AND kind IN ('store','dispensing_point','ward','clinic','theatre') AND closed_at IS NULL ORDER BY kind, name`),
  );
  const store = places.find((p) => p.kind === "store");
  if (!store) return { skipped: "needs a store" };
  const rest = places.filter((p) => p.id !== store.id);

  // ─── Places: hours, supply, slots, devices (one online, one offline, one never seen) ───
  await db.execute(sql`UPDATE public.pharmacy_locations SET hours = 'weekdays', device_label = 'Store desk',
    handover_slots = '{08:00,17:00}' WHERE id = ${store.id}::uuid`);
  for (const [i, p] of rest.entries())
    await db.execute(sql`UPDATE public.pharmacy_locations SET hours = ${i % 2 ? "24h" : "day"},
      supplied_from = ${store.id}::uuid, device_label = ${p.kind === "ward" ? "Ward tablet" : "OPD station"},
      handover_slots = ${i === 0 ? "{08:00,17:00,20:00}" : "{08:00,17:00}"}::text[] WHERE id = ${p.id}::uuid`);
  await db.execute(sql`INSERT INTO public.pharmacy_devices (hospital_id, location_id, last_seen_at) VALUES
    (${h}, ${store.id}::uuid, ${kampala(-1).toISOString()}::timestamptz)
    ${rest[0] ? sql`, (${h}, ${rest[0].id}::uuid, ${kampala(-220).toISOString()}::timestamptz)` : sql``}
    ON CONFLICT (location_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`);
  // A handover with one difference at the store's 08:00 slot (the others stay missed or due).
  try {
    const slot = `${day(0)}T08:00:00+03:00`;
    const ho = await one<{
      id: string;
    }>(sql`INSERT INTO public.pharmacy_shift_handovers (hospital_id, location_id, slot_at,
        from_user_id, to_user_id, keys_handed, created_at, accepted_at)
      VALUES (${h}, ${store.id}::uuid, ${slot}::timestamptz, ${boss}::uuid, ${other}::uuid, true,
        ${slot}::timestamptz + interval '12 minutes', ${slot}::timestamptz + interval '14 minutes') RETURNING id`);
    if (ho)
      await db.execute(sql`INSERT INTO public.pharmacy_shift_handover_lines (handover_id, hospital_id, medicine_id, expected, counted)
        VALUES (${ho.id}::uuid, ${h}, 'morphine', 10, 9)`);
  } catch {
    // The station guard can refuse it on a hospital set up differently: the slot then shows as missed.
  }

  // ─── Cold chain: in range (sensor), near the limit (sensor), out of range (typed, with a note), a typed fridge due ───
  const fridge = async (code: string, name: string, place: string | null, sensor: string | null) =>
    (await one<{
      id: string;
    }>(sql`INSERT INTO public.pharmacy_fridges (hospital_id, location_id, code, name, sensor_id, created_by)
        VALUES (${h}, ${place}::uuid, ${code}, ${name}, ${sensor}, ${boss}::uuid)
        ON CONFLICT (hospital_id, code) DO UPDATE SET sensor_id = EXCLUDED.sensor_id RETURNING id`))!
      .id;
  const cr = await fridge("CR-01", "Main store cold room", store.id, "SN-44A1");
  const rf2 = rest[1] ? await fridge("RF-02", "Ice-lined fridge", rest[1].id, "SN-44B7") : null;
  const rf3 = await fridge("RF-03", "Solar fridge", rest[2]?.id ?? null, null);
  for (let m = 120; m >= 0; m -= 15) {
    await db.execute(sql`INSERT INTO public.pharmacy_fridge_readings (hospital_id, fridge_id, read_at, temp_c, source)
      VALUES (${h}, ${cr}::uuid, ${kampala(-m).toISOString()}::timestamptz, ${4.4 + (m % 30) / 50}, 'sensor') ON CONFLICT DO NOTHING`);
    if (rf2)
      await db.execute(sql`INSERT INTO public.pharmacy_fridge_readings (hospital_id, fridge_id, read_at, temp_c, source)
        VALUES (${h}, ${rf2}::uuid, ${kampala(-m).toISOString()}::timestamptz, 7.7, 'sensor') ON CONFLICT DO NOTHING`);
  }
  await db.execute(sql`INSERT INTO public.pharmacy_fridge_readings (hospital_id, fridge_id, read_at, temp_c, source, slot, recorded_by, note)
    VALUES (${h}, ${rf3}::uuid, ${`${day(0)}T08:05:00+03:00`}::timestamptz, 8.4, 'chart', 'am', ${boss}::uuid,
      'Door left open; closed it and moved the vaccines to CR-01')`);
  // Cold stock where there is no fridge: a cold-chain line levelled at a place without one.
  const coldAt = rest.find((p) => p.id !== rest[1]?.id && p.id !== rest[2]?.id);
  const coldLine = await one<{
    id: string;
  }>(sql`SELECT id FROM public.pharmacy_products WHERE hospital_id = ${h}
    AND active AND cold_chain IS TRUE LIMIT 1`);
  if (coldAt && coldLine)
    await db.execute(sql`INSERT INTO public.pharmacy_reorder_levels (hospital_id, location_id, product_id, medicine_id, level, set_by)
      SELECT ${h}, ${coldAt.id}::uuid, p.id, p.medicine_id, 10, ${boss}::uuid FROM public.pharmacy_products p
       WHERE p.id = ${coldLine.id}::uuid`);

  // ─── Suppliers: due in 6 days (next cycle in 13 = 13 − 7), one at 90 % of budget; no phone numbers ───
  for (const s of [
    [
      "NMS",
      "National Medical Stores · main supply, on the cycle",
      2,
      day(13),
      21,
      48_000_000,
      31_200_000,
      "this cycle",
      "Account manager",
    ],
    [
      "JMS",
      "Joint Medical Store · top-ups between NMS cycles",
      0,
      null,
      7,
      12_000_000,
      10_800_000,
      "this quarter",
      "Sales desk",
    ],
    [
      "UNEPI",
      "Vaccines and diluents for the EPI clinic, through the district",
      1,
      day(27),
      5,
      0,
      0,
      null,
      "District cold chain officer",
    ],
  ] as const)
    await db.execute(sql`INSERT INTO public.pharmacy_suppliers (hospital_id, name, what, cycle_months, next_cycle_on, lead_days,
        budget_ugx, used_ugx, budget_period, contact, updated_by)
      VALUES (${h}, ${s[0]}, ${s[1]}, ${s[2]}, ${s[3]}::date, ${s[4]}, ${s[5]}, ${s[6]}, ${s[7]}, ${s[8]}, ${boss}::uuid)`);

  // ─── Going live: three blockers done, one overdue mark, a target date ───
  await db.execute(sql`INSERT INTO public.pharmacy_golive_items (hospital_id, key, status, answer, answer_choice, decided_by, done_by, done_at)
    VALUES (${h}, 'dev', 'done', NULL, NULL, NULL, ${boss}::uuid, now() - interval '6 days'),
           (${h}, 'demo', 'done', NULL, NULL, NULL, ${boss}::uuid, now() - interval '6 days'),
           (${h}, 'q24', 'done', 'Electronic and paper side by side', 'Electronic and paper side by side', 'Medical superintendent',
              ${boss}::uuid, now() - interval '2 days')
    ON CONFLICT DO NOTHING`);
  await db.execute(sql`INSERT INTO public.pharmacy_golive_items (hospital_id, key, owner_role, due_on)
    VALUES (${h}, 'supp', 'In-charge', ${day(-1)}::date), (${h}, 'q1', 'In-charge', ${day(3)}::date) ON CONFLICT DO NOTHING`);
  await db.execute(sql`INSERT INTO public.pharmacy_golive_events (hospital_id, kind, detail, by_user)
    VALUES (${h}, 'target', ${day(13)}, ${boss}::uuid)`);

  // ─── Rules: two proposals (one with the in-charge's signature); two groups signed, the rest not ───
  const prop = async (key: string, oldT: string, newT: string, n: number, why: string) =>
    (
      await one<{
        id: string;
      }>(sql`INSERT INTO public.pharmacy_rule_proposals (hospital_id, rule_group, key, old_text, new_text,
          reason, proposed_by, params)
        VALUES (${h}, ${key.split(".")[0]}, ${key.split(".")[1]}, ${oldT}, ${newT}, ${why}, ${other}::uuid,
          ${JSON.stringify({ n })}::jsonb) ON CONFLICT DO NOTHING RETURNING id`)
    )?.id;
  const p1 = await prop(
    "cold.expiry_warning",
    "Warn 90 days before expiry",
    "Warn 120 days before expiry",
    120,
    "Slow movers need more time to redistribute.",
  );
  await prop(
    "ho.missed",
    "A handover not started 30 minutes after its time is missed",
    "A handover not started 45 minutes after its time is missed",
    45,
    "Ward rounds run late on Mondays.",
  );
  if (p1)
    await db.execute(sql`INSERT INTO public.pharmacy_rule_signatures (proposal_id, role, signed_by)
      VALUES (${p1}::uuid, 'in_charge', ${boss}::uuid)`);
  for (const g of ["cd", "roster"])
    for (const [role, by] of [
      ["in_charge", boss],
      ["second", other],
    ] as const)
      await db.execute(sql`INSERT INTO public.pharmacy_rule_group_signatures (hospital_id, group_key, role, signed_by)
        VALUES (${h}, ${g}, ${role}, ${by}::uuid) ON CONFLICT DO NOTHING`);

  // ─── Messages: provider not connected (the owner supplies it), a budget, an outbox with every status, opt-outs ───
  await db.execute(sql`INSERT INTO public.pharmacy_sms_settings (hospital_id, monthly_budget_ugx, updated_by)
    VALUES (${h}, 60000, ${boss}::uuid) ON CONFLICT DO NOTHING`);
  const at = (hour: number) => `${day(0)}T${String(hour).padStart(2, "0")}:00:00+03:00`;
  const out = [
    ["refill_due", "sent", 9, null],
    ["refill_due", "delivered", 10, null],
    ["course", "failed", 11, "Phone switched off"],
    ["epi_tomorrow", "queued", 7, "Quiet hours: goes at 07:00"],
    ["staff_change", "delivered", 13, null],
  ] as const;
  for (const [i, [rule, status, hour, note]] of out.entries()) {
    const phone = `+25670000001${i}`;
    await db.execute(sql`INSERT INTO public.pharmacy_sms_messages (hospital_id, day, rule, ref_key, recipient, phone_encrypted,
        phone_hmac, lang, body, status, sent_at, delivered_at, failure, note, parts, cost_ugx)
      VALUES (${h}, ${day(0)}::date, ${rule}, ${`seed:${rule}:${i}`}, 'Seed', ${encrypt(phone)}, ${blindIndex(phone)}, 'en',
        'Seed message. Reply STOP to stop.', 'scheduled', NULL, NULL, NULL, ${note}, 1, 35)
      ON CONFLICT DO NOTHING`);
    if (status !== "queued")
      await db
        .execute(
          sql`UPDATE public.pharmacy_sms_messages SET status = 'sent', sent_at = ${at(hour)}::timestamptz
        WHERE hospital_id = ${h} AND ref_key = ${`seed:${rule}:${i}`}`,
        )
        .catch(() => undefined);
    if (status === "queued" || status === "delivered" || status === "failed")
      await db
        .execute(
          sql`UPDATE public.pharmacy_sms_messages SET status = ${status},
          delivered_at = ${status === "delivered" ? sql`now()` : sql`NULL`}, failure = ${status === "failed" ? note : null}
        WHERE hospital_id = ${h} AND ref_key = ${`seed:${rule}:${i}`}`,
        )
        .catch(() => undefined);
  }
  for (const [i, reason] of ["Asked at the desk", "Wrong number"].entries()) {
    const phone = `+25670000009${i}`;
    await db.execute(sql`INSERT INTO public.pharmacy_sms_optouts (hospital_id, phone_hmac, phone_encrypted, source, reason, recorded_by)
      VALUES (${h}, ${blindIndex(phone)}, ${encrypt(phone)}, 'staff', ${reason}, ${boss}::uuid) ON CONFLICT DO NOTHING`);
  }
  return { ok: true };
}
