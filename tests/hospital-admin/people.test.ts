import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  askedText,
  bucketOf,
  directoryActs,
  peopleHref,
  peopleTab,
  sortAdmins,
  staleTag,
} from "@/app/hospital-admin/staff/_lib/people";
import { PEOPLE, PEOPLE_COPY_STATUS } from "@/content/hospital-admin/people";

/**
 * People (ADR 0516 phase 2): /hospital-admin/staff rebuilt in the desk look with To review, Invitations, Directory
 * and Admins. The helpers are pure; the rules about colour, pop-ups and writes are checked in the source, since
 * the writes go to Edge Functions the test lane does not run.
 */
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const DIR = "app/hospital-admin/staff/_components";
const VIEW_FILES = readdirSync(resolve(process.cwd(), DIR)).filter((f) => f.endsWith(".tsx"));
const views = VIEW_FILES.map((f) => [f, stripComments(read(`${DIR}/${f}`))] as const);

describe("the tab and the open person live in the URL", () => {
  it("reads ?tab=, with To review as the default and the old ?tab=pending still opening it", () => {
    expect(peopleTab(undefined)).toBe("review");
    expect(peopleTab("pending")).toBe("review");
    expect(peopleTab("invites")).toBe("invites");
    expect(peopleTab("directory")).toBe("directory");
    expect(peopleTab("admins")).toBe("admins");
    expect(peopleTab("nonsense")).toBe("review");
  });

  it("writes the shortest URL for a tab and an open person", () => {
    expect(peopleHref("review")).toBe("/hospital-admin/staff");
    expect(peopleHref("admins")).toBe("/hospital-admin/staff?tab=admins");
    expect(peopleHref("directory", "abc")).toBe("/hospital-admin/staff?tab=directory&aff=abc");
    expect(peopleHref("review", "abc")).toBe("/hospital-admin/staff?aff=abc");
  });

  it("/hospital-admin/admins answers 308 to the Admins tab", () => {
    const src = stripComments(read("app/hospital-admin/admins/page.tsx"));
    expect(src).toContain('permanentRedirect("/hospital-admin/staff?tab=admins")');
    expect(src).not.toContain("PlaceholderSurface");
  });
});

describe("waiting is said in words, with a neutral tag, never a colour", () => {
  it("says how long ago they asked", () => {
    expect(askedText(0)).toBe("Asked today");
    expect(askedText(1)).toBe("Asked yesterday");
    expect(askedText(5)).toBe("Asked 5 days ago");
  });

  it("adds a 'Waiting n days' tag from a week, and none before", () => {
    expect(staleTag(6)).toBeNull();
    expect(staleTag(7)).toBe("Waiting 7 days");
    expect(staleTag(21)).toBe("Waiting 21 days");
  });

  it("uses no red, amber or green and no caution colours in the view", () => {
    for (const [f, src] of views) {
      expect(src, f).not.toMatch(/\b(red|amber|emerald|green|rose)-\d{2,3}\b/);
      expect(src, f).not.toMatch(/tone=|cautbg|cautfg|"warn"|su-awb|su-wtag/);
    }
    const css = stripComments(read(`${DIR}/people-view.module.css`));
    expect(css).not.toMatch(/--caut|\b(red|amber|green)\b/);
  });

  it("marks workflow states with the desk's square tag (su-st)", () => {
    const all = views.map(([, s]) => s).join("\n");
    expect(all).toContain('k("su-st", "setup")');
    expect(all).not.toContain("su-ctag");
  });
});

describe("pop-ups are centred dialogs or the desk's panel, never a sheet", () => {
  it("imports no Sheet, drawer or side panel", () => {
    for (const [f, src] of views) {
      expect(src, f).not.toMatch(/components\/ui\/sheet|Drawer|SheetContent/);
    }
  });

  it("asks in a DeskDialog for the invite and the revoke", () => {
    const inv = views.find(([f]) => f === "invitations.tsx")?.[1] ?? "";
    expect(inv.match(/<DeskDialog/g)?.length).toBe(2);
  });
});

