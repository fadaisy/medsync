import type { ReviewQueuePayload } from "@/app/pharmacy/_components/review-queue";
import type { ReviewScreenProps } from "@/app/pharmacy/_components/review-screen";
import type { ReviewData, ReviewLineView, ReviewRow } from "@/lib/pharmacy/review/read";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Pharmacy Phase 1, Step 5 — the review queue (5.2) and the review screen (5.3) rendered to markup:
 * lane and stage tablists with counts in their names (Section 10), the LN-4 explainer, waiting in words
 * with no colour, "Cannot be supplied yet", a technician read-only on a pharmacist-first line with
 * "Waiting for a pharmacist" (S13), a replaced line struck through and announced (RQ-9), the quantity
 * never pre-filled (SU-6). Next's router and the server actions are stubbed.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/pharmacy",
}));
vi.mock("@/app/pharmacy/review-actions", () => ({}));

const { ReviewQueue } = await import("@/app/pharmacy/_components/review-queue");
const { ReviewScreen } = await import("@/app/pharmacy/_components/review-screen");

const NOW = "2026-10-12T07:42:00.000Z";
const row = (o: Partial<ReviewRow> & { key: string }): ReviewRow => ({
  firstLineId: `${o.key}-1`,
  patientUserId: "p1",
  medicines: ["Fixture medicine A"],
  lineCount: 1,
  notOnShelf: 0,
  notCounted: false,
  from: "Diabetes clinic",
  prescriberCadre: "Medical officer",
  origin: "window",
  lane: "standard",
  reasons: [],
  stage: "to_review",
  queriedSince: null,
  writtenAt: "2026-10-12T06:52:00.000Z",
  earlier: false,
  ageDays: 0,
  payment: null,
  changedSincePrint: false,
  ...o,
});
const payload = (o: Partial<ReviewQueuePayload> = {}): ReviewQueuePayload => ({
  rows: [
    row({
      key: "k1",
      lane: "pharmacist_first",
      reasons: ["overridden_stop", "renal_check", "child_check"],
    }),
    row({ key: "k2", stage: "awaiting_cosign", payment: "paid" }),
    row({ key: "k3", earlier: true, ageDays: 3, writtenAt: "2026-10-09T06:52:00.000Z" }),
  ],
  points: [{ id: "pt1", name: "Fixture point A", serves: "window", live: true }],
  rule: {
    signed: true,
    reasonsOn: ["overridden_stop", "controlled", "renal_check"],
    highRiskSigned: false,
  },
  serverNow: NOW,
  hospitalName: "Test Hospital-1",
  identities: { p1: { name: "Patient Nine-9", mrn: "MS-2026-00009", ageSex: "61 y · Male" } },
  actingPointId: "pt1",
  canReview: true,
  canDispense: true,
  timeZone: "Africa/Kampala",
  ...o,
});
const queue = (p: ReviewQueuePayload) =>
  renderToStaticMarkup(h(ReviewQueue, { payload: p, notice: null }));

