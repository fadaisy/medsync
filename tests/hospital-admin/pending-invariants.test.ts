import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Pending list is a signal about the clinic, never a patient record.
 * Source-level, like reports-invariants: the rules are about what the lib
 * may SELECT and what the dialog may do with a row, and the dev DB carries
 * no pending rows to assert against.
 */
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const LIB = "lib/hospital-admin/pending.ts";
// ADR 0520: Pending moved from Reports to Requests, as rows built on the server and a desk view.
const ROWS = "app/hospital-admin/requests/_lib/pending-rows.ts";
const VIEW = "app/hospital-admin/requests/_components/requests-view.tsx";
const PAGE = "app/hospital-admin/requests/page.tsx";
const REPORTS_PAGE = "app/hospital-admin/reports/page.tsx";
const COPY = "content/hospital-admin/admin-nav.ts";

describe("the pending lib selects a patient's code and nothing else about them", () => {
  const src = stripComments(read(LIB));
  const select = src.slice(src.indexOf(".select({"), src.indexOf(".from(appointments)"));

  it("is server-only and scoped to one hospital's pending_approval rows", () => {
    expect(src).toMatch(/^import "server-only";/);
    expect(src).toContain("eq(appointments.hospitalId, hospitalId)");
    expect(src).toContain('eq(appointments.status, "pending_approval")');
    expect(src).toContain("asc(appointments.createdAt)");
  });

  it("names the clinician, and the patient only by code", () => {
    expect(select).toContain("clinicianName: users.fullName");
    expect(select).toContain("patientCode: patientProfiles.patientCode");
    // The only `users.` column is the clinician's; nothing else names a person.
    expect(select.match(/users\.\w+/g)).toEqual(["users.fullName"]);
    for (const needle of [
      "firstName",
      "surname",
      "lastName",
      "phone",
      "Phone",
      "reasonNote",
      "bookingCode",
      "patientUserId",
      "provisionalPatientId",
      "declaredName",
      "nok",
      "idNumber",
      "dateOfBirth",
    ]) {
      expect(select, `select list mentions ${needle}`).not.toContain(needle);
    }
  });

  it("never reaches the provisional patient's row, which is all PHI", () => {
    expect(src).not.toContain("provisionalPatients");
    expect(src).not.toMatch(/decrypt/i);
  });
});

describe("Requests shows the rows as they came, and marks only the clinic's delay", () => {
  const rows = stripComments(read(ROWS));
  const view = stripComments(read(VIEW));

  it("does not sort: no sort state and no .sort() in the rows or the view", () => {
    for (const src of [rows, view]) {
      expect(src).not.toContain("sortable");
      expect(src).not.toContain("onSortChange");
      expect(src).not.toMatch(/\.sort\(/);
    }
  });

  it("measures age from createdAt (the clinic's clock) and names the patient by code only", () => {
    expect(rows).toMatch(/now - r\.createdAt\.getTime\(\)/);
    expect(rows).toContain("r.patientCode ?? C.provisional");
    expect(rows).not.toMatch(/patientCode\s*[=!]==/);
    expect(rows).toMatch(/^import "server-only";/);
  });

  it("marks Urgent and a stale wait with neutral tags, never red (ADR 0520, design rules)", () => {
    expect(view).toContain('k("su-st", "setup")');
    expect(view).not.toMatch(/critical|"red"|"r"\)/);
  });

  it("says what waits, who acts, and when nothing does; the clinician list never posts", () => {
    const copy = read(COPY);
    expect(copy).toContain("Nothing is waiting for a clinician.");
    expect(copy).toContain("Clinicians confirm or decline these from their own schedule");
    const clinician = view.slice(view.indexOf('tab === "clinician"'), view.indexOf("P.note"));
    expect(clinician).not.toMatch(/Action\(|<form|action=/);
    expect(clinician).toContain('href="/hospital-admin/clinics?view=week"');
  });
});

describe("the Requests page reads inside the scope; Reports no longer lists Pending", () => {
  const page = stripComments(read(PAGE));

  it("fetches the rows after the scope check, for the scope's hospital", () => {
    const scopeAt = page.indexOf("await requireHospitalAdminScope()");
    const fetchAt = page.indexOf("loadPendingRows(scope.hospitalId)");
    expect(scopeAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(scopeAt);
    expect(read(ROWS)).toContain("fetchPendingRequests(hospitalId)");
  });

  it("Reports keeps its numbers and drops the queue", () => {
    const reports = stripComments(read(REPORTS_PAGE));
    expect(reports).not.toContain("fetchPendingRequests");
    expect(reports).not.toContain("PendingDialog");
  });
});
