import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The settings and governance surfaces (ADR 0098 rulings 2, 5 and 8; PRD
 * Phase 5 "Hospital admin settings"). Source-level like the other gate
 * suites: who gates the page, what the form reveals, which function each
 * action calls, and that none of it draws red.
 */
const ROOT = process.cwd();
const read = (rel: string) =>
  readFileSync(resolve(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const FILES = {
  profilePage: "app/hospital-admin/profile/page.tsx",
  profileForm: "app/hospital-admin/profile/_components/emergency-settings-form.tsx",
  profileActions: "app/hospital-admin/profile/actions.ts",
  adminPage: "app/admin/emergency/page.tsx",
  adminForms: "app/admin/emergency/_components/governance-forms.tsx",
  adminActions: "app/admin/emergency/actions.ts",
  adminQueries: "lib/emergency/admin-queries.ts",
} as const;
const SRC = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)])) as Record<
  keyof typeof FILES,
  string
>;

// The same fill regex tests/design/red-reserved.test.ts holds the desk to.
const RED = new RegExp(
  [
    String.raw`(?:bg|ring|border(?:-[lrtbxyse])?|from|to|via|outline|shadow|fill|stroke|text|decoration)-status-critical`,
    String.raw`bg-destructive(?![/\w-])`,
    String.raw`border(?:-[lrtbxyse])?-destructive(?![/\w-])`,
    String.raw`(?:ring|outline|stroke|fill|shadow|from|to|via|decoration)-destructive`,
    String.raw`destructive-foreground`,
    String.raw`text-destructive`,
    String.raw`variant=["'](?:emergency|alert|destructive)["']`,
    String.raw`["']critical["']`,
    String.raw`\b(?:bg|text|border(?:-[lrtbxyse])?|ring|fill|stroke|from|to|via|outline|shadow|decoration)-(?:red|rose)-\d`,
    String.raw`(?:bg|border|text)-alert-(?:bg|border|fg)`,
    String.raw`#(?:fef2f2|fee2e2|fecaca|fca5a5|f87171|ef4444|dc2626|b91c1c|991b1b|7f1d1d)\b`,
  ].join("|"),
  "i",
);

describe("/hospital-admin/profile — the emergency settings form", () => {
  it("the page resolves the scope helper and pins hospitalId on its read", () => {
    expect(SRC.profilePage).toContain("requireHospitalAdminScope()");
    expect(SRC.profilePage).toContain("fetchEmergencySettings(scope.hospitalId)");
    expect(SRC.profilePage).not.toContain("PlaceholderSurface");
  });

  it("the page keeps a Profile panel beside the Emergency panel", () => {
    expect(SRC.profilePage).toContain('title="Profile"');
    expect(SRC.profilePage).toContain('title="Emergency"');
  });

  // ADR 0158 (CAP-5): the routing values moved to Departments & services, where a second admin
  // verifies them. The board-owner rule now lives in the hub's value check (tests/hospital-services).
  it("the routing values are shown read-only and change in Departments & services", () => {
    const form = SRC.profileForm;
    for (const name of [
      "emergency_capability",
      "pre_alert_enabled",
      "board_owner_note",
      "emergency_entrance_directions",
      "emergency_sms_number",
      "ambulance_number",
    ]) {
      expect(form, name).not.toContain(`name="${name}"`);
    }
    expect(form).toContain('href="/hospital-admin/departments/emergency"');
    expect(form).toMatch(/second admin to verify/);
  });

  it("the coordinates stay editable here, with the honest 'nearest' hint and an audit note", () => {
    for (const name of ["latitude", "longitude", "reason"]) {
      expect(SRC.profileForm, name).toContain(`name="${name}"`);
    }
    expect(SRC.profileForm).toMatch(/orders hospitals by\s+name/);
  });

  it("the action resolves the scope, never trusts a hospital_id from the form, and calls the function", () => {
    expect(SRC.profileActions).toContain("requireHospitalAdminScope()");
    expect(SRC.profileActions).not.toContain('formData.get("hospital_id")');
    expect(SRC.profileActions).toMatch(
      /callEdge\(\s*"ha-set-hospital-emergency-settings",\s*\{ hospital_id: scope\.hospitalId/,
    );
    expect(SRC.profileActions).toContain('revalidatePath("/hospital-admin/profile")');
    expect(SRC.profileActions).toContain("min(8");
  });
});

describe("/admin/emergency — superadmin governance", () => {
  it("the page is superadmin-gated the way /admin/catalog is", () => {
    expect(SRC.adminPage).toMatch(/r\.role === "superadmin"/);
    expect(SRC.adminPage).toContain("Superadmin only.");
    expect(SRC.adminPage).toContain("listEmergencyContacts()");
    expect(SRC.adminPage).toContain("listCatalogVersions()");
  });

  it("the queries are server-only reference-data reads with no writes", () => {
    expect(SRC.adminQueries).toContain('import "server-only"');
    expect(SRC.adminQueries).not.toMatch(/db\s*\.\s*(update|insert|delete)\(/);
    expect(SRC.adminQueries).toMatch(/export async function listEmergencyContacts/);
    expect(SRC.adminQueries).toMatch(/export async function listCatalogVersions/);
  });

  it("the actions call the named functions and say the four-eyes half-state in words", () => {
    expect(SRC.adminActions).toMatch(/callEdge<[^>]*>\(\s*"sa-verify-emergency-contact"/);
    expect(SRC.adminActions).toMatch(/callEdge\(\s*"sa-sign-catalog-version"/);
    expect(SRC.adminActions).toContain("awaiting_second_approval");
    expect(SRC.adminForms).toContain(
      "Awaiting a second superadmin — no executor exists yet; see the runbook",
    );
  });

  it("the sign form mentions the checksum, and a mismatch is rendered as the seed-and-redeploy sentence", () => {
    expect(SRC.adminForms).toMatch(/checksum/i);
    expect(SRC.adminActions).toContain(
      "The registered checksum differs from the deployed bundle — run npm run db:seed-symptom-catalog and redeploy",
    );
    expect(SRC.adminPage).toContain("Gate CS");
    expect(SRC.adminPage).toContain("docs/runbooks/emergency-contacts-verification.md");
  });

  it("every status Pill carries a word", () => {
    for (const m of SRC.adminPage.matchAll(/<Pill\b[^>]*>([\s\S]*?)<\/Pill>/g)) {
      expect((m[1] ?? "").trim()).not.toBe("");
    }
    expect(SRC.adminPage).toContain('word: "Verified"');
    expect(SRC.adminPage).toContain('word: "Unverified"');
    expect(SRC.adminPage).toContain('word: "To source"');
  });
});

describe("no red on the settings or governance surfaces", () => {
  it.each(Object.entries(FILES))("%s", (_key, rel) => {
    const m = RED.exec(read(rel));
    expect(m, `${rel}: ${m?.[0]}`).toBeNull();
  });
});
