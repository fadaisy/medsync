import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PRD §5.4 — the not-a-medical-device boundary, enforced by test, as amended
 * by ADR 0095 (owner ruling 2026-09-21).
 *
 * The PRD says the prohibition on clinical questions at booking "is enforced
 * by test, not just by policy: an invariant test asserts that no booking-flow
 * field feeds any scoring or routing function." This is that test. It is the
 * claim MedSync's whole regulatory posture rests on: MedSync Book performs no
 * medical purpose, so it is an administrative access tool and not a medical
 * device.
 *
 * THE AMENDED RULE. A booking MAY now carry the symptoms the patient chose to
 * state, each with a duration — as words for the clinic, exactly as written
 * (`appointments.symptoms`, `_shared/symptoms.ts`). What has not changed is
 * everything that would make those words clinical: they are never ranked,
 * routed, scored or coloured; no engine under lib/triage, lib/clerkship or
 * lib/encounter may read them; the catalogue's decision-support flags never
 * reach a booking surface; the selector asks nothing about severity, urgency
 * or "how bad"; and the reason list stays Appendix A. Each of those is a
 * `describe` below.
 *
 * Source-level on purpose, like the Gate D/E/F invariant suites: the rule is
 * about which module may read which FIELD, and that is a fact about the source
 * tree, not about any row in a database.
 *
 * Direction matters. Forbidden: a booking-flow input reaching a scoring or
 * routing engine. Permitted: a clinical surface reading an appointment's
 * logistics, and a clinician reading the words a patient wrote them — the
 * staff patient card does exactly that, deliberately.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

/** A file another lane is still writing fails with its name, not an ENOENT. */
const readRequired = (rel: string) => {
  expect(existsSync(resolve(ROOT, rel)), `${rel} is missing — the firewall cannot vet it`).toBe(
    true,
  );
  return read(rel);
};

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

/** A path, or a tree: whichever the target names. */
const sourcesAt = (target: string) =>
  /\.tsx?$/.test(target)
    ? ([[target, read(target)]] as ReadonlyArray<readonly [string, string]>)
    : sourcesUnder(target);

/** Comments explain the rule; they must not be mistaken for violations of it. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Prose shown to a clinician may say "symptoms"; only an identifier reads the field. */
const stripStrings = (src: string) =>
  stripComments(src)
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''");

/**
 * The engines that score, rank, or route a patient by clinical state. If a
 * booking-flow field ever appears inside one of these, the booking flow has
 * begun to carry clinical meaning and the not-a-medical-device claim is gone.
 */
const SCORING_TREES = ["lib/triage", "lib/clerkship", "lib/encounter"];

/**
 * What a patient (or a clerk on their behalf) types or picks while booking.
 * `reason` is an administrative word from Appendix A; `reason_note` is free
 * text addressed to the clinic; `symptoms` (ADR 0095) is the list the patient
 * chose to state, and `complaintLine`/`formatSymptoms` are the only readers
 * of it; the USSD and SMS bodies are whatever a phone sent. None of them may
 * reach an engine above.
 */
