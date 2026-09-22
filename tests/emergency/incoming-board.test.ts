import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Incoming board (PRD MS-PRD-SYM-001 §8.5; ADR 0098) — source-level
 * invariants, in the style of tests/emergency/queries-invariants.test.ts:
 * the tenant pin, the realtime doorbell that never renders its payload,
 * the audited writes, the red allowlist and the words beside every colour.
 */
const ROOT = process.cwd();
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (rel: string) => stripComments(readFileSync(resolve(ROOT, rel), "utf8"));

const FILES = {
  receptionPage: "app/reception/incoming/page.tsx",
  receptionActions: "app/reception/incoming/actions.ts",
  nursePage: "app/nurse/incoming/page.tsx",
  nurseActions: "app/nurse/incoming/actions.ts",
  board: "app/reception/incoming/_components/incoming-board.tsx",
  card: "app/reception/incoming/_components/incoming-card.tsx",
  today: "app/reception/page.tsx",
  features: "app/reception/_lib/features.ts",
  nurseFeatures: "app/nurse/_lib/features.ts",
} as const;
const SRC = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, read(p)])) as Record<
  keyof typeof FILES,
  string
>;

const RED =
  /status-critical|destructive(?!-foreground)|\b(?:bg|text|border|ring)-(?:red|rose)-\d|#(?:dc2626|ef4444|b91c1c)/i;

describe("the pages pin the facility from the scope", () => {
  it("reception: requireReceptionScope → facilityId = scope.hospitalId → every fetch", () => {
    const s = SRC.receptionPage;
    expect(s).toMatch(/requireReceptionScope\(\)/);
    expect(s).toMatch(/const facilityId = scope\.hospitalId/);
    const calls = s.match(/fetchIncomingPreArrivals\(\{[^}]*\}\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) expect(c).toMatch(/facilityId/);
    expect(s).toMatch(/listHospitalDepartments\(facilityId\)/);
    expect(s).toMatch(/export const dynamic = "force-dynamic"/);
  });

  it("nurse: requireNurseScope, same components, same pins", () => {
    const s = SRC.nursePage;
    expect(s).toMatch(/requireNurseScope\(\)/);
    expect(s).not.toMatch(/requireReceptionScope/);
    expect(s).toMatch(/const facilityId = scope\.hospitalId/);
    expect(s).toMatch(/@\/app\/reception\/incoming\/_components\/incoming-board/);
    expect(s).toMatch(/from "\.\/actions"/);
    expect(SRC.nurseActions).toMatch(/requireNurseScope\(\)/);
    expect(SRC.nurseActions).not.toMatch(/requireReceptionScope/);
  });

  it("the closed list is today's, by created time — never by complaint or symptoms", () => {
    for (const s of [SRC.receptionPage, SRC.nursePage]) {
      expect(s).toMatch(/statuses: \["arrived", "not_arriving", "hoax", "expired"\]/);
      expect(s).toMatch(/limit: 20/);
      expect(s).toMatch(/r\.createdAt >= dayStart/);
    }
    for (const s of Object.values(SRC)) {
      expect(s).not.toMatch(/\.(?:sort|filter)\([^)]*(?:complaint|symptom)/i);
    }
  });
});

describe("the realtime subscription is a doorbell", () => {
  it("filters on the facility and refreshes through the server", () => {
    const s = SRC.board;
    expect(s).toMatch(/supabase\s*\.channel\(`pre-arrivals:\$\{facilityId\}`\)/);
    expect(s).toMatch(/table: "emergency_pre_arrivals"/);
    expect(s).toMatch(/filter: `facility_id=eq\.\$\{facilityId\}`/);
    expect(s).toMatch(/\(\) => router\.refresh\(\)/);
  });

  it("never reads the payload", () => {
    expect(SRC.board).not.toMatch(/payload/);
  });

  it("keeps the polling fallback and the 30 s escalation tick on BOARD_ESCALATION_MS", () => {
    const s = SRC.board;
    expect(s).toMatch(/<AutoRefresh everyMs=\{POLL_MS\} \/>/);
    expect(s).toMatch(/const POLL_MS = 15_000/);
    expect(s).toMatch(/const TICK_MS = 30_000/);
    expect(s).toMatch(
      /import \{ BOARD_ESCALATION_MS[^}]*\} from "@\/supabase\/functions\/_shared\/pre-arrival"/,
    );
    expect(s).toMatch(/waited >= BOARD_ESCALATION_MS/);
    expect(SRC.card).toMatch(/Unacknowledged \{escalatedMinutes\} min/);
  });

  it("the chime is a switch with words, remembered per browser, gated on a gesture", () => {
    const s = SRC.board;
    expect(s).toMatch(/"medsync:incoming-chime"/);
    expect(s).toMatch(/role="switch"/);
    expect(s).toMatch(/"Chime on" : "Chime off"/);
    expect(s).toMatch(/interacted\.current/);
    expect(s).toMatch(/AudioContext/);
  });

  it("the badge counts unacknowledged rows in the panel title", () => {
    expect(SRC.board).toMatch(/count=\{unacknowledged\}/);
    expect(SRC.board).toMatch(/acknowledgedAt === null/);
  });
});

