import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  CatalogItem,
  CatalogPackage,
  SubmissionAudience,
} from "@/supabase/functions/_shared/symptom-catalog/types";
import { describe, expect, it } from "vitest";

import { catalogPackageSchema, emergencyContactSeedSchema } from "@/lib/symptom-catalog/schema";
import { TRIAGE_DISCRIMINATORS } from "@/lib/triage/discriminators";
import {
  CATALOG,
  CATALOG_CHECKSUM,
} from "@/supabase/functions/_shared/symptom-catalog/catalog.v0.1";
import { catalogChecksum } from "@/supabase/functions/_shared/symptom-catalog/checksum";

/**
 * The content package as shipped (PRD MS-PRD-SYM-001 Appendix A–C; ADR 0098
 * ruling 4): the JSON validates, the caps bite on bad fixtures, the generated
 * const has not drifted from the JSON, and the patient copy obeys the laws
 * (no drugs, doses, thresholds or reassurance). Pure file reads — no DB.
 */

const DIR = resolve(__dirname, "../../supabase/functions/_shared/symptom-catalog");
const readJson = (rel: string): unknown => JSON.parse(readFileSync(resolve(DIR, rel), "utf8"));

const pkg: CatalogPackage = {
  ...(readJson("catalog.v0.1.json") as Omit<CatalogPackage, "en">),
  en: readJson("i18n/en.json") as Record<string, string>,
};
const contacts = readJson("contacts.seed.json") as unknown[];

const clone = (): CatalogPackage => structuredClone(pkg);
const byKey = (key: string): CatalogItem => {
  const item = pkg.items.find((i) => i.key === key);
  if (!item) throw new Error(`missing ${key}`);
  return item;
};
const AUDIENCES: SubmissionAudience[] = [
  "adult",
  "child_u2m",
  "child_2m_5y",
  "child_5_12",
  "pregnant",
];

describe("catalog v0.1 — schema", () => {
  it("the shipped JSON validates", () => {
    const r = catalogPackageSchema.safeParse(pkg);
    expect(r.success, JSON.stringify(r.error?.issues, null, 2)).toBe(true);
  });

  it("a ninth item in one category view fails", () => {
    const bad = clone();
    const skin = bad.items.filter((i) => i.category === "skin" && i.audience.includes("all"));
    expect(skin.length).toBe(7);
    bad.items.push({ ...structuredClone(skin[0]!), key: "SYM.SKIN.EXTRA_ONE" });
    bad.en["item.SYM.SKIN.EXTRA_ONE.label"] = "Extra";
    expect(catalogPackageSchema.safeParse(bad).success).toBe(true); // 8 is the cap
    bad.items.push({ ...structuredClone(skin[0]!), key: "SYM.SKIN.EXTRA_TWO" });
    const r = catalogPackageSchema.safeParse(bad);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/skin\/adult shows 9 items/);
  });

  it("three qualifiers on one item fails", () => {
    const bad = clone();
    const wheeze = bad.items.find((i) => i.key === "SYM.CHEST.WHEEZE")!;
    const q = wheeze.qualifiers![0]!;
    wheeze.qualifiers = [q, { ...q, key: "q2" }, { ...q, key: "q3" }];
    expect(catalogPackageSchema.safeParse(bad).success).toBe(false);
  });

  it("a ten-word label fails", () => {
    const bad = clone();
    bad.en["item.SYM.SKIN.ITCHY_RASH.label"] = "one two three four five six seven eight nine ten";
    const r = catalogPackageSchema.safeParse(bad);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/over 9 words/);
  });

  it("an E item without sourceRefs fails; an R item without is fine", () => {
    const bad = clone();
    bad.items.find((i) => i.key === "SYM.HEAD.FIT")!.sourceRefs = [];
    expect(catalogPackageSchema.safeParse(bad).success).toBe(false);
    const ok = clone();
    ok.items.find((i) => i.key === "SYM.BONES.JOINT_PAIN")!.sourceRefs = [];
    expect(catalogPackageSchema.safeParse(ok).success).toBe(true);
  });

  it("a dangling source, i18n key or rule reference fails", () => {
    const s = clone();
    s.items[0]!.sourceRefs = ["NOT_A_SOURCE"];
    expect(catalogPackageSchema.safeParse(s).success).toBe(false);
    const e = clone();
    e.items[0]!.labelKey = "item.nope.label";
    expect(catalogPackageSchema.safeParse(e).success).toBe(false);
    const r = clone();
    const r3 = r.rules.rules.find((x) => x.kind === "audience_modifier")!;
    if (r3.kind === "audience_modifier") r3.when.anyOf.push("SYM.NOPE.X");
    expect(catalogPackageSchema.safeParse(r).success).toBe(false);
  });

  it("only the review affordance may have an empty audience", () => {
    const empty = pkg.items.filter((i) => i.audience.length === 0).map((i) => i.key);
    expect(empty).toEqual(["SYM.NCD.ROUTINE_REVIEW"]);
  });
});

