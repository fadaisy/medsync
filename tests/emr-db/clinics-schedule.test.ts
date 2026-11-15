/**
 * Migration 0296 on the real SQL (clinics and schedule, ADRs 0501–0507).
 * S1: no client — clinician or another hospital's staff — reads or writes the new tables or calls cs_publish.
 * S4: publish is atomic: one refused op and nothing is written, no version, the drafts stay drafts.
 * S2/CS3: a draft row in schedule_changes leaves the engine's session_templates untouched until publish.
 * S23: a pairing code works once, and not after it expires. CS8: a card name needs a consent record.
 */
import { randomUUID } from "node:crypto";
import type { Pg } from "./_pglite";
import type { Session, Snapshot } from "@/lib/clinics-schedule/model";
import { beforeAll, describe, expect, it } from "vitest";

import { emptySnapshot } from "@/lib/clinics-schedule/model";
import { opsFor } from "@/lib/clinics-schedule/ops";
import { bootLane, clinician, department, hospital, laneOn, probe } from "./_pglite";

const TABLES = [
  "schedule_changes",
  "schedule_versions",
  "schedule_publish_jobs",
  "hospital_fee_bands",
  "hospital_holiday_decisions",
];

describe.skipIf(!laneOn)("0296: clinics and schedule", () => {
  let pg: Pg;
  let H: string;
  let H2: string;
  let D: string;
  let doc: { userId: string; affiliationId: string };
  let docH2: { userId: string; affiliationId: string };
  let line: string;
  let view: Snapshot;

  const draft = async (id: string, edits: unknown[] = []) =>
    pg.query(
      `INSERT INTO public.schedule_changes (id, hospital_id, summary, edits, author) VALUES ($1, $2, 'x', $3, $4)`,
      [id, H, JSON.stringify(edits), doc.userId],
    );
  const publish = (ids: string[], ops: unknown[]) =>
    pg
      .query<{ n: number }>(`SELECT public.cs_publish($1, $2, $3::uuid[], $4::jsonb, 0) AS n`, [
        H,
        doc.userId,
        ids,
        JSON.stringify(ops),
      ])
      .then((r) => ({ ok: true as const, n: r.rows[0]!.n }))
      .catch((e: Error) => ({ ok: false as const, error: e.message }));

  beforeAll(async () => {
    ({ pg } = await bootLane());
    H = await hospital(pg, "CS A");
    H2 = await hospital(pg, "CS B");
    D = await department(pg, H);
    const D2 = await department(pg, H2);
    doc = await clinician(pg, { hospitalId: H, departmentId: D });
    docH2 = await clinician(pg, { hospitalId: H2, departmentId: D2 });
    line = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.service_lines (hospital_id, department_id, name, slug) VALUES ($1, $2, 'Diabetes', 'dm') RETURNING id`,
        [H, D],
      )
    ).rows[0]!.id;
    view = emptySnapshot();
    view.clinics[line] = { id: line, departmentId: D } as Snapshot["clinics"][string];
    view.people.p1 = {
      id: "p1",
      userId: doc.userId,
      departmentId: D,
    } as Snapshot["people"][string];
  }, 120_000);

  const ses = (id: string, start: number): Session => ({
    id,
    clinicId: line,
    weekday: 2,
    start,
    end: start + 120,
    kind: "day",
    slotMin: 20,
    visitMin: 15,
    places: 20,
    holdPct: 10,
    brk: null,
    every: 1,
    nth: null,
    roomIds: [],
    personIds: ["p1"],
  });
  const ctx = () => ({ actor: doc.userId, today: "2026-11-16", view, newId: randomUUID });

  it("S1: no client reads or writes the new tables, in any hospital", async () => {
    await draft(randomUUID());
    for (const userId of [doc.userId, docH2.userId]) {
      for (const t of TABLES) {
        const r = await probe(pg, { userId, role: "authenticated" }, `SELECT * FROM public.${t}`);
        expect(r.ok ? r.rows : []).toEqual([]);
      }
      const w = await probe(
        pg,
        { userId, role: "authenticated" },
        `INSERT INTO public.schedule_changes (id, hospital_id, summary, edits, author) VALUES (gen_random_uuid(), $1, 'x', '[]', $2)`,
        [H, userId],
      );
      expect(w.ok).toBe(false);
      const f = await probe(
        pg,
        { userId, role: "authenticated" },
        `SELECT public.cs_publish($1, $2, '{}'::uuid[], '[]'::jsonb, 0)`,
        [H, userId],
      );
      expect(f.ok).toBe(false);
    }
  });

  it("CS3: a draft leaves the engine's sessions unchanged; publish applies it", async () => {
    const sid = randomUUID();
    const e = { entity: "sessions" as const, key: sid, before: null, after: ses(sid, 600) };
    const cid = randomUUID();
    await draft(cid, [e]);
    const before = await pg.query(`SELECT 1 FROM public.session_templates WHERE id = $1`, [sid]);
    expect(before.rows).toHaveLength(0);
    const r = await publish([cid], opsFor(e, ctx()));
    expect(r.ok).toBe(true);
    const row = (
      await pg.query<{
        start_minutes_local: number;
        capacity_booked: number;
        clinician_user_ids: string[];
      }>(
        `SELECT start_minutes_local, capacity_booked, clinician_user_ids FROM public.session_templates WHERE id = $1`,
        [sid],
      )
    ).rows[0]!;
    expect(row.start_minutes_local).toBe(600);
    expect(row.capacity_booked).toBe(18);
    expect(row.clinician_user_ids).toEqual([doc.userId]);
    const st = await pg.query<{ status: string }>(
      `SELECT status FROM public.schedule_changes WHERE id = $1`,
      [cid],
    );
    expect(st.rows[0]!.status).toBe("published");
  });

  it("S4: one refused op and nothing is published", async () => {
    const sid = randomUUID();
    const cid = randomUUID();
    const good = opsFor(
      { entity: "sessions", key: sid, before: null, after: ses(sid, 720) },
      ctx(),
    );
    await draft(cid);
    const versions = async () =>
      Number(
        (
          await pg.query<{ n: string }>(
            `SELECT count(*) AS n FROM public.schedule_versions WHERE hospital_id = $1`,
            [H],
          )
        ).rows[0]!.n,
      );
    const v0 = await versions();
    const bad = { t: "session_templates", op: "update", id: sid, v: { hospital_id: H2 } };
    const r = await publish([cid], [...good, bad]);
    expect(r.ok).toBe(false);
    expect(
      (await pg.query(`SELECT 1 FROM public.session_templates WHERE id = $1`, [sid])).rows,
    ).toHaveLength(0);
    expect(await versions()).toBe(v0);
    const st = await pg.query<{ status: string }>(
      `SELECT status FROM public.schedule_changes WHERE id = $1`,
      [cid],
    );
    expect(st.rows[0]!.status).toBe("draft");
  });

  it("0298: the cut-over settings publish through cs_publish", async () => {
    const sid = randomUUID();
    const cid = randomUUID();
    await draft(cid);
    const x = {
      ...ses(sid, 840),
      interleave: { booked: 3, walkIn: 1 },
      overbook: 1.2,
      holidays: true,
    };
    const c = {
      ...view.clinics[line]!,
      timeToCareDays: 21,
      continuity: true,
      reasons: ["refill", "follow_up"],
      isDefault: true,
    };
    const r = await publish(
      [cid],
      [
        ...opsFor({ entity: "sessions", key: sid, before: null, after: x }, ctx()),
        {
          t: "service_lines",
          op: "update",
          id: line,
          v: {
            time_to_care_days: c.timeToCareDays,
            continuity_default: true,
            reason_codes: ["follow_up", "refill"],
            is_default: true,
          },
        },
      ],
    );
    expect(r.ok).toBe(true);
    const t = (
      await pg.query<{
        interleave_booked: number;
        overbooking_factor: string;
        runs_on_holidays: boolean;
      }>(
        `SELECT interleave_booked, overbooking_factor, runs_on_holidays FROM public.session_templates WHERE id = $1`,
        [sid],
      )
    ).rows[0]!;
    expect(t).toMatchObject({ interleave_booked: 3, runs_on_holidays: true });
    expect(Number(t.overbooking_factor)).toBe(1.2);
    const l = (
      await pg.query<{ time_to_care_days: number; reason_codes: string[]; is_default: boolean }>(
        `SELECT time_to_care_days, reason_codes, is_default FROM public.service_lines WHERE id = $1`,
        [line],
      )
    ).rows[0]!;
    expect(l).toMatchObject({
      time_to_care_days: 21,
      reason_codes: ["follow_up", "refill"],
      is_default: true,
    });
  });

  it("cross-tenant: an op cannot update another hospital's row", async () => {
    const other = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.service_lines (hospital_id, department_id, name, slug)
         SELECT $1, id, 'Theirs', 't' FROM public.hospital_departments WHERE hospital_id = $1 LIMIT 1 RETURNING id`,
        [H2],
      )
    ).rows[0]!.id;
    const cid = randomUUID();
    await draft(cid);
    const r = await publish(
      [cid],
      [{ t: "service_lines", op: "update", id: other, v: { name: "Mine now" } }],
    );
    expect(r.ok).toBe(false);
  });

  it("S23: a pairing code works once and not after 15 minutes", async () => {
    const dev = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.desk_devices (hospital_id, label, created_by, kind) VALUES ($1, 'Desk 9', $2, 'desk') RETURNING id`,
        [H, doc.userId],
      )
    ).rows[0]!.id;
    await pg.query(`SELECT public.desk_pair_issue($1, 'K7M42Q')`, [dev]);
    const claim = async (h: string, code: string) =>
      (
        await pg.query<{ d: string | null }>(`SELECT public.desk_pair_claim($1, $2) AS d`, [
          h,
          code,
        ])
      ).rows[0]!.d;
    expect(await claim(H2, "K7M42Q")).toBeNull();
    expect(await claim(H, "k7m42q")).toBe(dev);
    expect(await claim(H, "K7M42Q")).toBeNull();
    await pg.query(`SELECT public.desk_pair_issue($1, 'ABCDEF')`, [dev]);
    await pg.query(
      `UPDATE public.desk_devices SET pair_code_expires_at = now() - interval '1 second' WHERE id = $1`,
      [dev],
    );
    expect(await claim(H, "ABCDEF")).toBeNull();
    const plain = await pg.query(
      `SELECT 1 FROM public.desk_devices WHERE pair_code_hash LIKE '%ABCDEF%'`,
    );
    expect(plain.rows).toHaveLength(0);
  });

  it("CS8: a name on booking cards needs a consent record", async () => {
    await expect(
      pg.query(`UPDATE public.staff_affiliations SET card_name = true WHERE id = $1`, [
        doc.affiliationId,
      ]),
    ).rejects.toThrow(/card_consent/);
    await pg.query(
      `UPDATE public.staff_affiliations SET card_name = true, card_consent_on = current_date, card_consent_by = $2 WHERE id = $1`,
      [doc.affiliationId, doc.userId],
    );
  });

  it("CS9: a fee band cannot be approved by its proposer", async () => {
    await expect(
      pg.query(
        `INSERT INTO public.hospital_fee_bands (hospital_id, band, general_ugx, private_ugx, proposed_by, approved_by)
         VALUES ($1, 'mo', 1, 1, $2, $2)`,
        [H, doc.userId],
      ),
    ).rejects.toThrow(/four_eyes/);
  });
});
