import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PRD §5.4 — the not-a-medical-device boundary, enforced by test.
 *
 * The PRD does not merely forbid clinical questions on the booking path; it
 * says the prohibition "is enforced by test, not just by policy: an invariant
 * test asserts that no booking-flow field feeds any scoring or routing
 * function." This is that test. It is the claim MedSync's whole regulatory
 * posture rests on: MedSync Book performs no medical purpose, so it is an
 * administrative access tool and not a medical device.
 *
 * Source-level on purpose, like the Gate D/E/F invariant suites: the rule is
 * about which module may read which FIELD, and that is a fact about the source
 * tree, not about any row in a database.
 *
 * Direction matters. Forbidden: a booking-flow input reaching a scoring or
 * routing engine. Permitted: a clinical surface reading an appointment's
 * logistics, and a clinician reading the note a patient wrote them — the
 * clinician schedule and calendar do exactly that, deliberately.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // a tree that does not exist cannot violate the rule
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const sourcesUnder = (rel: string) =>
  walk(resolve(ROOT, rel)).map((p) => [p.slice(ROOT.length + 1), readFileSync(p, "utf8")] as const);

/** Comments explain the rule; they must not be mistaken for violations of it. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * The engines that score, rank, or route a patient by clinical state. If a
 * booking-flow field ever appears inside one of these, the booking flow has
 * begun to carry clinical meaning and the not-a-medical-device claim is gone.
 */
const SCORING_TREES = ["lib/triage", "lib/clerkship", "lib/encounter"];

/**
 * What a patient (or a clerk on their behalf) types or picks while booking.
 * `reason` is an administrative word from Appendix A; `reason_note` is free
 * text addressed to the clinic; the USSD and SMS bodies are whatever a phone
 * sent. None of them may reach an engine above.
 */
const BOOKING_INPUT_FIELDS = [
  "reason_note",
  "reasonNote",
  "waitlist_entries",
  "ussd_sessions",
  "inbound_sms",
];

/** Every path on which a visit is requested, on any surface or channel. */
const BOOKING_PATHS = [
  "app/patient/book",
  "app/reception/book",
  "lib/scheduling/booking-options.ts",
  "lib/channels",
  "supabase/functions/_shared/book.ts",
  "supabase/functions/pt-request-appointment",
  "supabase/functions/ha-book-on-behalf",
  "supabase/functions/system-ussd-book",
  "mobile/src/lib/booking.ts",
];

/** Importing any of these from a booking path would wire the flow to an engine. */
const ENGINE_IMPORTS = [
  "lib/triage",
  "lib/clerkship",
  "triage/engine",
  "clerkship/engine",
  "/scoring",
];

describe("PRD §5.4 — no booking-flow field feeds any scoring or routing function", () => {
  it("the scoring and routing engines never name a booking-flow input", () => {
    for (const tree of SCORING_TREES) {
      for (const [path, src] of sourcesUnder(tree)) {
        const code = stripComments(src);
        for (const field of BOOKING_INPUT_FIELDS) {
          expect(code, `${path} reads the booking-flow field ${field}`).not.toContain(field);
        }
      }
    }
  });

  it("no booking path imports a scoring or routing engine", () => {
    for (const target of BOOKING_PATHS) {
      const files = target.endsWith(".ts")
        ? ([[target, read(target)]] as ReadonlyArray<readonly [string, string]>)
        : sourcesUnder(target);
      for (const [path, src] of files) {
        const code = stripComments(src);
        for (const engine of ENGINE_IMPORTS) {
          expect(code, `${path} imports ${engine}`).not.toContain(engine);
        }
      }
    }
  });
});

describe("PRD §5.4 — the booking flow asks no clinical question", () => {
  /**
   * Appendix A, in its order. Closed on purpose: a fourteenth entry cannot be
   * added without editing this list, which is the moment to ask whether the new
   * word is administrative or clinical. `other` is accepted by the server and
   * deliberately never offered (a reason that maps to no service line maps to
   * no capacity).
   */
  const APPENDIX_A = [
    "follow_up",
    "post_discharge",
    "new_concern",
    "refill",
    "test_results",
    "antenatal",
    "immunisation",
    "child_wellness",
    "specialist_review",
    "routine",
    "procedure",
    "counselling",
    "second_opinion",
  ];

  it("the reason list is exactly Appendix A — no entry added without this test noticing", () => {
    const src = read("supabase/functions/_shared/sessions-sql.ts");
    const block = src.slice(
      src.indexOf("export const PATIENT_REASON_CODES"),
      src.indexOf("] as const", src.indexOf("export const PATIENT_REASON_CODES")),
    );
    const codes = [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1] as string);
    expect(codes).toEqual(APPENDIX_A);
  });

  /**
   * Vocabulary that only a clinical question needs. Scoped to the words a
   * patient is SHOWN while booking, never to whole files: "emergency" is
   * required on the interstitial (PRD §2.5) and "duration" is a session's
   * length in minutes — both are administrative uses of a clinical-sounding
   * word, which is exactly why this check reads labels rather than source.
   */
  const CLINICAL_VOCABULARY =
    /\b(symptom|severity|severe|how (long|bad)|since when|pain scale|rate your|fever|bleeding|vomit|breathless|acuity|triage|score)\b/i;

  /** Titles and hints shown on the reason step, web and phone. */
  function reasonLabels(src: string, startMarker: string): string[] {
    const start = src.indexOf(startMarker);
    expect(start, `${startMarker} not found`).toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf("\n];", start));
    return [...block.matchAll(/(?:title|hint):\s*"([^"]+)"/g)].map((m) => m[1] as string);
  }

  it("no reason a patient picks reads as a clinical question (web and phone)", () => {
    const labels = [
      ...reasonLabels(read("app/patient/book/_lib/booking.ts"), "export const REASONS"),
      ...reasonLabels(read("mobile/src/lib/booking.ts"), "export const APPOINTMENT_REASONS"),
    ];
    // Both surfaces offer all thirteen, each with a title and a hint.
    expect(labels.length).toBeGreaterThanOrEqual(APPENDIX_A.length * 2);
    for (const label of labels) {
      expect(label, `reason label asks a clinical question: "${label}"`).not.toMatch(
        CLINICAL_VOCABULARY,
      );
      // An administrative reason is a noun phrase. A question mark is a question.
      expect(label, `reason label is phrased as a question: "${label}"`).not.toContain("?");
    }
  });

  it("the free-text note asks for logistics, and its example says so", () => {
    for (const [path, marker] of [
      ["app/patient/book/_components/booking-wizard.tsx", "note"],
      ["mobile/src/app/(app)/clinic/[id].tsx", "note"],
    ] as const) {
      const src = read(path);
      expect(src, `${path} lost its note field`).toContain(marker);
      // The label and placeholder are addressed to the clinic's diary, never
      // to the patient's body.
      const placeholders = [...src.matchAll(/placeholder="([^"]+)"/g)].map((m) => m[1] as string);
      for (const p of placeholders) {
        expect(p, `${path} placeholder invites a clinical answer: "${p}"`).not.toMatch(
          CLINICAL_VOCABULARY,
        );
      }
    }
  });

  it("the interstitial states the boundary and asks nothing", () => {
    const src = read("app/patient/book/_lib/booking.ts");
    const block = src.slice(src.indexOf("export const INTERSTITIAL"), src.indexOf("} as const"));
    // Static: no question, no input, no branch (ADR 0088).
    expect(block).toContain("Booking is for care that can wait.");
    expect(block).not.toContain("?");
  });
});
