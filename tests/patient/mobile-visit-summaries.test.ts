/**
 * The phone's visit-summary route (ADR 0342 §2): no token or a bad token is refused before any record is read,
 * and the copy the phone receives never carries a medicine's dose, route or frequency (law L5).
 */
import type { VisitSummaryContent } from "@/lib/patient/visit-summary";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const listVisitSummaries = vi.fn();

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser } }) }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_SUPABASE_URL: "http://x", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" },
}));
vi.mock("@/lib/auth", () => ({ MFA_REQUIRED_ROLES: new Set(["clinician"]) }));
vi.mock("@/lib/patient/scope", () => ({ dataProcessingConsent: vi.fn() }));
vi.mock("@/lib/onboarding/rate-limit", () => ({ allow: async () => true }));
vi.mock("@/lib/patient/visit-summaries", () => ({
  listVisitSummaries,
  getVisitSummary: vi.fn(),
  prescriptionsInTracker: vi.fn(),
}));

const { GET } = await import("@/app/api/mobile/visit-summaries/route");
const { toMobileSummary } = await import("@/app/api/mobile/visit-summaries/_lib/shape");

describe("GET /api/mobile/visit-summaries refuses without a valid token", () => {
  beforeEach(() => {
    getUser.mockReset();
    listVisitSummaries.mockReset();
  });

  it("401 with no Authorization header", async () => {
    const res = await GET(new Request("http://x/api/mobile/visit-summaries"));
    expect(res.status).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
    expect(listVisitSummaries).not.toHaveBeenCalled();
  });

  it("401 when Supabase rejects the token", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    const res = await GET(
      new Request("http://x/api/mobile/visit-summaries", {
        headers: { Authorization: "Bearer not-a-token" },
      }),
    );
    expect(res.status).toBe(401);
    expect(getUser).toHaveBeenCalledWith("not-a-token");
    expect(listVisitSummaries).not.toHaveBeenCalled();
  });
});

describe("toMobileSummary", () => {
  const rx = "11111111-1111-4111-8111-111111111111";
  const content: VisitSummaryContent = {
    v: 1,
    visit: { startedAt: "2026-10-03T07:30:00Z", hospitalName: "Lane Hospital", clinician: "Dr A" },
    outcome: "You went home.",
    outcomeNote: null,
    sections: {
      found: [{ id: "dx:1", text: "Malaria", detail: null }],
      medicines: [
        { id: `rx:${rx}`, text: "Artemether", detail: "80 mg, oral, twice daily, for 3 days" },
      ],
      stopped: [{ id: "stop:2", text: "Paracetamol", detail: null }],
      tests: [],
    },
    next: null,
    comeBackIf: "If the fever returns",
  };
  const meta = {
    id: "s1",
    decidedAt: new Date("2026-10-03T09:00:00Z"),
    updated: false,
    hospitalName: "Lane Hospital",
  };

  it("drops the prescription as written and keeps the name", () => {
    const m = toMobileSummary(meta, content, new Set([rx]));
    expect(m.medicines).toEqual([{ prescriptionId: rx, name: "Artemether", inMyMedicines: true }]);
    expect(JSON.stringify(m)).not.toMatch(/80 mg|twice daily|oral/);
  });

  it("names the results sentence only when a test was ordered", () => {
    expect(toMobileSummary(meta, content, new Set()).testsNote).toBeNull();
    const withTest = {
      ...content,
      sections: {
        ...content.sections,
        tests: [{ id: "test:1", text: "Full blood count", detail: null }],
      },
    };
    expect(toMobileSummary(meta, withTest, new Set()).testsNote).toBe(
      "Results will be shared after your clinician reviews them.",
    );
  });
});
