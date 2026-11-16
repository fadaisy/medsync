import type {
  DirectoryAffiliationRow,
  HospitalAdminRow,
  InvitationRow,
  PendingAffiliationRow,
} from "@/app/hospital-admin/staff/_lib/data";
import type { PeopleTab } from "@/app/hospital-admin/staff/_lib/people";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * People (ADR 0516 phase 2) renders every tab, and a person open beside the list, from rows shaped like the
 * page's queries. Placeholder people only; the actions are stubbed because the render never calls them.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/hospital-admin/staff/actions", () => ({
  approveStaffAffiliationAction: vi.fn(),
  rejectStaffAffiliationAction: vi.fn(),
  requestStaffInfoAction: vi.fn(),
  setStaffStatusAction: vi.fn(),
  resetStaffMfaAction: vi.fn(),
  assignStaffRoleAction: vi.fn(),
  inviteStaffAction: vi.fn(),
  revokeStaffInvitationAction: vi.fn(),
}));
vi.mock("@/app/admin/actions", () => ({ getEvidenceSignedUrlAction: vi.fn() }));

const { PeopleView } = await import("@/app/hospital-admin/staff/_components/people-view");

const pending: PendingAffiliationRow[] = [
  {
    id: "p1",
    fullName: "Person One",
    email: "one@example.org",
    isClinical: true,
    cadreName: "Medical officer",
    cadreGradeName: "U4",
    roleName: "Medical officer",
    departmentName: "Medicine",
    specialtyName: null,
    employmentType: "full_time",
    reviewNote: "Please add your licence",
    createdAtIso: "2026-11-01T08:00:00.000Z",
    daysSinceSubmission: 9,
    councilName: "Council",
    councilCode: "UMDPC",
    registrationNumber: "REG-0001",
    registrationExpiry: null,
    licenceDocumentPath: null,
    ninOnFile: false,
    staffNumber: null,
    appointmentLetterPath: null,
    authorisingOfficerName: null,
    authorisingOfficerRole: null,
  },
  {
    id: "p2",
    fullName: "Person Two",
    email: "two@example.org",
    isClinical: false,
    cadreName: "Records",
    cadreGradeName: null,
    roleName: "Records assistant",
    departmentName: "Records",
    specialtyName: null,
    employmentType: "contract",
    reviewNote: null,
    createdAtIso: "2026-11-15T08:00:00.000Z",
    daysSinceSubmission: 1,
    councilName: null,
    councilCode: null,
    registrationNumber: null,
    registrationExpiry: null,
    licenceDocumentPath: null,
    ninOnFile: true,
    staffNumber: "S-1",
    appointmentLetterPath: "a/letter.pdf",
    authorisingOfficerName: "Officer",
    authorisingOfficerRole: "HR",
  },
];

const invitations: InvitationRow[] = [
  {
    id: "i1",
    email: "three@example.org",
    name: null,
    source: "individual",
    invitedAtIso: "2026-11-12T08:00:00.000Z",
    expiresAtIso: "2026-11-26T08:00:00.000Z",
    acceptedAtIso: null,
    revokedAtIso: null,
    revocationReason: null,
    status: "pending",
  },
];

const directory: DirectoryAffiliationRow[] = [
  {
    id: "d1",
    userId: "u1",
    fullName: "Person Four",
    email: "four@example.org",
    cadreName: "Nurse",
    roleId: "r1",
    roleName: "Nurse",
    departmentId: "dep1",
    departmentName: "Medicine",
    employmentType: "full_time",
    state: "suspended",
    councilName: null,
    registrationNumber: null,
  },
];

const admins: HospitalAdminRow[] = [
  {
    userId: "me",
    fullName: "Person Five",
    email: "five@example.org",
    designation: "primary",
    sinceIso: "2026-01-05T08:00:00.000Z",
  },
  {
    userId: "u6",
    fullName: "Person Six",
    email: "six@example.org",
    designation: null,
    sinceIso: "2026-02-05T08:00:00.000Z",
  },
];

const render = (tab: PeopleTab, aff: string | null = null) =>
  renderToStaticMarkup(
    createElement(PeopleView, {
      tab,
      aff,
      pending,
      invitations,
      directory,
      departments: [{ id: "dep1", name: "Medicine" }],
      roles: [{ id: "r1", name: "Nurse", cadreName: "Nurse" }],
      admins,
      me: "me",
    }),
  );

describe("People renders every tab from real-shaped rows", () => {
  it("To review: ages in words, a neutral Waiting tag, the person open beside the list", () => {
    const html = render("review", "p1");
    expect(html).toContain("2 asking to join");
    expect(html).toContain("Asked 9 days ago");
    expect(html).toContain("Waiting 9 days");
    expect(html).toContain("Asked yesterday");
    expect(html).toContain("Waiting for their reply");
    expect(html).toContain("What you asked: “Please add your licence”");
    // No licence: approval waits (DOC-1); the other decisions stay open.
    expect(html).toContain("Waiting for the licence");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Approve<\/button>/);
    expect(html).toContain("Check the UMDPC register");
    expect(html).toContain('href="/hospital-admin/clinics?view=people"');
  });

  it("To review: a non-clinical person shows the attestation and their letter", () => {
    const html = render("review", "p2");
    expect(html).toContain("your approval is the employer");
    expect(html).toContain("Open the document");
    expect(html).toContain("On file (encrypted)");
  });

  it("Invitations: the status in words and a Revoke for an open one", () => {
    const html = render("invites");
    expect(html).toContain("three@example.org");
    expect(html).toContain("link works until");
    expect(html).toContain(">Sent<");
    expect(html).toContain(">Revoke<");
  });

  it("Directory: a suspended person can be reopened, not suspended again", () => {
    const html = render("directory", "d1");
    expect(html).toContain("Suspended");
    expect(html).toContain(">Reopen<");
    expect(html).toContain(">Change role<");
    expect(html).not.toContain(">Close account<");
  });

  it("Admins: primary first, the missing designation said plainly, no swap", () => {
    const html = render("admins");
    expect(html.indexOf("Person Five")).toBeLessThan(html.indexOf("Person Six"));
    expect(html).toContain("Primary admin");
    expect(html).toContain("primary or backup not recorded");
    expect(html).toContain(">You<");
    expect(html).not.toMatch(/swap/i);
  });
});
