/**
 * Lab Phase 4, Step 2 (gate-a-proposal §3, §4; prompt §7): migrations 0150–0153 on the PGlite lane. Every new
 * table × every actor: lab staff, the laboratory lead (acting head of a section), the data protection lead, the
 * IPC lead, the hospital admin, the treating clinician, a clinician without access, staff of another hospital, a
 * superadmin without break-glass and anonymous. Machines (svc.partner, svc.bridge) reach only the two definer
 * functions. No client writes anywhere; append-only tables refuse UPDATE and DELETE on the service-role path too;
 * a sealed manifest cannot change and an outbreak referral never joins one; the message payload and the pairing
 * hash are never readable by a person's role; tokens and the replay cache have no reader. Every partner,
 * number and value here is a FIXTURE. Runs with EMR_PGLITE=1.
 */
import type { Actor, Lane, Pg } from "./_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import {
  authUser,
  bootLane,
  clinician,
  department,
  encounter,
  hospital,
  laneOn,
  patient,
  probe,
  seedRecord,
  seedRegistries,
  superadmin,
} from "./_pglite";

const NEW_TABLES = [
  "lab_partners",
  "hospital_designations",
  "lab_referrals",
  "lab_referral_events",
  "lab_manifests",
  "lab_manifest_items",
  "lab_manifest_prints",
  "lab_result_attachments",
  "lab_transcription_checks",
  "exchange_senders",
  "exchange_tokens",
  "exchange_jti",
  "exchange_messages",
  "exchange_events",
  "exchange_outbox",
  "lab_match_items",
  "lab_match_resolutions",
] as const;
type Table = (typeof NEW_TABLES)[number];

/** UPDATE and DELETE refused by trigger for every actor, the service role included. */
const APPEND_ONLY = [
  "lab_referral_events",
  "lab_manifest_prints",
  "lab_manifest_items",
  "lab_result_attachments",
  "lab_transcription_checks",
  "exchange_messages",
  "exchange_events",
  "lab_match_resolutions",
] as const;

type ActorKey =
  | "lab"
  | "lead"
  | "dpLead"
  | "ipcLead"
  | "admin"
  | "clinician"
  | "otherClinician"
  | "otherHospital"
  | "superadmin"
  | "anon";

