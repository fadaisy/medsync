import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Gate D web surfaces (ADR 0089) — the properties a reviewer would grep for:
 * no auto-merge affordance, basis as words, the minor sentence, logistics
 * only for a booking agent, no clinical question, red only for emergencies.
 */
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const MINOR = "Booking for a child is not available yet.";

describe("reconciliation panel — a human confirms, nothing is chosen for them", () => {
  const panel = read("app/reception/expected/_components/reconcile-panel.tsx");
  it("no default-selected candidate and no merge-all", () => {
    expect(panel).not.toMatch(/defaultChecked|checked=\{true\}|selected=\{/);
    expect(panel).not.toMatch(/merge all|Merge all/);
    expect(panel).toContain('name="action" value="confirm"');
    expect(panel).toContain('name="action" value="reject"');
    expect(panel).not.toContain('value="unreconcile"');
  });
  it("renders the basis words, never a score", () => {
    expect(panel).toContain("c.basis.map");
    expect(panel).not.toMatch(/score|confidence|%/i);
  });
  it("candidates carry a basis from the pure matcher", () => {
    const queries = read("lib/reception/queries.ts");
    expect(queries).toContain("matchBasis(");
    expect(queries).toContain("if (basis.length === 0) continue;");
  });
});

describe("household — adults only, logistics only", () => {
  it("the minor sentence is on both add-member surfaces", () => {
    expect(read("app/patient/household/_components/add-member-form.tsx")).toContain(MINOR);
    expect(read("app/reception/book/_components/desk-booking.tsx")).toContain(MINOR);
  });
  it("the web writer is pt-add-household-member, never a direct insert", () => {
    const action = read("app/patient/household/actions.ts");
    expect(action).toContain('callEdge("pt-add-household-member"');
    expect(action).not.toMatch(/db\.insert|createServiceClient/);
  });
  it("a member's visits carry no reason note, no clinician and no confidential line name", () => {
    const lib = read("lib/patient/household.ts");
    expect(lib).not.toContain("reasonNote");
    expect(lib).not.toContain("clinicianUserId");
    expect(lib).toContain("serviceName: r.confidential ? null : r.serviceName");
  });
  it("the wizard hides confidential lines when booking for a member and passes for_provisional_id", () => {
    const wizard = read("app/patient/book/_components/booking-wizard.tsx");
    expect(wizard).toContain("!(member && l.confidential)");
    expect(wizard).toContain("for_provisional_id: member?.provisionalPatientId");
  });
});

describe("booking for a member is never mistaken for booking for oneself", () => {
  it("the pick steps withhold the agent's own continuity mark and queue door", () => {
    const steps = read("app/patient/book/_components/pick-steps.tsx");
    expect(steps).toContain("clinician.seenBefore && !desk && !forMember");
    expect(steps).toContain("queue={!forMember}");
    const wizard = read("app/patient/book/_components/booking-wizard.tsx");
    expect(wizard.match(/forMember=\{member !== null\}/g)?.length).toBe(3);
    expect(wizard).toContain("forLabel={member?.memberLabel ?? null}");
  });
  it("the desk refuses a stated minor with the sentence, not just an unticked box", () => {
    const desk = read("app/reception/book/_components/desk-booking.tsx");
    expect(desk).toContain("const minor = age !== null && age < ADULT_YEARS;");
    expect(desk).toContain("!minor;");
  });
  it("the phone drops a member's note at the data layer and never arrives at a virtual visit", () => {
    const lib = read("mobile/src/lib/booking.ts");
    expect(lib).toContain("reasonNote: forMember ? null : r.reason_note");
    expect(lib).toContain('row.type !== "virtual"');
  });
});

describe("no clinical question, red only for emergencies", () => {
  const surfaces = [
    "app/reception/book/_components/desk-booking.tsx",
    "app/reception/book/page.tsx",
    "app/reception/expected/_components/reconcile-panel.tsx",
    "app/patient/household/_components/add-member-form.tsx",
    "app/patient/household/page.tsx",
    "app/patient/appointments/_components/arrived-button.tsx",
    "app/hospital-admin/scheduling/page.tsx",
  ];
  // ADR 0095: the desk mounts the descriptive picker, so the word "symptom"
  // is now allowed on the two booking files — as a module name, never as a
  // question. Every other word and the red-class ban stand.
  const BOOKING = new Set([
    "app/reception/book/_components/desk-booking.tsx",
    "app/reception/book/page.tsx",
  ]);
  it.each(surfaces)("%s", (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/pain|fever|bleed|how (bad|severe)/i);
    if (!BOOKING.has(rel)) expect(src).not.toMatch(/symptom/i);
    expect(src).not.toMatch(/text-destructive|status-critical|bg-red|text-red/);
  });
});

describe("the desk and the patient share one pick renderer", () => {
  it("SlotStep / SessionStep live once, in pick-steps.tsx", () => {
    const steps = read("app/patient/book/_components/pick-steps.tsx");
    expect(steps).toContain("export function SlotStep(");
    expect(steps).toContain("export function SessionStep(");
    expect(read("app/patient/book/_components/booking-wizard.tsx")).not.toContain(
      "function SlotStep(",
    );
    expect(read("app/reception/book/_components/desk-booking.tsx")).toMatch(
      /import \{[^}]*SlotStep[^}]*\} from "@\/app\/patient\/book\/_components\/pick-steps"/,
    );
  });
});
