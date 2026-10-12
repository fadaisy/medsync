import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { QueuePayload } from "@/app/pharmacy/_components/queue-screen";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Pharmacy Phase 0, Step 4 — the screens rendered to markup and the source scans: the queue (§5.3,
 * §10, PQ-12), the notice (§5.6, CS-4), honest time (Law 9, S18), the title rule (Law 4), no
 * clinical write (Law 2), and URLs that carry no patient number (§12). Next's router and the
 * server action are stubbed; everything else is the shipped component.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/pharmacy",
}));
vi.mock("@/app/pharmacy/actions", () => ({
  findByPatientNumber: async () => ({ rows: [], identities: {} }),
}));

const { QueueScreen } = await import("@/app/pharmacy/_components/queue-screen");
const { PharmacyNotice } = await import("@/app/pharmacy/_components/pharmacy-notice");
const { FindField } = await import("@/app/pharmacy/_components/find-field");

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const walk = (dir: string): string[] =>
  readdirSync(resolve(ROOT, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(resolve(ROOT, p)).isDirectory() ? walk(p) : [p];
  });

const NOW = "2026-10-10T07:42:00.000Z"; // 10:42 in Kampala
const at = (hhmm: string) => new Date(`2026-10-10T${hhmm}:00+03:00`).toISOString();
const H = "11111111-1111-4111-8111-111111111111";
let n = 0;
const line = (o: Partial<QueuePayload["lines"][number]> = {}): QueuePayload["lines"][number] => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  placementId: `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`,
  placementLine: 1,
  hospitalId: H,
  encounterId: "e-window",
  patientUserId: "p1",
  prescriberUserId: "dr1",
  prescriberCadre: "Medical officer",
  drugName: `Fixture medicine ${n}`,
  kind: "drug",
  state: "active",
  controlled: false,
  conditionId: "c1",
  regimenId: "r1",
  checkAnswers: [],
  confirmedFlags: [],
  cosign: null,
  createdAt: at("09:52"),
  updatedAt: at("09:52"),
  ...o,
});
const payload = (o: Partial<QueuePayload> = {}): QueuePayload => ({
  hospitalId: H,
  hospitalName: "Test Hospital-1",
  period: "today",
  lines: [
    line(),
    line({
      cosign: "pending_review",
      encounterId: "e-open",
      patientUserId: "p2",
      createdAt: at("10:05"),
      updatedAt: at("10:05"),
    }),
    line({
      encounterId: "e-ward",
      patientUserId: "p3",
      checkAnswers: [{ code: "allergy", answer: "not_allergic", outcome: "stop" }],
      createdAt: at("10:11"),
      updatedAt: at("10:11"),
    }),
  ],
  encounters: [
    {
      id: "e-window",
      departmentId: "d1",
      departmentName: "Diabetes clinic",
      encounterType: "opd",
      disposition: "home",
      admitted: false,
    },
    {
      id: "e-open",
      departmentId: "d2",
      departmentName: "Outpatients",
      encounterType: "opd",
      disposition: null,
      admitted: false,
    },
    {
      id: "e-ward",
      departmentId: "d3",
      departmentName: "Ward 4A",
      encounterType: "inpatient",
      disposition: null,
      admitted: false,
    },
  ],
  identities: {
    p1: { name: "Patient Nine-9", mrn: "MS-2026-00009", ageSex: "61 y · Male" },
    p2: { name: "Patient Four-4", mrn: "MS-2026-00021", ageSex: "9 y · Female" },
    p3: { name: "Patient Two-2", mrn: "MS-2026-00002", ageSex: "40 y · Male" },
  },
  defaultLane: "all",
  initial: { lane: null, state: null, from: null, sort: null },
  serverNowIso: NOW,
  timeZone: "Africa/Kampala",
  ...o,
});
const render = (p: QueuePayload) =>
  renderToStaticMarkup(
    h(QueueScreen, { payload: p, notice: h(PharmacyNotice, { hospitalId: H }) }),
  );

