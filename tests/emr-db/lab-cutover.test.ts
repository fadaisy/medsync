/**
 * Lab Phase 1, Step 8: the cut-over to one result path on the PGlite lane (S45–S48; CO-1 to CO-5).
 * The four conditions read from the record; a second admin approves in one audited transaction; the
 * legacy path then takes no writes; a superadmin and a second superadmin reverse it with a reason.
 * The alert wording is still a draft in content/: here it is mocked as signed, a FIXTURE, so the
 * switch can be exercised. Response times are FIXTURES. Runs with EMR_PGLITE=1.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Lane, Pg } from "./_pglite";
import type * as Copy from "@/content/lab-criticals";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  approveCutover,
  legacyWritesOpen,
  readinessFor,
  requestCutover,
  reverseCutover,
} from "@/lib/lab/cutover-store";
import { recordBriefing, recordDrill } from "@/lib/lab/downtime-store";
import {
  bootLane,
  clinician,
  department,
  encounter,
  hospital,
  laneOn,
  patient,
  superadmin,
} from "./_pglite";

// Every call here passes the lane's database; the app's client is never opened.
vi.mock("@/db", () => ({ db: undefined }));
vi.mock("@/content/lab-criticals", async (orig) => ({
  ...(await orig<typeof Copy>()),
  // FIXTURE: the real wording is unsigned (Appendix A), which keeps every real hospital not ready.
  CRITICALS_COPY_STATUS: { status: "signed", signedBy: "fixture", signedOn: "2026-01-01" },
}));

describe.skipIf(!laneOn)("Lab Phase 1 one result path (S45–S48)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let other: string;
  let ward: string;
  let legacyOrder: string;
  let cutoverId: string;
  const u: Record<string, string> = {};
  const env = { ...process.env };
  type Tx = Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0];
  const tx = <T>(fn: (t: Tx) => Promise<T>) => lane.db.transaction(fn);
  const admin = (k: "a" | "b") => ({ userId: u[k]!, hospitalId: h });
  const ready = () => tx((t) => readinessFor(t, h, new Date()));

  beforeAll(async () => {
    for (const k of ["LAB_WORKSPACE", "LAB_CRITICALS", "LAB_UNITS_RANGES", "LAB_DOWNTIME"])
      process.env[k] = "";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Cutover");
    other = await hospital(pg, "Not switched");
    ward = await department(pg, h, "Ward");
    const doctor = await clinician(pg, { hospitalId: h, departmentId: ward });
    u.a = (await clinician(pg, { hospitalId: h, departmentId: ward, cadre: "NURSE" })).userId;
    u.b = (await clinician(pg, { hospitalId: h, departmentId: ward, cadre: "NURSE" })).userId;
    u.lead = doctor.userId;
    u.sa1 = await superadmin(pg);
    u.sa2 = await superadmin(pg);
    const p = await patient(pg);
    const enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: doctor.userId,
      departmentId: ward,
    });
    // An old-path request still waiting in the lab (lifecycle defaults to legacy, status to ordered).
    legacyOrder = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.encounter_orders (encounter_id, patient_user_id, kind, text, authored_by_user_id)
         VALUES ($1, $2, 'bloods', 'FBC', $3) RETURNING id`,
        [enc, p, doctor.userId],
      )
    ).rows[0]!.id;
  }, 300_000);
  afterAll(() => {
    for (const k of ["LAB_WORKSPACE", "LAB_CRITICALS", "LAB_UNITS_RANGES", "LAB_DOWNTIME"])
      process.env[k] = env[k];
  });

  it("S45: open legacy items close the switch, and the count is shown", async () => {
    const r = await ready();
    expect(r.ready).toBe(false);
    const by = Object.fromEntries(r.conditions.map((c) => [c.key, c]));
    expect(by.legacy_clear).toMatchObject({ met: false, evidence: ["open_legacy:1"] });
    expect(by.setup_complete!.evidence).toEqual(
      expect.arrayContaining(["response_times_unsigned", expect.stringMatching(/^no_level1:Ward/)]),
    );
    expect(by.drill_recorded!.met).toBe(false);
    expect(by.briefing_recorded!.met).toBe(false);
    await expect(tx((t) => requestCutover(t, admin("a"), new Date()))).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("S46: with all four met, admin A requests; A cannot approve; B approves, audited", async () => {
    await pg.query(`UPDATE public.encounter_orders SET status = 'resulted' WHERE id = $1`, [
      legacyOrder,
    ]);
    await pg.query(
      `INSERT INTO critical_response_versions (hospital_id, version, status, ack_within_min, level1_after_min, level2_after_min, source,
         authored_by, lead_signed_by, lead_signed_at, cso_signed_by, cso_signed_at)
       VALUES ($1, 1, 'signed', 30, 20, 15, 'fixture: invented for tests', $2, $2, now(), $3, now())`,
      [h, u.lead, u.sa1],
    );
    await pg.query(
      `INSERT INTO critical_contacts (hospital_id, department_id, level, user_id, position) VALUES ($1, $2, 1, $3, 1)`,
      [h, ward, u.lead],
    );
    const lead = { userId: u.lead!, hospitalId: h };
    await tx((t) =>
      recordDrill(
        t,
        lead,
        {
          heldOn: "2026-10-01",
          participants: "Fixture lab team",
          whatWasDone: "Printed, filled and entered two forms",
          problems: null,
        },
        new Date(),
      ),
    );
    await tx((t) =>
      recordBriefing(
        t,
        admin("a"),
        { heldOn: "2026-10-02", audience: "Lab and Ward", notes: null },
        new Date(),
      ),
    );
    expect((await ready()).ready).toBe(true);

    cutoverId = await tx((t) => requestCutover(t, admin("a"), new Date()));
    await expect(tx((t) => requestCutover(t, admin("b"), new Date()))).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(
      tx((t) => approveCutover(t, admin("a"), cutoverId, new Date())),
    ).rejects.toMatchObject({ code: "forbidden" });
    // The database refuses it too.
    await expect(
      pg.query(
        `UPDATE lab_cutover SET approved_by = requested_by, switched_at = now() WHERE id = $1`,
        [cutoverId],
      ),
    ).rejects.toThrow(/lc_second_approver/);
    expect(await legacyWritesOpen(h, lane.db)).toBe(true);

    await tx((t) => approveCutover(t, admin("b"), cutoverId, new Date()));
    const [row] = (
      await pg.query<Record<string, unknown>>(`SELECT * FROM lab_cutover WHERE id = $1`, [
        cutoverId,
      ])
    ).rows;
    expect(row).toMatchObject({ requested_by: u.a, approved_by: u.b });
    expect(row!.switched_at).not.toBeNull();
    expect((row!.conditions as { met: boolean }[]).every((c) => c.met)).toBe(true);
    const audited = await pg.query<{ action: string }>(
      `SELECT action FROM public.audit_log WHERE table_name = 'lab_cutover' AND record_id = $1 ORDER BY id`,
      [cutoverId],
    );
    expect(audited.rows.map((r) => r.action)).toEqual(["insert", "update"]);
  });

  it("S47: after the switch the legacy path takes no writes here; the old list stays readable", async () => {
    expect(await legacyWritesOpen(h, lane.db)).toBe(false);
    expect(await legacyWritesOpen(other, lane.db)).toBe(true);
    // Each of the three legacy writes asks first (enter, release, reject).
    const src = readFileSync(resolve(process.cwd(), "app/lab/actions.ts"), "utf8");
    const actions = src.split(/export async function /).slice(1);
    expect(actions.length).toBe(3);
    for (const a of actions)
      expect(a).toMatch(/if \(!\(await legacyWritesOpen\(scope\.hospitalId\)\)\)/);
    // The older list reads encounter_results, which is untouched.
    expect(readFileSync(resolve(process.cwd(), "app/lab/older/page.tsx"), "utf8")).toMatch(
      /encounterResults/,
    );
  });

  it("CO-5: a superadmin requests with a reason; the same one cannot approve; a second reverses", async () => {
    await expect(
      tx((t) =>
        reverseCutover(
          t,
          { userId: u.sa1! },
          { cutoverId, reason: "short", approve: false },
          new Date(),
        ),
      ),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      tx((t) =>
        reverseCutover(
          t,
          { userId: u.sa1! },
          { cutoverId, reason: null, approve: true },
          new Date(),
        ),
      ),
    ).rejects.toMatchObject({ code: "conflict" });
    const reason = "Fixture: a lab analyser feed failed and staff need the old path for a day.";
    await tx((t) =>
      reverseCutover(t, { userId: u.sa1! }, { cutoverId, reason, approve: false }, new Date()),
    );
    await expect(
      tx((t) =>
        reverseCutover(
          t,
          { userId: u.sa1! },
          { cutoverId, reason: null, approve: true },
          new Date(),
        ),
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(await legacyWritesOpen(h, lane.db)).toBe(false);
    await tx((t) =>
      reverseCutover(t, { userId: u.sa2! }, { cutoverId, reason: null, approve: true }, new Date()),
    );
    expect(await legacyWritesOpen(h, lane.db)).toBe(true);
    const [row] = (
      await pg.query<Record<string, unknown>>(`SELECT * FROM lab_cutover WHERE id = $1`, [
        cutoverId,
      ])
    ).rows;
    expect(row).toMatchObject({
      reversed_by: u.sa1,
      reversal_approved_by: u.sa2,
      reversal_reason: reason,
    });
  });

  it("S48: every Phase 1 flag off at a hospital that has not switched: the Phase 0 path is open", async () => {
    for (const k of ["LAB_WORKSPACE", "LAB_CRITICALS", "LAB_UNITS_RANGES", "LAB_DOWNTIME"])
      expect(process.env[k]).toBeFalsy();
    expect(await legacyWritesOpen(other, lane.db)).toBe(true);
    expect(
      Number(
        (
          await pg.query<{ n: number }>(
            `SELECT count(*)::int n FROM lab_cutover WHERE hospital_id = $1`,
            [other],
          )
        ).rows[0]!.n,
      ),
    ).toBe(0);
  });
});
