import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { rulesSummary, UNSET_RULES } from "@/app/hospital-admin/departments/_lib/model";
import { fmtPhone, parseCoords, show } from "@/app/hospital-admin/departments/emergency/_lib/model";
import { DEPARTMENTS_COPY_STATUS } from "@/content/hospital-admin/departments";
import { EMERGENCY_COPY_STATUS } from "@/content/hospital-admin/emergency";
import { capabilityKey, checkCapabilityValue } from "@/supabase/functions/_shared/services-hub";

/*
 * ADR 0516 phase 2: Departments and Emergency and support in the Tether desk. The rules held at source level (the
 * pages run only against Supabase), plus the pure helpers. Comments are stripped so a file may explain a rule.
 */
const read = (rel: string) =>
  readFileSync(resolve(process.cwd(), rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const E = "app/hospital-admin/departments/emergency";
const D = "app/hospital-admin/departments";

describe("Emergency and support keeps the two-admin rule (CAP-5)", () => {
  it("decides 'is this mine?' on the server; the client never receives a user id", () => {
    const page = read(`${E}/page.tsx`);
    expect(page).toMatch(/mine: c\.pending\.byUserId === scope\.userId/);
    expect(page).not.toMatch(/byUserId:/);
  });

  it("offers Verify only on someone else's change", () => {
    const desk = read(`${E}/_components/emergency-desk.tsx`);
    expect(desk).toMatch(/c\.pending!\.mine \? \([\s\S]*?EMERG\.pending\.yours[\s\S]*?\) : \(/);
  });

  it("every write goes through ha-services-hub's set, verify and reject ops, scoped on the server", () => {
    const actions = read(`${E}/_lib/actions.ts`);
    for (const op of ["set_capability", "verify_capability", "reject_capability"])
      expect(actions).toContain(`op: "${op}"`);
    expect(actions).toContain('from "../../actions"');
    expect(read(`${D}/actions.ts`)).toMatch(/hospital_id: scope\.hospitalId/);
  });

  it("the map point goes through the profile's one-admin, audited path and sends no routing value", () => {
    const actions = read(`${E}/_lib/actions.ts`);
    expect(actions).toMatch(
      /callEdge\(\s*"ha-set-hospital-emergency-settings",\s*\{ hospital_id: scope\.hospitalId, \.\.\.p\.data \}/,
    );
    for (const k of [
      "emergency_capability",
      "pre_alert_enabled",
      "board_owner_note",
      "emergency_entrance_directions",
      "emergency_sms_number",
      "ambulance_number",
    ])
      expect(actions).not.toContain(k);
  });

  it("the change dialog checks a value with the Edge Function's own check", () => {
    expect(read(`${E}/_components/change-dialog.tsx`)).toMatch(
      /checkCapabilityValue\(key\.key, raw\)/,
    );
  });

  it("the Help preview reads the public page's own query, verified numbers only", () => {
    expect(read(`${E}/_lib/load.ts`)).toMatch(/fetchEmergencySheet\(\{[^}]*includeDrafts: false/);
  });
});

describe("Emergency and support's helpers", () => {
  it("formats the stored E.164 and toll-free numbers for reading", () => {
    expect(fmtPhone("+256772123456")).toBe("+256 772 123 456");
    expect(fmtPhone("0800123456")).toBe("0800 123 456");
  });

  it("the phone control accepts 07XX XXX XXX and +256 forms, and refuses the rest", () => {
    expect(checkCapabilityValue("ambulance_line", "0772 123 456")).toEqual({
      ok: true,
      value: "+256772123456",
    });
    expect(checkCapabilityValue("emergency_sms_number", "+256 772 123 456").ok).toBe(true);
    expect(checkCapabilityValue("emergency_sms_number", "12345").ok).toBe(false);
  });

  it("directions stop at the stored limit", () => {
    const k = capabilityKey("arrival_directions")!;
    expect(k.value).toEqual({ type: "text", max: 140 });
    expect(checkCapabilityValue("arrival_directions", "x".repeat(141)).ok).toBe(false);
  });

  it("reads values as words", () => {
    expect(show(capabilityKey("emergency_capability")!, "24h")).toBe("Open 24 hours");
    expect(show(capabilityKey("mortuary")!, false)).toBe("No");
    expect(show(capabilityKey("ambulance_line")!, null)).toBe("Not set");
  });

  it("takes coordinates inside Uganda only (the table's CHECK)", () => {
    expect(parseCoords("0.3476, 32.5825")).toEqual({ lat: 0.3476, lng: 32.5825 });
    expect(parseCoords("51.5072, -0.1276")).toBeNull();
    expect(parseCoords("0.34, 32.58")).toBeNull();
  });
});

describe("Departments in the desk", () => {
  it("the folded-in tabs answer with a permanent redirect to their new place", () => {
    expect(read(`${D}/booking-policy/page.tsx`)).toMatch(
      /permanentRedirect\("\/hospital-admin\/departments"\)/,
    );
    expect(read(`${D}/availability/page.tsx`)).toMatch(/view=unavailable/);
    expect(read(`${D}/hours/page.tsx`)).toMatch(
      /permanentRedirect\("\/hospital-admin\/departments\?view=hours"\)/,
    );
  });

  it("booking rules go through ha-update-department-policy with the scope from the server", () => {
    const actions = read(`${D}/_lib/actions.ts`);
    expect(actions).toMatch(/callEdge\(\s*"ha-update-department-policy"/);
    expect(actions).toContain("hospital_id: scope.hospitalId");
  });

  it("summarises booking rules in one line; no rules reads as unrestricted", () => {
    expect(rulesSummary(UNSET_RULES)).toBe("Mon–Fri · 08:00–17:00 · 15 min");
    expect(rulesSummary(null)).toMatch(/any day, any hour/);
  });

  it("the new wording is a draft until the CSO signs", () => {
    expect(DEPARTMENTS_COPY_STATUS.status).toBe("draft");
    expect(EMERGENCY_COPY_STATUS.status).toBe("draft");
  });
});