describe("the queue screen (§5.3, §10)", () => {
  afterEach(() => vi.useRealTimers());

  it("lane and state filters are tablists with the count in each name", () => {
    const html = render(payload());
    expect(html).toMatch(/role="tablist" aria-label="Lane"/);
    expect(html).toMatch(/aria-label="For the window, 1"/);
    expect(html).toMatch(/aria-label="On the wards, 1"/);
    expect(html).toMatch(/aria-label="Visit open, 1"/);
    expect(html).toMatch(/aria-label="All, 3"/);
    expect(html).toMatch(/aria-label="Awaiting co-sign, 1"/);
  });

  it("one control per row, named by the patient and the first medicine; links never prefetch", () => {
    const html = render(payload());
    const opens = html.match(/>Open<\/a>/g) ?? [];
    expect(opens.length).toBe(6); // three rows, desktop table and phone list
    expect(html).toMatch(
      /aria-labelledby="o-aaaaaaaa-0000-4000-8000-\d+ p-aaaaaaaa-0000-4000-8000-\d+ m-aaaaaaaa-0000-4000-8000-\d+"/,
    );
    expect(html).not.toMatch(/MS-2026-\d+[^"]*" href/);
  });

  it("states and checks are words; awaiting and an overridden stop are amber with an icon", () => {
    const html = render(payload());
    expect(html).toMatch(
      /data-tone="caution"[^>]*><svg[^>]*><\/svg>|data-tone="caution"[^>]*><svg/,
    );
    expect(html).toContain("Awaiting co-sign");
    expect(html).toContain("1 stop overridden");
    expect(html).toContain("No flags");
  });

  it("the footer says n of N, the order, and that the list is read-only", () => {
    expect(render(payload())).toContain(
      "3 of 3 prescriptions written today, in all lanes. Oldest first. This list is read-only",
    );
  });

  it("the notice shows with counts from data, as status, with no close button (CS-3, CS-4)", () => {
    const html = render(payload());
    expect(html).toMatch(/role="status"[^>]*>.*MedSync does not record dispensing yet\./);
    expect(html).toMatch(/and \d+ of the \d+ medicines on its list have a signed dose reference/);
    expect(html).not.toMatch(/aria-label="(Close|Dismiss)/);
  });

  it("S18: elapsed time comes from the server's clock, whatever the device says", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(new Date(NOW).getTime() + 3 * 3600_000)); // device 3 h fast
    const html = render(payload());
    expect(html).toContain("09:52 · 50 min");
    expect(html).not.toContain("3 h 50 min");
  });

  it("empty: nothing written today", () => {
    expect(render(payload({ lines: [] }))).toContain("No prescriptions have been written today.");
  });
});

describe("find (§5.7, §12)", () => {
  it("one field, labelled, a search form; the number never goes in a URL", () => {
    const html = renderToStaticMarkup(h(FindField));
    expect(html).toMatch(/<form role="search"/);
    expect(html).toMatch(/<label[^>]*>Find by patient number<\/label>/);
    expect(read("app/pharmacy/_components/find-field.tsx")).not.toMatch(
      /router\.push|searchParams|\?mrn=|\?patient/,
    );
  });
});

describe("source rules", () => {
  const PHARMACY_SRC = [
    ...walk("app/pharmacy"),
    ...walk("lib/pharmacy"),
    "content/pharmacy.ts",
    "content/pharmacy-stock.ts",
  ].filter((f) => /\.tsx?$/.test(f));

  it("Law 4: no pharmacy screen calls anyone 'Pharmacist' except through the approved cadre's name", () => {
    for (const f of PHARMACY_SRC) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      // Only the cadre code (data) may spell it; no copy or label does.
      const hits = [...src.matchAll(/["'`][^"'`]*\bPharmacist\b[^"'`]*["'`]/g)].map((m) => m[0]);
      expect(hits, f).toEqual([]);
    }
  });

  it("Law 2: nothing reachable from /pharmacy writes a clinical record; stock writes go through the pharmacy write path", () => {
    const actions = PHARMACY_SRC.filter((f) => /^\s*["']use server["']/m.test(read(f)));
    // Phase 0's read and the acting-point cookie; Phase 1's stock actions (Step 4, Section 8).
    expect(actions).toEqual(["app/pharmacy/actions.ts", "app/pharmacy/stock/actions.ts"]);
    for (const f of actions)
      expect(read(f), f).not.toMatch(
        /\.(insert|update|delete)\(|lib\/emr\/(write|actions)|withPatientWrite/,
      );
    expect(read("app/pharmacy/stock/actions.ts")).toMatch(/runPharmacyWrite/);
    for (const f of walk("app/pharmacy"))
      expect(read(f), f).not.toMatch(
        /@\/lib\/emr\/(write|actions)|@\/app\/(doctor|nurse|lab)\/.*actions/,
      );
  });

  it("§12: URLs carry ids only — the prescription key, filters and cart; never a patient number", () => {
    for (const f of walk("app/pharmacy"))
      expect(read(f), f).not.toMatch(/href=\{?`[^`]*(mrn|patientCode|patient_code|\.mrn)/);
  });
});