describe("the review queue (5.2, Section 10)", () => {
  it("lane and stage tabs carry their counts; lanes add up to All", () => {
    const html = queue(payload());
    expect(html).toMatch(/role="tablist" aria-label="Review lane"/);
    expect(html).toMatch(/aria-label="Pharmacist first, 1"/);
    expect(html).toMatch(/aria-label="Standard, 2"/);
    expect(html).toMatch(/aria-label="All, 3"/);
    expect(html).toMatch(/aria-label="Awaiting co-sign, 0"/); // within the pharmacist-first lane
  });

  it("reasons: two chips then +n; an overridden stop is amber; the footer and the explainer", () => {
    const html = queue(payload());
    expect(html).toMatch(/data-tone="caution"[^>]*>.*?Stop overridden/);
    expect(html).toContain("Renal check");
    expect(html).toContain("+1");
    expect(html).toContain(
      "1 of 3 at Fixture point A, pharmacist first. Waiting starts when the prescription was written.",
    );
    expect(html).toContain(
      "A prescription goes to &quot;Pharmacist first&quot; when the prescriber overrode a stop, it has a controlled drug or the renal check fired.",
    );
    expect(html).toContain(
      "This hospital has no signed high-risk list, so that reason is not used.",
    );
  });

  it("LN-4: with no signed rule, one lane and the explainer says so", () => {
    const html = queue(payload({ rule: { signed: false, reasonsOn: [], highRiskSigned: false } }));
    expect(html).not.toContain("Pharmacist first, ");
    expect(html).toMatch(/aria-label="All, 3"/);
    expect(html).toContain(
      "This hospital has not signed its review rule, so every prescription needs a pharmacist.",
    );
    expect(html).toContain("Written before today, still without an outcome");
    expect(html).toContain("Close as not collected");
    expect(html).toContain("3 days");
  });

  it("waiting is words with no colour; a co-sign row says it cannot be supplied yet; a technician opens", () => {
    const html = queue(
      payload({ canReview: false, rule: { signed: false, reasonsOn: [], highRiskSigned: false } }),
    );
    expect(html).toContain("50 min");
    expect(html).toContain("Cannot be supplied yet");
    expect(html).toContain("Paid");
    expect(html).toContain("Not recorded");
    expect(html).not.toMatch(/text-red|bg-red|text-green|bg-green/);
  });
});

const line = (o: Partial<ReviewLineView> & { id: string }): ReviewLineView => ({
  drugId: "fixture_a",
  input: {
    id: o.id,
    placementLine: 1,
    kind: "drug",
    drugName: `Fixture medicine ${o.id}`,
    concentration: null,
    dose: "[fixture dose]",
    route: "oral",
    frequency: "[fixture frequency]",
    duration: null,
    quantity: null,
    method: null,
    infusionOver: null,
    diluent: null,
    prn: false,
    fluidPurpose: null,
    volumeMl: null,
    overMinutes: null,
    instructions: null,
    indication: null,
    conditionId: null,
    regimenId: null,
    edits: [],
    controlled: false,
    state: "active",
    cosign: null,
    checkAnswers: [],
    confirmedFlags: [],
    reasons: "Fixture reason, verbatim",
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  },
  status: { kind: "stage", stage: "to_review" },
  reasons: [],
  need: "accept_remaining",
  basis: null,
  staged: null,
  shelf: {
    state: "on_shelf",
    quantity: 120,
    issueUnit: "tablet",
    lastCounted: NOW,
    outSince: null,
    firstBatch: { batchNumber: "FX-001", expiry: "2027-03-01", expiryMonthOnly: true },
    expired: [],
  },
  elsewhere: [],
  replacedAt: null,
  replaces: null,
  suppliedEarlier: null,
  checks: [],
  overriddenStops: [],
  doseSource: null,
  outcomeReason: null,
  outcomeSince: null,
  ...o,
});
const data = (o: Partial<ReviewData> = {}): ReviewData => ({
  key: "k1",
  patientUserId: "p1",
  firstLineId: "a",
  lane: "pharmacist_first",
  laneReasons: ["overridden_stop"],
  scope: "supply",
  origin: "window",
  from: "Diabetes clinic",
  prescriberCadre: "Medical officer",
  writtenAt: NOW,
  beforeGoLive: false,
  cosignAwaiting: false,
  changedSincePrint: false,
  payment: null,
  lines: [
    line({ id: "a", reasons: ["overridden_stop"], need: "own_tap", overriddenStops: ["Allergy"] }),
    line({ id: "b" }),
  ],
  queries: [],
  doses: { signed: 0, total: 2 },
  recipients: [{ cadre: "Medical officer", place: "Diabetes clinic", role: "prescriber" }],
  skipped: [],
  settings: { supplyWithoutPharmacist: false, liveSms: false },
  pointLive: true,
  pointName: "Fixture point A",
  pointPhone: "+256 700 000000",
  otherLivePoints: [],
  serverNow: NOW,
  ...o,
});
const screen = (p: Partial<ReviewScreenProps>) =>
  renderToStaticMarkup(
    h(ReviewScreen, {
      data: data(),
      canReview: true,
      canDispense: true,
      prescribers: [],
      patientListOn: false,
      timeZone: "Africa/Kampala",
      ...p,
    }),
  );

