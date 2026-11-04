/**
 * Set-up › People and roster through the server actions (PEOPLE-ROSTER.md §18) on the demo lane: listing people and
 * their licences, a slot filling to the signed number, a signed change to that number taking effect at once, and a
 * published week refusing changes in words. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { DemoLane } from "./_pharmacy-demo";
import type * as Roster from "@/lib/pharmacy/actions/roster";
import type { PharmacyActor } from "@/lib/pharmacy/write";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { laneOn } from "./_pglite";
import { demoLane } from "./_pharmacy-demo";

vi.mock("server-only", () => ({}));
const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

const day = (n: number) => {
  const d = new Date(Date.now() + 3 * 3_600_000);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** A Monday three weeks ahead: never today, never published by the demo. */
const MON = (() => {
  const d = new Date(`${day(21)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
})();

describe.skipIf(!laneOn)("Roster actions (0273)", () => {
  let L: DemoLane;
  let R: typeof Roster;
  let chief: PharmacyActor;
  let other: PharmacyActor;
  let place: string;
  let staff: string[];
  const ok = async <T>(p: Promise<{ ok: boolean; error?: string; data?: T }>) => {
    const r = await p;
    if (!r.ok) throw new Error(r.error);
    return r.data as T;
  };
  const refusal = async (p: Promise<{ ok: true } | { ok: false; error: string }>) => {
    const r = await p;
    return r.ok ? null : r.error;
  };
  const assign = (userId: string) =>
    R.assignToSlot(chief, {
      clientKey: randomUUID(),
      userId,
      placeId: place,
      date: MON,
      shift: "day",
    });

  beforeAll(async () => {
    L = await demoLane((db) => (held.db = db));
    const state = await import("@/lib/pharmacy/demo/state");
    R = await import("@/lib/pharmacy/actions/roster");
    chief = state.chiefActor(L.s, null);
    other = state.pharmacyActor(L.s, L.s.people.pharmacists[1]!, "PHARMACIST", null);
    place = (
      await L.pg.query<{ id: string }>(
        `SELECT id FROM pharmacy_locations WHERE hospital_id = $1 AND kind = 'dispensing_point' ORDER BY name LIMIT 1`,
        [L.h],
      )
    ).rows[0]!.id;
    staff = [L.s.people.pharmacists[0]!, ...L.s.people.techs.slice(0, 2)];
  }, 900_000);

  it("the People tab reads every table it needs, and the 0080 holidays", async () => {
    const { loadRosterWorld } = await import("@/lib/pharmacy/roster/read");
    const w = await loadRosterWorld(
      held.db as never,
      L.h,
      chief.userId,
      true,
      "2026-11-02",
      new Date("2026-11-04T06:00:00Z"),
    );
    expect(w.gazetted.find((g) => g.day === "2026-03-20")).toMatchObject({ confirmed: false });
    expect(w.gazetted.find((g) => g.day === "2026-05-01")).toMatchObject({ confirmed: true });
  });

  it("only listed, licensed people are rostered; the slot fills to the signed number", async () => {
    for (const [i, u] of staff.entries())
      await ok(
        R.addPerson(chief, { userId: u, cadre: i ? "technician" : "pharmacist", places: [place] }),
      );
    expect(await refusal(assign(staff[0]!))).toMatch(/licence/i);
    for (const [i, u] of staff.entries())
      await ok(
        R.recordLicence(chief, {
          userId: u,
          body: i ? "AHPC" : "PSU",
          number: `T/${i}`,
          expiresOn: day(400),
        }),
      );
    await ok(assign(staff[0]!));
    await ok(assign(staff[1]!));
    expect(await refusal(assign(staff[2]!))).toMatch(/full/i);
    // Not the in-charge: a colleague cannot list people.
    expect(
      (await R.addPerson(other, { userId: staff[2]!, cadre: "technician", places: [place] })).ok,
    ).toBe(false);
  });

  it("a signed change to people per shift changes the check at once", async () => {
    const rules = await import("@/lib/pharmacy/rules/actions");
    const med = await import("@/lib/pharmacy/medicines/store");
    const { runPharmacyWrite } = await import("@/lib/pharmacy/write");
    const p = await ok(
      rules.proposeRegistryRule(chief, {
        clientKey: randomUUID(),
        group: "roster",
        key: "per_shift",
        n: 3,
        newText: null,
        reason: "Busy clinic days",
      }),
    );
    const sign = (who: PharmacyActor, role: "in_charge" | "second") =>
      ok(
        runPharmacyWrite(
          med.SignInput,
          { id: p.id, role },
          who,
          med.MED_NEED,
          med.signRuleProposal,
        ),
      );
    await sign(chief, "in_charge");
    await sign(other, "second");
    await ok(assign(staff[2]!));
  });

  it("a published week refuses changes in words until it is unlocked", async () => {
    await ok(R.publishWeek(chief, { weekStart: MON }));
    const d = (
      await L.pg.query<{ id: string }>(
        `SELECT id FROM pharmacy_duty_roster WHERE user_id = $1 AND date_from = $2 AND ended_at IS NULL`,
        [staff[2], MON],
      )
    ).rows[0]!.id;
    expect(await refusal(R.removeFromSlot(chief, { dutyId: d }))).toMatch(/published/i);
    expect((await R.unlockWeek(chief, { weekStart: MON, reason: "" })).ok).toBe(false);
    await ok(R.unlockWeek(chief, { weekStart: MON, reason: "Late change" }));
    await ok(R.removeFromSlot(chief, { dutyId: d }));
  });
});