describe("the writes go through the Edge Functions, audited, and revalidate the boards", () => {
  for (const [name, s] of [
    ["reception", SRC.receptionActions],
    ["nurse", SRC.nurseActions],
  ] as const) {
    it(`${name}: ha-update-pre-arrival and ha-pre-arrival-arrived, then revalidatePath`, () => {
      expect(s).toMatch(/^"use server"/);
      expect(s).toMatch(/callEdge\("ha-update-pre-arrival", parsed\.data/);
      expect(s).toMatch(/callEdge<[^>]*>\(\s*"ha-pre-arrival-arrived",\s*parsed\.data/);
      expect(s).toMatch(/revalidatePath\(p\)/);
      expect(s).toMatch(/"\/reception\/incoming", "\/reception", "\/nurse\/incoming", "\/nurse"/);
      // A closing status needs its reason; the functions enforce it too.
      expect(s).toMatch(/status: z\.enum\(\["seen", "ready", "not_arriving", "hoax"\]\)/);
      expect(s).toMatch(/\.min\(8/);
    });
  }
});

describe("red is the card's alone, and never colour alone", () => {
  it("only incoming-card.tsx names red, and only for the header and the isolation banner", () => {
    for (const [k, s] of Object.entries(SRC)) {
      if (k === "card") continue;
      expect(RED.exec(s), `${FILES[k as keyof typeof FILES]}: ${RED.exec(s)?.[0]}`).toBeNull();
    }
    const card = SRC.card;
    const fills = card.match(/bg-status-critical-bg/g) ?? [];
    expect(fills).toHaveLength(2);
    expect(card).toMatch(/"Incoming emergency"/);
    expect(card).toMatch(/Prepare isolation — fever with bleeding/);
  });

  it("every Pill carries words", () => {
    for (const s of [SRC.card, SRC.board]) {
      for (const m of s.matchAll(/<Pill\b[^>]*>([\s\S]*?)<\/Pill>/g)) {
        expect((m[1] ?? "").trim()).not.toBe("");
      }
      expect(s).not.toMatch(/<Pill\b[^>]*\/>/);
    }
    expect(SRC.card).toMatch(/"Verified reporter" : "Unverified reporter"/);
  });

  it("the card says the words the PRD lists", () => {
    const s = SRC.card;
    expect(s).toMatch(/ETA_BAND_LABEL\[row\.etaBand\]/);
    expect(s).toMatch(/href=\{`tel:\$\{row\.callbackPhone\}`\}/);
    expect(s).toMatch(/Last normal/);
    expect(s).toMatch(/Intake created — awaiting triage/);
    expect(s).toMatch(/Linked to today's intake/);
    for (const label of ["Acknowledge", "Ready", "Call", "Arrived", "Not arriving", "Hoax"]) {
      expect(s, label).toContain(label);
    }
  });
});

describe("navigation", () => {
  it("the reception registry has 'incoming' right after Today", () => {
    const s = SRC.features;
    const slugs = [...s.matchAll(/slug: "([^"]*)"/g)].map((m) => m[1]);
    expect(slugs.slice(0, 2)).toEqual(["", "incoming"]);
    expect(s).toMatch(/label: "Incoming"/);
    expect(s).toMatch(/hint: "Pre-alerts — patients on their way"/);
  });

  it("the nurse registry has it too, visible to all", () => {
    expect(SRC.nurseFeatures).toMatch(
      /slug: "incoming",\s*label: "Incoming",[\s\S]*?placeholder: false,\s*visibleTo: "all"/,
    );
  });

  it("the Today board carries the Incoming strip when a pre-alert is open", () => {
    const s = SRC.today;
    expect(s).toMatch(/fetchIncomingPreArrivals\(\{ facilityId: scope\.hospitalId \}\)/);
    expect(s).toMatch(/href="\/reception\/incoming"/);
    expect(s).toMatch(/Incoming \(\{preArrivals\.length\}\)/);
    expect(s).toMatch(/ETA_BAND_LABEL\[oldest\.etaBand\]/);
  });
});