describe("catalog v0.1 — generated const and checksum", () => {
  it("catalog.v0.1.ts equals the JSON and its checksum matches", () => {
    expect(CATALOG).toEqual(pkg);
    expect(CATALOG_CHECKSUM).toBe(catalogChecksum(pkg));
  });

  it("the checksum is canonical (key order) and sensitive (content)", () => {
    expect(catalogChecksum({ a: 1, b: [1, { d: 2, c: 3 }] })).toBe(
      catalogChecksum({ b: [1, { c: 3, d: 2 }], a: 1 }),
    );
    const drifted = clone();
    drifted.en["tier.E"] = "Get help now!";
    expect(catalogChecksum(drifted)).not.toBe(CATALOG_CHECKSUM);
  });
});

describe("catalog v0.1 — Appendix A as data", () => {
  it("counts: at least 85 items, every category populated", () => {
    expect(pkg.items.length).toBeGreaterThanOrEqual(85);
    const perTier: Record<string, number> = {};
    const perCategory: Record<string, Record<string, number>> = {};
    for (const i of pkg.items) {
      perTier[i.tier] = (perTier[i.tier] ?? 0) + 1;
      const c = (perCategory[i.category] ??= {});
      c[i.tier] = (c[i.tier] ?? 0) + 1;
    }
    for (const c of pkg.categories) expect(perCategory[c.key], c.key).toBeDefined();
    // Surfaced for the build report (numbers, not a claim).
    process.stdout.write(
      `symptom-catalog counts: total=${pkg.items.length} ${JSON.stringify(perTier)} ${JSON.stringify(perCategory)}\n`,
    );
  });

  it("every E/U item cites at least one source that resolves", () => {
    for (const i of pkg.items) {
      if (i.tier === "R") continue;
      expect(i.sourceRefs.length, i.key).toBeGreaterThan(0);
      for (const s of i.sourceRefs) expect(pkg.sources[s], `${i.key} → ${s}`).toBeTruthy();
    }
  });

  it("every audience's landing strip has exactly 4 danger signs, all E", () => {
    for (const a of AUDIENCES) {
      const strip = pkg.items.filter((i) => i.dangerSignFor?.includes(a));
      expect(
        strip.map((i) => i.key),
        a,
      ).toHaveLength(4);
      for (const i of strip) expect(i.tier, i.key).toBe("E");
    }
  });

  it("qualifiers sit exactly where the table says, with the escalations it names", () => {
    const escalates = (key: string, q: string, opt: string) =>
      byKey(key)
        .qualifiers?.find((x) => x.key === q)
        ?.options.find((o) => o.key === opt)?.escalatesTo;
    expect(escalates("SYM.CHEST.WHEEZE", "can_speak", "no")).toBe("E");
    expect(escalates("SYM.HEAD.RECURRING_HEADACHES", "sudden_worst", "yes")).toBe("E");
    expect(escalates("SYM.MOOD.DIZZY", "chest_pain_or_fainting", "yes")).toBe("E");
    expect(escalates("SYM.MOOD.HEART_RACING", "chest_pain_or_fainting", "yes")).toBe("E");
    const breathless = byKey("SYM.CHEST.BREATHLESS_WALKING_LYING");
    expect(breathless.qualifiers?.[0]?.key).toBe("legs_swelling");
    expect(breathless.serviceLineHint).toBe("cardiology");
    expect(
      pkg.items
        .filter((i) => i.qualifiers?.length)
        .map((i) => i.key)
        .sort(),
    ).toEqual([
      "SYM.CHEST.BREATHLESS_WALKING_LYING",
      "SYM.CHEST.WHEEZE",
      "SYM.HEAD.RECURRING_HEADACHES",
      "SYM.MOOD.DIZZY",
      "SYM.MOOD.HEART_RACING",
    ]);
  });

  it("flags and forward token references are where the PRD puts them", () => {
    expect(byKey("SYM.FEVER.WITH_BLEEDING").flags).toEqual(["isolation"]);
    expect(byKey("SYM.HEAD.FACE_DROOPING").flags).toEqual(["stroke_time"]);
    expect(byKey("SYM.MOOD.SELF_HARM").flags).toEqual(["crisis_route"]);
    expect(byKey("SYM.MOOD.SEXUAL_VIOLENCE").flags).toEqual(["sv_route"]);
    expect(byKey("SYM.BONES.MORNING_STIFFNESS").reasoningTokenRef).toBe("TOK.MORNING_STIFFNESS_30");
    expect(byKey("SYM.MOOD.ALCOHOL_DRUG_USE").reasoningTokenRef).toBe("TOK.STIMULANT_DRUG_USE");
    expect(pkg.items.filter((i) => i.reasoningTokenRef !== null)).toHaveLength(2);
  });

  it("every triageDiscriminatorRef is a real lib/triage code, and never a numeric one", () => {
    const codes = new Set(TRIAGE_DISCRIMINATORS.map((d) => d.code));
    const numeric = /spo2|glucose|shock_index|hypertension|htn|diastolic|map_/;
    for (const i of pkg.items) {
      if (i.triageDiscriminatorRef === null) continue;
      expect(codes.has(i.triageDiscriminatorRef), `${i.key} → ${i.triageDiscriminatorRef}`).toBe(
        true,
      );
      expect(i.triageDiscriminatorRef).not.toMatch(numeric);
    }
  });

  it("rules: R1–R7 present; R3 covers the infant, pregnancy and IMCI rows; R4 is fever × bleeding → isolation", () => {
    const ids = pkg.rules.rules.map((r) => r.id);
    for (const id of ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]) expect(ids).toContain(id);
    const r3 = pkg.rules.rules.filter((r) => r.kind === "audience_modifier");
    const forAudience = (a: SubmissionAudience) =>
      r3.filter((r) => r.kind === "audience_modifier" && r.when.audience === a);
    expect(
      forAudience("child_u2m").some(
        (r) => r.kind === "audience_modifier" && r.when.anyOf.includes("SYM.CHILD.FEVER"),
      ),
    ).toBe(true);
    expect(
      forAudience("pregnant").some(
        (r) => r.kind === "audience_modifier" && r.when.anyOf.includes("SYM.FEVER.PREG_FEVER_WEAK"),
      ),
    ).toBe(true);
    for (const a of ["child_u2m", "child_2m_5y", "child_5_12"] as const) {
      expect(
        forAudience(a).some(
          (r) =>
            r.kind === "audience_modifier" &&
            r.when.anyOf.includes("SYM.BELLY.VOMITING_EVERYTHING"),
        ),
        a,
      ).toBe(true);
    }
    const r4 = pkg.rules.rules.find((r) => r.kind === "combination");
    expect(r4?.kind === "combination" && r4.flags).toEqual(["isolation"]);
    expect(r4?.kind === "combination" && r4.tier).toBe("E");
  });

  it("audience: child items are child bands, pregnancy items pregnant, heavy bleeding adult+pregnant", () => {
    for (const i of pkg.items.filter((i) => i.category === "child_illness")) {
      expect(
        i.audience.every((a) => a.startsWith("child_")),
        i.key,
      ).toBe(true);
    }
    for (const i of pkg.items.filter((i) => i.key.includes(".PREG_"))) {
      expect(i.audience, i.key).toEqual(["pregnant"]);
    }
    expect(byKey("SYM.URINE.HEAVY_VAGINAL_BLEEDING").audience).toEqual(["adult", "pregnant"]);
    expect(byKey("SYM.NCD.ROUTINE_REVIEW").helperKey).toBeDefined();
  });
});

