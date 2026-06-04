import { describe, expect, it } from "vitest";

import { toEncounterScope } from "@/lib/encounter/workspace-scope";

/**
 * Pure adapter: a doctor/nurse workspace scope → the engine's EncounterScope.
 * Doctor + nurse are definitionally clinical (their cadres are is_clinical), so
 * the adapter stamps isClinical=true; departmentId drives the department_recent
 * access basis.
 */
describe("toEncounterScope", () => {
  it("maps the clinical workspace scope onto an EncounterScope (isClinical=true)", () => {
    const s = toEncounterScope({
      userId: "u1",
      hospitalId: "h1",
      departmentId: "d1",
      cadreCode: "CONSULTANT",
    });
    expect(s).toEqual({
      userId: "u1",
      hospitalId: "h1",
      departmentId: "d1",
      cadreCode: "CONSULTANT",
      isClinical: true,
    });
  });

  it("passes a null department through (department_recent simply won't match)", () => {
    const s = toEncounterScope({
      userId: "u2",
      hospitalId: "h2",
      departmentId: null,
      cadreCode: "NURSE",
    });
    expect(s.departmentId).toBeNull();
    expect(s.isClinical).toBe(true);
  });
});