describe.skipIf(!laneOn)("Lab Phase 4 data layer (0150–0153)", () => {
  let lane: Lane;
  let pg: Pg;
  let hA: string;
  let hB: string;
  const u: Record<string, string> = {};
  const id: Record<string, string> = {};
  const actors = {} as Record<ActorKey, Actor>;
  const sees = {} as Record<ActorKey, Partial<Record<Table, number>>>;

  const one = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
    (await pg.query<T>(sql, params)).rows[0]!;
  const ins = async (sql: string, params: unknown[]) =>
    (await one<{ id: string }>(`${sql} RETURNING id`, params)).id;
  const count = async (actor: Actor, table: string) => {
    const r = await probe(pg, actor, `SELECT count(*)::int AS n FROM public.${table}`);
    return r.ok ? (r.rows[0]!.n as number) : -1;
  };
  const asService = (sql: string, params: unknown[] = []) =>
    pg.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE service_role");
      await tx.query(sql, params);
      await tx.rollback();
    });
  const HASH = (c: string) => c.repeat(64);

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    hA = await hospital(pg, "Phase 4 A");
    hB = await hospital(pg, "Phase 4 B");
    await seedRegistries(pg, hA);
    const labDept = await department(pg, hA, "Laboratory");
    await pg.query(`UPDATE hospital_departments SET catalogue_code = 'LABORATORY' WHERE id = $1`, [
      labDept,
    ]);
    const chem = await ins(
      `INSERT INTO hospital_departments (hospital_id, parent_id, name, slug) VALUES ($1, $2, 'Chemistry fixture', 'chem-fx')`,
      [hA, labDept],
    );
    const opd = await department(pg, hA, "OPD");
    // Not the patient's department: the platform's access rule opens a department's recent encounters.
    const surgery = await department(pg, hA, "Surgery");
    const labDeptB = await department(pg, hB, "Laboratory B");
    const staffAt = async (h: string, d: string, cadre: string) =>
      (await clinician(pg, { hospitalId: h, departmentId: d, cadre })).userId;
    u.lab = await staffAt(hA, labDept, "LAB_TECH");
    u.lead = await staffAt(hA, chem, "LAB_TECHNOLOGIST");
    u.dpLead = await staffAt(hA, surgery, "MEDICAL_OFFICER");
    u.ipcLead = await staffAt(hA, surgery, "NURSE");
    u.doctor = await staffAt(hA, opd, "MEDICAL_OFFICER");
    u.otherDoctor = await staffAt(hA, surgery, "MEDICAL_OFFICER");
    u.labB = await staffAt(hB, labDeptB, "LAB_TECHNOLOGIST");
    u.admin = await authUser(pg, "hospital-admin");
    await pg.query(
      `INSERT INTO user_roles (user_id, role, hospital_id) VALUES ($1, 'hospital_admin', $2)`,
      [u.admin, hA],
    );
    u.superadmin = await superadmin(pg);
    await pg.query(
      `INSERT INTO department_heads (hospital_id, department_id, user_id, acting) VALUES ($1, $2, $3, true)`,
      [hA, chem, u.lead],
    );
    await pg.query(
      `INSERT INTO hospital_designations (hospital_id, role, user_id, starts_on, set_by) VALUES
         ($1, 'data_protection_lead', $2, current_date - 1, $4), ($1, 'ipc_lead', $3, current_date - 1, $4)`,
      [hA, u.dpLead, u.ipcLead, u.admin],
    );

    // The treating clinician's patient, an order and a specimen; the other clinician has no access basis.
    const pt = await patient(pg);
    const enc = await encounter(pg, {
      hospitalId: hA,
      patientUserId: pt,
      clinicianUserId: u.doctor!,
      departmentId: opd,
    });
    const aff = await one<{ id: string }>(`SELECT id FROM staff_affiliations WHERE user_id = $1`, [
      u.doctor,
    ]);
    const rec = await seedRecord(pg, {
      hospitalId: hA,
      patientUserId: pt,
      encounterId: enc,
      authorId: u.doctor!,
      authorAffiliationId: aff.id,
    });
    id.specimen = rec.specimens[0];
    id.order = rec.encounter_orders[0];
    id.report = rec.diagnostic_reports[0];

    // Partners: a private lab (fixture) and an outbreak destination (fixture).
    const partner = (name: string, kind: string) =>
      ins(
        `INSERT INTO lab_partners (hospital_id, name, kind, created_by) VALUES ($1, $2, $3, $4)`,
        [hA, name, kind, u.lead],
      );
    id.partner = await partner("Reference lab A (fixture)", "private_lab");
    id.outbreak = await partner("Outbreak destination (fixture)", "outbreak");
    await pg.query(
      `INSERT INTO lab_signed_configs (hospital_id, kind, key, version, payload, authored_by) VALUES
         ($1, 'partner_tests', $2, 1, '{}', $3), ($1, 'partner_legal', $2, 1, '{}', $4)`,
      [hA, id.partner, u.lead, u.dpLead],
    );

    // A routine referral on a manifest, with an event and a print; an outbreak referral (never on a manifest).
    const referral = (n: string, partnerId: string, routine: boolean, key: string) =>
      ins(
        `INSERT INTO lab_referrals (hospital_id, number, specimen_id, patient_user_id, order_ids, partner_id, routine,
           informed, client_key, created_by)
         VALUES ($1, $2, $3, $4, ARRAY[$5]::uuid[], $6, $7, $8, $9, $10)`,
        [
          hA,
          n,
          id.specimen,
          pt,
          id.order,
          partnerId,
          routine,
          routine ? null : { ipcLead: "fixture" },
          key,
          u.lab,
        ],
      );
    id.referral = await referral("RF-2026-0001", id.partner, true, "fixture-key-1");
    id.outbreakReferral = await referral("RF-2026-0002", id.outbreak, false, "fixture-key-2");
    await pg.query(
      `INSERT INTO lab_referral_events (hospital_id, referral_id, kind, event_at, source, actor_user_id, applied)
       VALUES ($1, $2, 'created', now(), 'person', $3, true)`,
      [hA, id.referral, u.lab],
    );
    id.manifest = await ins(
      `INSERT INTO lab_manifests (hospital_id, number, partner_id, transport, created_by)
       VALUES ($1, 'MF-2026-0001', $2, 'their courier (fixture)', $3)`,
      [hA, id.partner, u.lab],
    );
    await pg.query(
      `INSERT INTO lab_manifest_items (manifest_id, referral_id, hospital_id, position, added_by) VALUES ($1, $2, $3, 1, $4)`,
      [id.manifest, id.referral, hA, u.lab],
    );
    await pg.query(
      `INSERT INTO lab_manifest_prints (hospital_id, manifest_id, copy, printed_by) VALUES ($1, $2, false, $3)`,
      [hA, id.manifest, u.lab],
    );
    await pg.query(
      `INSERT INTO lab_result_attachments (hospital_id, referral_id, path, sha256, bytes, mime, uploaded_by)
       VALUES ($1, $2, $3, $4, 1000, 'application/pdf', $5)`,
      [hA, id.referral, `${hA}/${id.referral}/${id.referral}.pdf`, HASH("a"), u.lab],
    );
    await pg.query(
      `INSERT INTO lab_transcription_checks (hospital_id, report_id, kind) VALUES ($1, $2, 'task_opened')`,
      [hA, id.report],
    );

    // A partner's machine identity, a token, a jti, a message stored through the definer function, an outbound
    // message in the outbox, and a waiting match item with a resolution.
    id.sender = await ins(
      `INSERT INTO exchange_senders (hospital_id, kind, partner_id, name, state, jwks, scopes, enabled_by, enabled_at,
         pairing_hash, created_by)
       VALUES ($1, 'partner', $2, 'Reference lab A system (fixture)', 'active', '{"keys":[]}',
         '{system/exchange.inbound.write}', $3, now(), $4, $3)`,
      [hA, id.partner, u.lead, HASH("b")],
    );
    await pg.query(
      `INSERT INTO exchange_tokens (token_hash, sender_id, scopes, expires_at) VALUES ($1, $2, '{}', now() + interval '4 minutes')`,
      [HASH("c"), id.sender],
    );
    await pg.query(
      `INSERT INTO exchange_jti (jti, sender_id, expires_at) VALUES ('fixture-jti-1', $1, now())`,
      [id.sender],
    );
    id.message = (
      await one<{ message_id: string }>(
        `SELECT * FROM private.exchange_store_inbound($1, 'fhir', 'application/fhir+json', 'fixture-ciphertext', NULL,
           $2, 'ext-1', 'Result, form RL-0001 (fixture)', NULL, NULL)`,
        [id.sender, HASH("d")],
      )
    ).message_id;
    id.outMessage = await ins(
      `INSERT INTO exchange_messages (hospital_id, sender_id, direction, channel, content_type, payload_ciphertext,
         sha256, about) VALUES ($1, $2, 'out', 'fhir', 'application/fhir+json', 'fixture', $3, 'Referral RF-2026-0001')`,
      [hA, id.sender, HASH("e")],
    );
    await pg.query(
      `INSERT INTO exchange_outbox (message_id, hospital_id, sender_id, state, next_at) VALUES ($1, $2, $3, 'pending', now())`,
      [id.outMessage, hA, id.sender],
    );
    id.item = await ins(
      `INSERT INTO lab_match_items (hospital_id, message_id, component_key, reason, candidate_referral_id, state)
       VALUES ($1, $2, 'c1', 'demographics_disagree', $3, 'waiting')`,
      [hA, id.message, id.referral],
    );
    await pg.query(
      `INSERT INTO lab_match_resolutions (hospital_id, item_id, action, reason, actor_user_id)
       VALUES ($1, $2, 'asked_partner', 'Asked the reference lab (fixture)', $3)`,
      [hA, id.item, u.lab],
    );

    const reader = (userId: string, hospitalId = hA): Actor => ({
      userId,
      role: "medsync_clinical_reader",
      hospitalId,
    });
    Object.assign(actors, {
      lab: reader(u.lab!),
      lead: reader(u.lead!),
      dpLead: reader(u.dpLead!),
      ipcLead: reader(u.ipcLead!),
      admin: reader(u.admin!),
      clinician: reader(u.doctor!),
      otherClinician: reader(u.otherDoctor!),
      otherHospital: reader(u.labB!, hB),
      superadmin: reader(u.superadmin!),
      anon: { userId: null, role: "anon" },
    } satisfies Record<ActorKey, Actor>);
    const none = Object.fromEntries(NEW_TABLES.map((t) => [t, 0])) as Record<Table, number>;
    // Lab staff and the lead read every row of the lab's tables, but never tokens or the replay cache.
    const lab = { exchange_tokens: 0, exchange_jti: 0 };
    Object.assign(sees, {
      lab,
      lead: lab,
      // The DP lead: the partner register and their own designation.
      dpLead: { ...none, lab_partners: 2, hospital_designations: 1 },
      ipcLead: { ...none, hospital_designations: 1 },
      // The admin: the register and the designations; no patient row, no message.
      admin: { ...none, lab_partners: 2, hospital_designations: 2 },
      // The treating clinician: referrals of their patient, the referral's events, and the scan.
      clinician: { ...none, lab_referrals: 2, lab_referral_events: 1, lab_result_attachments: 1 },
      otherClinician: none,
      otherHospital: none,
      superadmin: none,
      anon: none,
    } satisfies Record<ActorKey, Partial<Record<Table, number>>>);
  }, 240_000);

  it("every new table × every actor reads exactly what the plan allows", async () => {
    const rows: string[] = [];
    for (const t of NEW_TABLES) {
      const all = (
        await one<{ n: number }>(
          t === "exchange_tokens" || t === "exchange_jti"
            ? `SELECT count(*)::int AS n FROM public.${t}`
            : `SELECT count(*)::int AS n FROM public.${t} WHERE hospital_id = $1`,
          t === "exchange_tokens" || t === "exchange_jti" ? [] : [hA],
        )
      ).n;
      expect(all, `${t} has fixture rows`).toBeGreaterThan(0);
      for (const k of Object.keys(actors) as ActorKey[]) {
        const want = sees[k][t] ?? all;
        const got = await count(actors[k], t);
        // -1 (no privilege) counts as reading nothing.
        if (Math.max(got, 0) !== want) rows.push(`${t} × ${k}: ${got}, expected ${want}`);
      }
    }
    expect(rows).toEqual([]);
  });

  it("another hospital's lab staff see nothing even when asserting hospital A", async () => {
    for (const t of NEW_TABLES)
      expect(Math.max(await count({ ...actors.otherHospital, hospitalId: hA }, t), 0), t).toBe(0);
  });

  it("no client INSERT, UPDATE or DELETE on any new table", async () => {
    const client = await authUser(pg, "client");
    for (const t of NEW_TABLES) {
      const me: Actor = { userId: client, role: "authenticated" };
      const insert = await probe(pg, me, `INSERT INTO public.${t} DEFAULT VALUES`);
      const update = await probe(pg, me, `UPDATE public.${t} SET hospital_id = hospital_id`);
      const del = await probe(pg, me, `DELETE FROM public.${t}`);
      expect(insert.ok, `${t} insert`).toBe(false);
      expect(update.ok ? update.affected : 0, `${t} update`).toBe(0);
      expect(del.ok ? del.affected : 0, `${t} delete`).toBe(0);
    }
  });

  it("append-only tables refuse UPDATE and DELETE on the service-role path too", async () => {
    for (const t of APPEND_ONLY) {
      await expect(
        asService(`UPDATE public.${t} SET hospital_id = hospital_id`),
        `${t} update`,
      ).rejects.toThrow();
      await expect(asService(`DELETE FROM public.${t}`), `${t} delete`).rejects.toThrow();
    }
  });

  it("a person's role never reads the message payload, the pairing hash, tokens or the replay cache (EX-9, AB-6)", async () => {
    for (const sql of [
      `SELECT payload_ciphertext FROM public.exchange_messages`,
      `SELECT pairing_hash FROM public.exchange_senders`,
      `SELECT jwks FROM public.exchange_senders`,
      `SELECT * FROM public.exchange_tokens`,
      `SELECT * FROM public.exchange_jti`,
    ])
      expect((await probe(pg, actors.lead, sql)).ok, sql).toBe(false);
    expect((await probe(pg, actors.lead, `SELECT about FROM public.exchange_messages`)).ok).toBe(
      true,
    );
  });

  it("no client can call the machine functions; the store refuses a sender that is not active", async () => {
    const client = await authUser(pg, "client-fn");
    const me: Actor = { userId: client, role: "authenticated" };
    expect(
      (
        await probe(
          pg,
          me,
          `SELECT * FROM private.exchange_store_inbound(NULL, 'fhir', 'x', 'x', NULL, 'x', NULL, 'x', NULL, NULL)`,
        )
      ).ok,
    ).toBe(false);
    expect((await probe(pg, me, `SELECT * FROM private.exchange_sender_config(NULL)`)).ok).toBe(
      false,
    );
    await pg.query(
      `UPDATE exchange_senders SET state = 'revoked', revoked_at = now(), revoked_by = $2 WHERE id = $1`,
      [id.sender, u.lead],
    );
    await expect(
      pg.query(
        `SELECT * FROM private.exchange_store_inbound($1, 'fhir', 'x', 'x', NULL, $2, NULL, 'x', NULL, NULL)`,
        [id.sender, HASH("f")],
      ),
    ).rejects.toThrow(/sender not active/);
    expect(
      (
        await one<{ n: number }>(
          `SELECT count(*)::int AS n FROM private.exchange_sender_config($1)`,
          [id.sender],
        )
      ).n,
    ).toBe(0);
    await pg.query(
      `UPDATE exchange_senders SET state = 'active', revoked_at = NULL, revoked_by = NULL WHERE id = $1`,
      [id.sender],
    );
  });

  it("store before acknowledge de-duplicates by external id and by content (EX-3)", async () => {
    const store = (sha: string, ext: string | null) =>
      one<{ message_id: string; duplicate: boolean }>(
        `SELECT * FROM private.exchange_store_inbound($1, 'fhir', 'application/fhir+json', 'x', NULL, $2, $3, 'Result (fixture)', NULL, NULL)`,
        [id.sender, sha, ext],
      );
    const again = await store(HASH("d"), "ext-1");
    expect(again).toEqual({ message_id: id.message, duplicate: true });
    const sameContent = await store(HASH("d"), "ext-other");
    expect(sameContent.duplicate).toBe(true);
    const events = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM exchange_events WHERE message_id = $1 AND state = 'duplicate'`,
      [id.message],
    );
    expect(events.n).toBe(2);
    expect(
      (
        await one<{ n: number }>(
          `SELECT count(*)::int AS n FROM exchange_messages WHERE direction = 'in'`,
        )
      ).n,
    ).toBe(1);
  });

  it("an outbreak referral never joins a manifest, and a sealed manifest cannot change (RF-7, MF-3)", async () => {
    const m2 = await ins(
      `INSERT INTO lab_manifests (hospital_id, number, partner_id, transport, created_by)
       VALUES ($1, 'MF-2026-0002', $2, 'fixture', $3)`,
      [hA, id.outbreak, u.lab],
    );
    await expect(
      pg.query(
        `INSERT INTO lab_manifest_items (manifest_id, referral_id, hospital_id, position, added_by) VALUES ($1, $2, $3, 1, $4)`,
        [m2, id.outbreakReferral, hA, u.lab],
      ),
    ).rejects.toThrow(/high-risk/);
    await pg.query(
      `UPDATE lab_manifests SET state = 'sealed', sealed_by = $2, sealed_at = now() WHERE id = $1`,
      [id.manifest, u.lab],
    );
    const ref2 = await ins(
      `INSERT INTO lab_referrals (hospital_id, number, specimen_id, patient_user_id, order_ids, partner_id, routine,
         client_key, created_by)
       SELECT hospital_id, 'RF-2026-0003', specimen_id, patient_user_id, order_ids, partner_id, true, 'fixture-key-3', created_by
         FROM lab_referrals WHERE id = $1`,
      [id.referral],
    ).catch(() => null);
    // One referral per specimen per destination (RF-2): the copy above is refused.
    expect(ref2).toBeNull();
    await expect(
      pg.query(`UPDATE lab_manifests SET state = 'open' WHERE id = $1`, [id.manifest]),
    ).rejects.toThrow(/forward/);
    await expect(
      pg.query(`UPDATE lab_manifests SET transport = 'changed' WHERE id = $1`, [id.manifest]),
    ).rejects.toThrow(/sealed/);
  });

  it("the legal record is hidden from a clinician but read by the DP lead and the lab (P4)", async () => {
    const legal = `SELECT count(*)::int AS n FROM public.lab_signed_configs WHERE kind = 'partner_legal'`;
    const n = async (a: Actor, sql = legal) => {
      const r = await probe(pg, a, sql);
      return r.ok ? (r.rows[0]!.n as number) : -1;
    };
    expect(await n(actors.clinician)).toBe(0);
    expect(await n(actors.dpLead)).toBe(1);
    expect(await n(actors.lab)).toBe(1);
    expect(await n(actors.admin)).toBe(1);
    const tests = `SELECT count(*)::int AS n FROM public.lab_signed_configs WHERE kind = 'partner_tests'`;
    expect(await n(actors.clinician, tests)).toBe(1);
  });

  it("the hospital admin gets referral counts only, through the aggregate function", async () => {
    const q = `SELECT * FROM private.lab_referral_counts(now() - interval '1 day', now())`;
    const r = await probe(pg, actors.admin, q);
    if (!r.ok) throw new Error(r.error);
    expect(Object.keys(r.rows[0]!).sort()).toEqual(["back", "sent", "waiting"]);
    const other = await probe(pg, actors.otherClinician, q);
    if (!other.ok) throw new Error(other.error);
    expect(other.rows[0]).toEqual({ sent: 0, back: 0, waiting: 0 });
  });

  it("a referred report must be external, on an order, with provenance; a printed range needs what was printed", async () => {
    await expect(
      asService(`UPDATE diagnostic_reports SET referral_id = $2 WHERE id = $1`, [
        id.report,
        id.referral,
      ]),
    ).rejects.toThrow();
    const def = await one<{ d: string }>(
      `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'lrs_range_source'`,
    );
    expect(def.d).toMatch(/performing_lab/);
    expect(def.d).toMatch(/printed IS NOT NULL/);
  });

  it("filing after a mismatch needs a method, a second person and, for a call, who was spoken to (MA-6)", async () => {
    await expect(
      pg.query(
        `INSERT INTO lab_match_resolutions (hospital_id, item_id, action, method, reason, actor_user_id)
         VALUES ($1, $2, 'file_after_confirming', 'phone_call', 'fixture', $3)`,
        [hA, id.item, u.lab],
      ),
    ).rejects.toThrow(/lmr_confirm/);
    await expect(
      pg.query(
        `INSERT INTO lab_match_resolutions (hospital_id, item_id, action, method, second_user_id, reason, actor_user_id)
         VALUES ($1, $2, 'file_after_confirming', 'phone_call', $3, 'fixture', $3)`,
        [hA, id.item, u.lab],
      ),
    ).rejects.toThrow(/lmr_confirm/);
  });

  it("a waiting match item must carry its reason; a token lives at most five minutes", async () => {
    await expect(
      pg.query(
        `INSERT INTO lab_match_items (hospital_id, message_id, component_key, state) VALUES ($1, $2, 'c2', 'waiting')`,
        [hA, id.message],
      ),
    ).rejects.toThrow(/lmi_reason/);
    await expect(
      pg.query(
        `INSERT INTO exchange_tokens (token_hash, sender_id, scopes, expires_at) VALUES ($1, $2, '{}', now() + interval '6 minutes')`,
        [HASH("9"), id.sender],
      ),
    ).rejects.toThrow(/et_short/);
  });
});
