import type { LayoutBed, WardLayout } from "@/lib/wards/layout-schema";
import type { RegisterBed } from "@/lib/wards/reconcile";
import { describe, expect, it } from "vitest";

import { emptyLayout, layoutFromRegister } from "@/lib/wards/geometry";
import { planSummary, publishPayload, reconcile, syncWithRegister } from "@/lib/wards/reconcile";

/* ADR 0192: the published layout → the bed register, pure. The SQL half is tests/emr-db/ward-builder. */

const reg = (id: string, label: string, over: Partial<RegisterBed> = {}): RegisterBed => ({
  id,
  label,
  bedType: null,
  closedAt: null,
  closedReason: null,
  archivedAt: null,
  layoutX: null,
  layoutY: null,
  rotation: null,
  roomKey: null,
  services: [],
  ...over,
});
const bed = (key: string, label: string, over: Partial<LayoutBed> = {}): LayoutBed => ({
  key,
  label,
  type: "standard",
  x: 2 + Number(key.slice(1)) * 4,
  y: 2,
  rot: 0,
  services: [],
  status: "in",
  ...over,
});
const doc = (beds: LayoutBed[], extra: Partial<WardLayout> = {}): WardLayout => ({
  ...emptyLayout(),
  beds,
  ...extra,
});
const ID = {
  a: "00000000-0000-4000-8000-00000000000a",
  b: "00000000-0000-4000-8000-00000000000b",
  c: "00000000-0000-4000-8000-00000000000c",
};