describe("the review screen (5.3, S13, S14)", () => {
  it("a pharmacist sees 'Reason accepted, supply' on the stop and 'Accept the remaining lines'", () => {
    const html = screen({});
    expect(html).toContain("Reason accepted, supply");
    expect(html).toContain("Accept the remaining lines");
    expect(html).toContain("Allergy stop, overridden by the prescriber.");
    expect(html).toContain("Fixture reason, verbatim");
    expect(html).toContain("120 tablet · counted");
    expect(html).toContain("FX-001 · exp 03/2027");
    expect(html).toContain("Hand-over comes in the next step");
  });

  it("S13: a technician sees a pharmacist-first prescription read-only, waiting for a pharmacist", () => {
    const html = screen({ canReview: false });
    expect(html).toContain("Waiting for a pharmacist");
    expect(html).not.toContain("Reason accepted, supply");
    expect(html).not.toContain('type="radio" name="decision-');
    expect(html).not.toMatch(/\bPharmacist\b(?! first)/);
  });

  it("an accepted line opens one decision per line, the medicine in its legend, quantity empty", () => {
    const html = screen({
      data: data({
        lines: [
          line({
            id: "a",
            status: { kind: "stage", stage: "ready" },
            basis: { kind: "accepted", byCadre: "Pharmacist", at: NOW },
          }),
        ],
      }),
    });
    expect(html).toMatch(/<legend[^>]*>Decision: Fixture medicine a<\/legend>/);
    expect(html).toContain("Supply in full");
    expect(html).toContain("Not on the shelf");
    expect(html).not.toMatch(/value="\d+"/);
  });

  it("RQ-9: a replaced line is struck through and announced; ward lines are review-only", () => {
    const html = screen({
      data: data({
        scope: "review_only",
        lines: [
          line({
            id: "a",
            status: { kind: "closed", outcome: "replaced" },
            replacedAt: NOW,
          }),
          line({ id: "a2", replaces: "a" }),
        ],
      }),
    });
    expect(html).toContain('<span class="sr-only">Replaced:</span>');
    expect(html).toContain("line-through");
    expect(html).toContain("was changed by the prescriber at 10:42. Review it again.");
    expect(html).toContain("Ward doses come from ward stock, which MedSync does not count yet.");
    expect(html).not.toContain("Save and keep in the queue");
  });

  it("the query form names who will be told; nobody is amber", () => {
    expect(screen({})).toContain("Medical officer · Diabetes clinic (prescriber)");
    const html = screen({ data: data({ recipients: [] }) });
    expect(html).toMatch(
      /data-tone="caution"[^>]*>.*?Nobody can be told in MedSync\. Call the ward or clinic\./,
    );
  });
});

describe("Law 14 and the design rules, on every Step 5 route and component", () => {
  const FILES = [
    "app/pharmacy/_components/review-queue.tsx",
    "app/pharmacy/_components/review-screen.tsx",
    "app/pharmacy/_components/review-dialogs.tsx",
    "app/pharmacy/open-lines/page.tsx",
    "app/pharmacy/open-lines/_components/open-lines.tsx",
    "app/pharmacy/slip/[id]/page.tsx",
    "app/pharmacy/review-actions.ts",
    "content/pharmacy-review.ts",
  ];
  it("no red, no green, no hex, no left-edge bars, no critical tone", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of FILES) {
      const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/\b(text|bg|border|ring|fill|stroke)-(red|rose|green|emerald)-/);
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, f).not.toMatch(/\bborder-l-\d|\bborder-l\b/);
      expect(src, f).not.toMatch(/tone="critical"/);
    }
  });
});