const BOOKING_INPUT_FIELDS = [
  "reason_note",
  "reasonNote",
  "symptoms",
  "complaintLine",
  "formatSymptoms",
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
  // ADR 0095: the selectors and the screens that mount them.
  "app/patient/book/_components",
  "mobile/src/components/patient",
  "mobile/src/app/(app)/doctor",
  "mobile/src/app/(app)/clinic",
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
        const code = stripStrings(src);
        for (const field of BOOKING_INPUT_FIELDS) {
          expect(code, `${path} reads the booking-flow field ${field}`).not.toMatch(
            new RegExp(`\\b${field}\\b`),
          );
        }
      }
    }
  });

  it("no booking path imports a scoring or routing engine", () => {
    for (const target of BOOKING_PATHS) {
      for (const [path, src] of sourcesAt(target)) {
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
   * no capacity). ADR 0095 did not touch this: a symptom is not a reason.
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
   * Vocabulary that only a clinical question needs, for the REASON step: a
   * reason is an administrative word, so it may not even name a symptom.
   * Scoped to the words a patient is SHOWN, never to whole files: "emergency"
   * is required on the interstitial (PRD §2.5) and "duration" is a session's
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

  /**
   * ADR 0095 — the symptom selector may name a symptom (that is its job) but
   * may not ASSESS one. Narrower than the reason-step regex on purpose: the
   * words a selector must never say are the ones that turn a description into
   * a grading — severity, urgency, "how bad" — and the two phrasings of
   * duration that read as a clinical history ("how long", "since when"; the
   * five chips carry duration instead). `urgent` is banned outright: a
   * booking is for care that can wait, and the interstitial already said so.
   */
  const ASSESSMENT =
    /\b(severity|severe|how (bad|urgent|long)|since when|pain scale|rate your|acuity|triage|score|urgent)\b/i;

  /** Every surface that shows the selector, or the note beside it. */
  const SELECTOR_SURFACES = [
    "app/patient/book/_components/symptom-picker.tsx",
    "app/patient/book/_components/booking-wizard.tsx",
    "app/reception/book/_components/desk-booking.tsx",
    // ADR 0096 §5: the home's shortlist is a selector too.
    "app/patient/_components/symptom-quick-pick.tsx",
    "mobile/src/components/patient/symptom-quick-pick.tsx",
    "mobile/src/components/patient/symptom-picker.tsx",
    "mobile/src/app/(app)/clinic/[id].tsx",
    "mobile/src/app/(app)/doctor/[id].tsx",
  ];

  /**
   * What a person reads on those surfaces: every `placeholder=`, `title`,
   * `lede`, `hint`, `label` and `accessibilityLabel` string (as a JSX prop or
   * an object key — the phone's chips and buttons carry their words in
   * `label=`), every top-level string constant (`const FULL = "…"` is how the
   * web picker holds its sentences), plus the bare text between JSX tags.
   * Source text a patient never sees is not judged.
   */
  function shownText(raw: string): string[] {
    const src = stripComments(raw);
    const props = [
      ...src.matchAll(
        /\b(?:placeholder|title|lede|hint|label|accessibilityLabel)\s*[=:]\s*\{?\s*"([^"]*)"/g,
      ),
    ].map((m) => m[1] as string);
    const constants = [...src.matchAll(/^(?:export\s+)?const\s+[A-Z_]+\s*=\s*"([^"]*)"/gm)].map(
      (m) => m[1] as string,
    );
    const jsxText = [...src.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) =>
      (m[1] as string).trim(),
    );
    return [...props, ...constants, ...jsxText].filter(Boolean);
  }

  it("no selector surface asks the patient to grade what they said", () => {
    for (const path of SELECTOR_SURFACES) {
      const src = readRequired(path);
      for (const text of shownText(src)) {
        expect(text, `${path} shows an assessment prompt: "${text}"`).not.toMatch(ASSESSMENT);
      }
    }
  });

  it("the free-text note still asks for logistics, and its example says so", () => {
    for (const path of [
      "app/patient/book/_components/booking-wizard.tsx",
      "mobile/src/app/(app)/clinic/[id].tsx",
      "mobile/src/app/(app)/doctor/[id].tsx",
    ]) {
      const src = read(path);
      expect(src, `${path} lost its note field`).toContain("note");
      // The note's label and placeholder are addressed to the clinic's diary,
      // never to the patient's body — the full vocabulary still applies here.
      for (const m of src.matchAll(/placeholder="([^"]+)"/g)) {
        expect(m[1], `${path} placeholder invites a clinical answer: "${m[1]}"`).not.toMatch(
          CLINICAL_VOCABULARY,
        );
      }
    }
  });

  it("every selector shows the one sentence that states the boundary (SYMPTOMS_NOTE)", () => {
    // The web picker serves the wizard and the desk; the phone has its own;
    // the home's shortlist (ADR 0096 §3) shows the sentence as well.
    for (const [path, module] of [
      ["app/patient/book/_components/symptom-picker.tsx", "@/supabase/functions/_shared/symptoms"],
      ["app/patient/_components/symptom-quick-pick.tsx", "@/supabase/functions/_shared/symptoms"],
      ["mobile/src/components/patient/symptom-quick-pick.tsx", "@shared/symptoms"],
      ["mobile/src/components/patient/symptom-picker.tsx", "@shared/symptoms"],
    ] as const) {
      const src = stripComments(readRequired(path));
      expect(src, `${path} does not import SYMPTOMS_NOTE from ${module}`).toMatch(
        new RegExp(
          `import\\s*(?:type\\s*)?\\{[^}]*\\bSYMPTOMS_NOTE\\b[^}]*\\}\\s*from\\s*"${module}"`,
        ),
      );
      // Imported AND rendered — an unused import states nothing.
      expect(
        src.split("SYMPTOMS_NOTE").length,
        `${path} imports SYMPTOMS_NOTE but never shows it`,
      ).toBeGreaterThan(2);
    }
    expect(
      stripComments(readRequired("app/reception/book/_components/desk-booking.tsx")),
      "the desk must reuse the web picker, not carry a second selector",
    ).toContain("symptom-picker");
  });

  it("the interstitial states the boundary and asks nothing", () => {
    const src = read("app/patient/book/_lib/booking.ts");
    const block = src.slice(src.indexOf("export const INTERSTITIAL"), src.indexOf("} as const"));
    // Static: no question, no input, no branch (ADR 0088).
    expect(block).toContain("Booking is for care that can wait.");
    expect(block).not.toContain("?");
  });
});