describe("catalog v0.1 — patient copy laws", () => {
  const BANNED =
    /\b(mg|ml|mmol|tablet|dose|paracetamol|amoxicillin|not serious|you can wait|nothing to worry|probably|likely)\b/i;

  it("no drug, dose, threshold or reassurance in any string", () => {
    for (const [k, v] of Object.entries(pkg.en)) expect(v, k).not.toMatch(BANNED);
  });

  it("tier labels and the boundary sentence are the PRD's", () => {
    expect(pkg.en["tier.E"]).toBe("Get help now");
    expect(pkg.en["tier.U"]).toBe("Be seen today");
    expect(pkg.en["tier.R"]).toBe("Book a visit");
    expect(pkg.en["catalog.note"]).toBe(
      "This does not replace a clinician. If it gets worse or you notice any danger sign, tap Emergency.",
    );
  });
});

describe("emergency contacts seed — Appendix B", () => {
  it("every row validates and carries the PRD's verification status", () => {
    const rows = contacts.map((c) => emergencyContactSeedSchema.parse(c));
    const status = Object.fromEntries(rows.map((r) => [r.key, [r.number, r.verificationStatus]]));
    expect(status["UG.NATIONAL.112"]).toEqual(["112", "unverified"]);
    expect(status["UG.NATIONAL.999"]).toEqual(["999", "unverified"]);
    expect(status["UG.NATIONAL.912"]).toEqual(["912", "unverified"]);
    expect(status["UG.KAMPALA.KCCA_AMBULANCE"]).toEqual(["0800 299 000", "unverified"]);
    for (const k of ["UG.NATIONAL.RED_CROSS_HIGHWAY", "UG.NATIONAL.CRISIS", "UG.NATIONAL.SV"]) {
      expect(status[k], k).toEqual([null, "to_source"]);
    }
    expect(rows.some((r) => r.verificationStatus === "verified")).toBe(false);
  });
});
