import { describe, expect, it } from "vitest";

import MAP from "@/data/lab/permission-map.v1.json";
import V2 from "@/data/lab/permission-map.v2.json";
import {
  can,
  LAB_MAP_CADRES,
  LAB_PERMISSIONS,
  labAccess,
  mapProblems,
  PERMISSION_MAP_VERSION,
} from "@/lib/lab/access";

/** Lab Phase 0 — the access engine (LA-1..LA-6; gate-a-proposal §2). */
const noHead = { laboratory: false, sectionIds: [] };
const perms = (cadreCode: string | null, headOf = noHead) =>
  [...labAccess({ cadreCode, headOf }).permissions].sort();

describe("lab access", () => {
  it("LA-1: fifteen permissions, by name (Phase 3 §4 adds five, Phase 4 §4 four)", () => {
    expect(LAB_PERMISSIONS).toEqual([
      "lab.view",
      "lab.collect",
      "lab.receive",
      "lab.result.enter",
      "lab.result.release",
      "lab.manage",
      "lab.qc.override",
      "lab.stock.manage",
      "lab.eqa.manage",
      "lab.hmis.check",
      "poct.assess",
      "lab.refer",
      "lab.refer.result",
      "lab.match.resolve",
      "lab.exchange.manage",
    ]);
  });

  it("LA-2: the shipped map is signed, versioned and well formed", () => {
    expect(mapProblems()).toEqual([]);
    expect(PERMISSION_MAP_VERSION).toBe("1.0.0");
    expect(MAP.signedBy).toBeTruthy();
    expect(LAB_MAP_CADRES).toEqual(["LAB_TECH", "LAB_TECHNOLOGIST"]);
  });

  it("LA-2, D-LAB0-02: technicians and technologists hold everything but manage", () => {
    const bench = [
      "lab.collect",
      "lab.receive",
      "lab.result.enter",
      "lab.result.release",
      "lab.view",
    ];
    expect(perms("LAB_TECH")).toEqual(bench);
    expect(perms("LAB_TECHNOLOGIST")).toEqual(bench);
  });

  it("LA-3: lab.view is what the workspace checks", () => {
    expect(can(labAccess({ cadreCode: "LAB_TECH", headOf: noHead }), "lab.view")).toBe(true);
    expect(can(labAccess({ cadreCode: "NURSE", headOf: noHead }), "lab.view")).toBe(false);
  });

  it("LA-4, LA-6: doctors, nurses, reception and admins hold no lab permission", () => {
    for (const cadre of ["MEDICAL_OFFICER", "CONSULTANT", "NURSE", "MIDWIFE", "RECEPTION", null]) {
      expect(perms(cadre)).toEqual([]);
    }
  });

  it("LA-5: lab.manage comes from headship only — the whole lab, or a section", () => {
    const head = labAccess({
      cadreCode: "LAB_TECHNOLOGIST",
      headOf: { laboratory: true, sectionIds: [] },
    });
    expect(can(head, "lab.manage")).toBe(true);
    expect(head.manages).toBe("lab");
    const inCharge = labAccess({
      cadreCode: "LAB_TECH",
      headOf: { laboratory: false, sectionIds: ["s1"] },
    });
    expect(inCharge.manages).toEqual(["s1"]);
    expect(can(inCharge, "lab.manage")).toBe(true);
    expect(can(labAccess({ cadreCode: "LAB_TECH", headOf: noHead }), "lab.manage")).toBe(false);
  });

  it("Phase 3 §4: headship (substantive or acting) carries override, EQA and HMIS check with lab.manage", () => {
    const lead = labAccess({ cadreCode: null, headOf: { laboratory: true, sectionIds: [] } });
    for (const p of ["lab.manage", "lab.qc.override", "lab.eqa.manage", "lab.hmis.check"] as const)
      expect(can(lead, p), p).toBe(true);
    const bench = labAccess({ cadreCode: "LAB_TECHNOLOGIST", headOf: noHead });
    for (const p of ["lab.qc.override", "lab.eqa.manage", "lab.hmis.check"] as const)
      expect(can(bench, p), p).toBe(false);
  });

  it("Phase 3 §4: lab.stock.manage and poct.assess wait for the CSO to sign map 2.0.0", () => {
    expect(V2.status).toBe("draft");
    expect(mapProblems({ ...V2, status: "signed" })).toEqual([]);
    const signed = labAccess(
      { cadreCode: "LAB_TECH", headOf: noHead },
      { ...V2, status: "signed" },
    );
    expect(can(signed, "lab.stock.manage") && can(signed, "poct.assess")).toBe(true);
    expect(can(labAccess({ cadreCode: "LAB_TECH", headOf: noHead }), "lab.stock.manage")).toBe(
      false,
    );
  });

  it("LA-5: a cadre can never carry lab.manage, even if a map said so", () => {
    const bad = {
      version: "x",
      status: "signed",
      permissions: [...LAB_PERMISSIONS],
      cadres: { LAB_TECH: ["lab.view", "lab.manage"] },
    };
    expect(mapProblems(bad)).toContain("LAB_TECH: lab.manage cannot come from a cadre");
    expect([...labAccess({ cadreCode: "LAB_TECH", headOf: noHead }, bad).permissions]).toEqual([
      "lab.view",
    ]);
  });

  it("an unsigned map grants nothing (Law 3)", () => {
    const draft = { ...MAP, status: "draft" };
    expect(mapProblems(draft)).toContain("status is draft, not signed");
    expect([...labAccess({ cadreCode: "LAB_TECH", headOf: noHead }, draft).permissions]).toEqual(
      [],
    );
  });
});