describe("ADR 0095 — a symptom at booking is descriptive, never decision support", () => {
  /**
   * The catalogue (`symptom_catalog`) carries decision-support flags for the
   * clerkship engine. A booking surface renders the catalogue FLAT — display,
   * synonyms, system, sort order — so none of these names may appear on one:
   * a selected flag is a ranking, and a ranking is triage.
   */
  const DECISION_SUPPORT_FLAGS =
    /\b(must_not_miss|mustNotMiss|uganda_flag|ugandaFlag|is_pain|isPain|ros_screen|rosScreen)\b/;

  it("no booking path selects or names a catalogue decision-support flag", () => {
    const targets = [
      ...BOOKING_PATHS,
      "app/patient/book/_components",
      "mobile/src/components/patient",
    ];
    for (const target of targets) {
      for (const [path, src] of sourcesAt(target)) {
        expect(stripComments(src), `${path} names a decision-support flag`).not.toMatch(
          DECISION_SUPPORT_FLAGS,
        );
      }
    }
  });

  /** The text between a call's parentheses, however deeply they nest. */
  function callArgs(src: string, open: number): string {
    let depth = 0;
    let i = open;
    do {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
      i++;
    } while (depth > 0 && i < src.length);
    return src.slice(open + 1, i - 1);
  }

  /**
   * Nothing on a booking, patient or staff surface orders or filters BOOKINGS
   * by what the patient said: no `.sort/.filter/.orderBy/.where(` whose
   * arguments name the booking field (`symptoms`) or the line built from it
   * (`complaint`). A selector filtering the CATALOGUE by search text names
   * neither and stays allowed.
   */
  it("no booking, patient or staff surface sorts or filters by symptoms or complaint", () => {
    for (const dir of [
      "lib/scheduling",
      "lib/patient",
      "lib/reception",
      "app/patient",
      "app/reception",
      "app/doctor",
      "app/clinician",
      "components/scheduling",
      "mobile/src",
    ]) {
      for (const [path, src] of sourcesUnder(dir)) {
        const code = stripComments(src);
        for (const m of code.matchAll(/\.(sort|filter|orderBy|where)\(/g)) {
          expect(
            callArgs(code, m.index + m[0].length - 1),
            `${path}: ${m[0]} names the complaint`,
          ).not.toMatch(/\b(complaint|symptoms)\b/);
        }
      }
    }
  });
});

describe("PRD §3.6 — a clinic day with no clinician is never offered as bookable", () => {
  /**
   * `_shared/book.ts` refuses such a day with a 409 ("This clinic day has no
   * clinician assigned yet."). Both browse surfaces used to offer it anyway,
   * gated only on places-left, so a patient tapped a day the server would
   * always refuse. The gate is the clinician ID, never the name: the name is a
   * left-joined `users.full_name` and is also null for a named clinician with
   * no name on file.
   */
  it("the booking core still refuses one — the rule the surfaces must mirror", () => {
    const core = read("supabase/functions/_shared/book.ts");
    expect(core).toContain("if (!session.clinician_user_id)");
    expect(core).toContain("This clinic day has no clinician assigned yet.");
  });

  it("the web tile disables on the clinician id, not on the name", () => {
    const src = read("app/patient/book/_components/pick-steps.tsx");
    expect(src).toContain("const unnamed = s.clinicianUserId === null;");
    expect(src).toContain("disabled: s.placesLeft === 0 || unnamed,");
    expect(src).not.toContain('"Clinic team"');
  });

  it("every 'takeable' predicate on both platforms goes through the one gate", () => {
    // Web: the gate is sessionTakeable(); nothing else may test places-left alone.
    expect(read("app/patient/book/_lib/booking.ts")).toContain(
      "return s.placesLeft > 0 && s.clinicianUserId !== null;",
    );
    for (const file of ["app/patient/book/_components/pick-steps.tsx", "lib/patient/discover.ts"]) {
      const src = stripComments(read(file));
      expect(src, file).toContain("sessionTakeable");
      expect(src, `${file} tests placesLeft without the clinician gate`).not.toMatch(
        /placesLeft\s*>\s*0(?![^;]*clinicianUserId)/,
      );
    }
    // Phone: the same predicate in the data layer, used by the home and the clinic screen.
    expect(read("mobile/src/lib/booking.ts")).toContain(
      "return s.placesLeft > 0 && s.clinicianUserId !== null;",
    );
    for (const file of [
      "mobile/src/app/(app)/(tabs)/index.tsx",
      "mobile/src/app/(app)/clinic/[id].tsx",
    ]) {
      const src = stripComments(read(file));
      expect(src, file).toContain("sessionTakeable(");
      expect(src, `${file} tests placesLeft without the clinician gate`).not.toMatch(
        /placesLeft\s*>\s*0(?![^;]*clinicianUserId)/,
      );
    }
  });
});