describe("reconcile — matching", () => {
  it("a new ward: every bed is created, nothing archived, the count is the plan's", () => {
    const r = reconcile({
      doc: doc([bed("b1", "B1"), bed("b2", "B2")]),
      register: [],
      occupiedBedIds: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.create.map((c) => c.label)).toEqual(["B1", "B2"]);
    expect(r.plan.keep).toEqual([]);
    expect(r.plan.archive).toEqual([]);
    expect(r.plan.bedCount).toBe(2);
    expect(r.plan.bedCountBefore).toBe(0);
  });

  it("matches by register id first, then an unclaimed active label, then restores an archived label", () => {
    const register = [
      reg(ID.a, "Bed 1"),
      reg(ID.b, "Bed 2"),
      reg(ID.c, "Bed 9", { archivedAt: "2026-09-01T00:00:00Z" }),
    ];
    const r = reconcile({
      doc: doc([bed("b1", "Bed 5", { bedId: ID.a }), bed("b2", "Bed 2"), bed("b3", "Bed 9")]),
      register,
      occupiedBedIds: [],
    });
    if (!r.ok) throw new Error(r.refusal);
    expect(r.plan.keep.map((k) => [k.bedId, k.label, k.restore])).toEqual([
      [ID.a, "Bed 5", false],
      [ID.b, "Bed 2", false],
      [ID.c, "Bed 9", true],
    ]);
    expect(r.plan.create).toEqual([]);
    expect(r.plan.archive).toEqual([]);
    // Every kept bed carries its id in the document to publish.
    expect(r.plan.document.beds.map((b) => b.bedId)).toEqual([ID.a, ID.b, ID.c]);
  });

  it("archives active register beds that left the plan; archived ones stay as they are", () => {
    const register = [
      reg(ID.a, "B1"),
      reg(ID.b, "B2"),
      reg(ID.c, "B3", { archivedAt: "2026-09-01T00:00:00Z" }),
    ];
    const r = reconcile({
      doc: doc([bed("b1", "B1", { bedId: ID.a })]),
      register,
      occupiedBedIds: [],
    });
    if (!r.ok) throw new Error(r.refusal);
    expect(r.plan.archive).toEqual([{ bedId: ID.b, label: "B2" }]);
    expect(r.plan.bedCount).toBe(1);
    expect(r.plan.bedCountBefore).toBe(2);
    expect(planSummary(r.plan)).toMatchObject({ archived: 1, archivedLabels: ["B2"], bedCount: 1 });
  });

  it("records what changes for each kept bed, and nothing when nothing does", () => {
    const register = [
      reg(ID.a, "B1", { bedType: "standard", layoutX: 6, layoutY: 2, rotation: 0 }),
      reg(ID.b, "B2", {
        bedType: "standard",
        layoutX: 10,
        layoutY: 2,
        rotation: 0,
        services: ["o2"],
      }),
    ];
    const r = reconcile({
      doc: doc([
        bed("b1", "B1", { bedId: ID.a }),
        bed("b2", "B7", {
          bedId: ID.b,
          type: "icu",
          x: 20,
          services: ["o2", "suction"],
          status: "out",
          outReason: "Broken",
        }),
      ]),
      register,
      occupiedBedIds: [],
    });
    if (!r.ok) throw new Error(r.refusal);
    expect(r.plan.keep[0]!.changes).toEqual([]);
    expect(r.plan.keep[1]!.changes).toEqual([
      "number",
      "type",
      "place",
      "out of service",
      "services",
    ]);
    expect(r.plan.keep[1]).toMatchObject({ closedReason: "Broken", services: ["o2", "suction"] });
    expect(planSummary(r.plan)).toMatchObject({ changed: 1, unchanged: 1 });
  });

  it("puts each bed in the room its centre is in", () => {
    const d = doc([bed("b1", "P1", { x: 3, y: 3 }), bed("b2", "B1", { x: 30, y: 3 })], {
      rooms: [
        {
          key: "r1",
          kind: "private",
          name: "Private 1",
          x: 1,
          y: 1,
          w: 7,
          h: 9,
          door: "bottom",
          features: {},
        },
      ],
    });
    const r = reconcile({ doc: d, register: [], occupiedBedIds: [] });
    if (!r.ok) throw new Error(r.refusal);
    expect(r.plan.create.map((c) => c.roomKey)).toEqual(["r1", null]);
  });
});

describe("reconcile — refusals", () => {
  it("an occupied bed leaving the plan is refused, naming it", () => {
    const r = reconcile({
      doc: doc([bed("b1", "B1", { bedId: ID.a })]),
      register: [reg(ID.a, "B1"), reg(ID.b, "B2")],
      occupiedBedIds: [ID.b],
    });
    expect(r).toEqual({
      ok: false,
      refusal:
        "Bed B2 has a patient in it and would leave the plan. Move or release the patient first, then publish.",
    });
  });

  it("several occupied beds are listed together", () => {
    const r = reconcile({
      doc: doc([]),
      register: [reg(ID.a, "B1"), reg(ID.b, "B2"), reg(ID.c, "B3")],
      occupiedBedIds: [ID.a, ID.c],
    });
    expect(!r.ok && r.refusal).toMatch(/^Beds B1 and B3 have patients in them/);
  });

  it("an occupied bed going out of service is refused", () => {
    const r = reconcile({
      doc: doc([bed("b1", "B1", { bedId: ID.a, status: "out", outReason: "Broken" })]),
      register: [reg(ID.a, "B1")],
      occupiedBedIds: [ID.a],
    });
    expect(!r.ok && r.refusal).toMatch(/Bed B1 has a patient in it and can't go out of service/);
  });

  it("a bed pointing at an id outside this ward's register is refused", () => {
    const r = reconcile({
      doc: doc([bed("b1", "B1", { bedId: ID.c })]),
      register: [reg(ID.a, "B1")],
      occupiedBedIds: [],
    });
    expect(!r.ok && r.refusal).toMatch(/isn't in this ward's register/);
  });

  it("an occupied bed that stays on the plan is fine, moved or not", () => {
    const r = reconcile({
      doc: doc([bed("b1", "B1", { bedId: ID.a, x: 30 })]),
      register: [reg(ID.a, "B1", { layoutX: 6, layoutY: 2, rotation: 0 })],
      occupiedBedIds: [ID.a],
    });
    expect(r.ok).toBe(true);
  });
});

describe("start from the register, and back", () => {
  it("lays every register bed out, keeping ids, types, services and closures", () => {
    const d = layoutFromRegister([
      {
        id: ID.a,
        label: "Bed 1",
        bedType: "icu",
        closedReason: null,
        services: ["o2", "nonsense"],
      },
      {
        id: ID.b,
        label: "Bed 2",
        bedType: "weird-legacy",
        closedReason: "Broken frame",
        services: [],
      },
    ]);
    expect(
      d.beds.map((b) => [b.bedId, b.label, b.type, b.services, b.status, b.outReason]),
    ).toEqual([
      [ID.a, "Bed 1", "icu", ["o2"], "in", undefined],
      [ID.b, "Bed 2", "standard", [], "out", "Broken frame"],
    ]);
    expect(d.dividers.filter((l) => l.kind === "wall")).toHaveLength(4);
    // Publishing it straight back changes nothing but where the beds stand.
    const r = reconcile({
      doc: d,
      register: [
        reg(ID.a, "Bed 1", { bedType: "icu", services: ["o2"] }),
        reg(ID.b, "Bed 2", { closedReason: "Broken frame", closedAt: "2026-09-01T00:00:00Z" }),
      ],
      occupiedBedIds: [],
    });
    if (!r.ok) throw new Error(r.refusal);
    expect(r.plan.create).toEqual([]);
    expect(r.plan.archive).toEqual([]);
    expect(r.plan.keep.map((k) => k.changes)).toEqual([["place"], ["type", "place"]]);
  });

  it("the next draft picks up register edits made since: labels, closures, beds archived by hand", () => {
    const published = doc([
      bed("b1", "B1", { bedId: ID.a }),
      bed("b2", "B2", { bedId: ID.b, status: "out", outReason: "Broken" }),
      bed("b3", "B3", { bedId: ID.c }),
    ]);
    const next = syncWithRegister(published, [
      { id: ID.a, label: "B1a", closedReason: "Awaiting repair", archived: false },
      { id: ID.b, label: "B2", closedReason: null, archived: false },
      { id: ID.c, label: "B3", closedReason: null, archived: true },
    ]);
    expect(next.beds.map((b) => [b.label, b.status, b.outReason])).toEqual([
      ["B1a", "out", "Awaiting repair"],
      ["B2", "in", undefined],
    ]);
  });
});

describe("publishPayload — what the SQL function receives", () => {
  it("snake-cases the plan and carries the draft's revision and the warnings shown", () => {
    const r = reconcile({
      doc: doc([bed("b1", "B1", { bedId: ID.a, services: ["call"] }), bed("b2", "B2")]),
      register: [reg(ID.a, "B1"), reg(ID.b, "B9")],
      occupiedBedIds: [],
    });
    if (!r.ok) throw new Error(r.refusal);
    const p = publishPayload(r.plan, {
      hospitalId: "h",
      wardId: "w",
      draftId: "d",
      draftRevision: 4,
      actorId: "u",
      warnings: ["No resus trolley on the plan"],
    });
    expect(p).toMatchObject({
      hospital_id: "h",
      ward_id: "w",
      draft_id: "d",
      draft_revision: 4,
      actor: "u",
      warnings: ["No resus trolley on the plan"],
      archive: [ID.b],
      bed_count: 2,
    });
    expect(p.keep[0]).toEqual({
      bed_id: ID.a,
      restore: false,
      label: "B1",
      bed_type: "standard",
      x: 6,
      y: 2,
      rotation: 0,
      room_key: null,
      closed_reason: null,
      services: ["call"],
    });
    expect(p.create[0]).toMatchObject({ key: "b2", label: "B2" });
  });
});
