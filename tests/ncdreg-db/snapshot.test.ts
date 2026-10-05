/**
 * §6 / F5: snapshots. Signing is refused before go-live; at an approved facility the registry lead
 * signs, and a signed snapshot is immutable (update and delete refused, a recompute returns it as it
 * was). PGlite lane only. The facility is approved by the owner directly: no synthetic person exists.
 */
import type { Lane } from "../emr-db/_pglite";
import type { NcdFacility } from "./_ncd";
import { beforeAll, describe, expect, it } from "vitest";

import { signSnapshot, storeSnapshot } from "@/lib/ncdreg/indicators/snapshot";
import { ctxFor } from "./_engine";
import { bootLane, laneOn, ncdFacility } from "./_ncd";

describe.skipIf(!laneOn)("monthly snapshots", () => {
  let lane: Lane;
  let draft: NcdFacility;
  let approved: NcdFacility;
  beforeAll(async () => {
    lane = await bootLane();
    draft = await ncdFacility(lane.pg, "Snapshot draft facility");
    approved = await ncdFacility(lane.pg, "Snapshot approved facility");
    {
      const {
        rows: [gl],
      } = await lane.pg.query<{ id: string }>(
        `INSERT INTO public.ncd_go_live_request (facility_id, requested_by) VALUES ($1, $2) RETURNING id`,
        [approved.facilityId, approved.users.registry_lead],
      );
      await lane.pg.query(
        `UPDATE public.ncd_go_live_request SET status = 'approved', decided_by = $2, decided_at = now() WHERE id = $1`,
        [gl!.id, approved.users.clinical_safety_officer],
      );
    }
  }, 120_000);

  it("no report can be signed before go-live", async () => {
    const sys = await ctxFor(lane.db, draft, { userId: null }, { principal: "system" });
    const snap = await storeSnapshot(sys, "2026-09");
    const lead = await ctxFor(lane.db, draft, "registry_lead");
    await expect(signSnapshot(lead, snap.id)).rejects.toThrow(/before go-live/);
  });

  it("a signed snapshot is immutable", async () => {
    const sys = await ctxFor(lane.db, approved, { userId: null }, { principal: "system" });
    const snap = await storeSnapshot(sys, "2026-09");
    expect(snap.isSynthetic).toBe(false);
    const lead = await ctxFor(lane.db, approved, "registry_lead");
    const signed = await signSnapshot(lead, snap.id);
    expect(signed.signedBy).toBe(approved.users.registry_lead);
    await expect(
      lane.pg.query(`UPDATE public.ncd_indicator_snapshot SET results = '{}' WHERE id = $1`, [
        snap.id,
      ]),
    ).rejects.toThrow(/immutable/);
    await expect(
      lane.pg.query(`DELETE FROM public.ncd_indicator_snapshot WHERE id = $1`, [snap.id]),
    ).rejects.toThrow(/never deleted/);
    const again = await storeSnapshot(sys, "2026-09");
    expect(again.id).toBe(snap.id);
    expect(again.computedAt).toEqual(signed.computedAt);
  });

  it("a clinician cannot sign", async () => {
    const sys = await ctxFor(lane.db, approved, { userId: null }, { principal: "system" });
    const snap = await storeSnapshot(sys, "2026-08");
    const clin = await ctxFor(lane.db, approved, "clinician");
    await expect(signSnapshot(clin, snap.id)).rejects.toThrow(/report_sign/);
  });
});