describe("every write is the old Server Action, unchanged", () => {
  const all = views.map(([, s]) => s).join("\n");
  const actions = stripComments(read("app/hospital-admin/staff/actions.ts"));

  it.each([
    "approveStaffAffiliationAction",
    "rejectStaffAffiliationAction",
    "requestStaffInfoAction",
    "setStaffStatusAction",
    "resetStaffMfaAction",
    "assignStaffRoleAction",
    "inviteStaffAction",
    "revokeStaffInvitationAction",
    "getEvidenceSignedUrlAction",
  ])("%s is still called from the page", (name) => {
    expect(all).toContain(name);
  });

  it("the actions still forward to the same Edge Functions and check the scope", () => {
    for (const fn of [
      "approve-staff-affiliation",
      "reject-staff-affiliation",
      "ha-request-staff-info",
      "ha-set-staff-status",
      "ha-reset-staff-mfa",
      "ha-assign-staff-role",
      "ha-invite-staff",
      "ha-revoke-staff-invitation",
    ])
      expect(actions).toContain(`"${fn}"`);
    expect(actions.match(/await guardScope\(/g)?.length).toBe(6);
    expect(actions).toContain("assertScopeOwnsHospital(scope, inv.hospital_id as string)");
  });

  it("the view holds every decision behind a reason of 8 characters or more", () => {
    for (const f of ["review.tsx", "directory.tsx", "invitations.tsx"]) {
      const src = views.find(([n]) => n === f)?.[1] ?? "";
      expect(src, f).toMatch(/\.trim\(\)\.length (<|>=) 8/);
    }
  });

  it("the page does not write: no db, no Supabase client in the client view", () => {
    for (const [f, src] of views) {
      expect(src, f).not.toMatch(/from "@\/db"|lib\/supabase/);
    }
  });
});

describe("the directory and the admins list", () => {
  it("offers the same changes by state as the old detail sheet", () => {
    expect(directoryActs("active")).toEqual(["assign_role", "reset_mfa", "suspend", "deactivate"]);
    expect(directoryActs("approved")).toEqual(directoryActs("active"));
    expect(directoryActs("suspended")).toEqual(["assign_role", "reset_mfa", "reactivate"]);
    expect(directoryActs("deactivated")).toEqual(["reactivate"]);
    expect(bucketOf("approved")).toBe("active");
  });

  it("lists primary, then backup, then admins with no designation on record", () => {
    const rows = sortAdmins([
      { designation: null, fullName: "Ann" },
      { designation: "backup", fullName: "Ben" },
      { designation: "primary", fullName: "Cid" },
      { designation: "backup", fullName: "Abe" },
    ] as const);
    expect(rows.map((r) => r.fullName)).toEqual(["Cid", "Abe", "Ben", "Ann"]);
  });

  it("reads admins from user_roles and the current roster row, and offers no swap", () => {
    const data = stripComments(read("app/hospital-admin/staff/_lib/data.ts"));
    expect(data).toMatch(/^import "server-only";/);
    expect(data).toContain('eq(userRoles.role, "hospital_admin")');
    expect(data).toContain("isNull(hospitalAdminRoster.succeededAt)");
    const all = views.map(([, s]) => s).join("\n");
    expect(all).not.toMatch(/swap/i);
  });

  it("links to Team in Clinics & schedule instead of rebuilding it", () => {
    const view = views.find(([f]) => f === "people-view.tsx")?.[1] ?? "";
    expect(view).toContain('href="/hospital-admin/clinics?view=people"');
    expect(PEOPLE.team).toBe("Team in Clinics & schedule");
  });
});

describe("the wording", () => {
  it("is a draft until the CSO signs", () => {
    expect(PEOPLE_COPY_STATUS).toEqual({ status: "draft", signedBy: null, signedOn: null });
  });

  it("is all in content/hospital-admin/people.ts: the view has no English of its own in JSX text", () => {
    for (const [f, src] of views) {
      // A JSX text node that starts with a capital letter and a lower-case word is a hard-coded string.
      expect(src, f).not.toMatch(/>\s*[A-Z][a-z]+ [a-z]+[^<{]*</);
    }
  });
});
