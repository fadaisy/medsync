import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EmergencyDrug } from "@/lib/prescribing/reference/emergency-drug-catalog";
import type { RefEntry } from "@/lib/resus/reference/ref";
import { describe, expect, it } from "vitest";

import { runSafetyChecks } from "@/lib/prescribing/engine";
import {
  EMERGENCY_DRUGS,
  getEmergencyDrug,
} from "@/lib/prescribing/reference/emergency-drug-catalog";
import * as alsModule from "@/lib/resus/reference/als-catalog";
import * as deathModule from "@/lib/resus/reference/death-confirmation";
import * as levelsModule from "@/lib/resus/reference/levels-of-care";
import * as postRoscModule from "@/lib/resus/reference/post-rosc-catalog";
import * as presentationModule from "@/lib/resus/reference/presentation";
import { indexRefs, PENDING_CSO, refValue } from "@/lib/resus/reference/ref";
import { VITAL_REFERENCE, vitalBand } from "@/lib/resus/vital-trend";

/**
 * GATE A §10 item 4 — Law 3 (no remembered numbers). Every v2 reference entry
 * is signed, sourced, linked and dated; the UI reads numbers only through
 * refValue, which withholds any unsigned entry; NOT ENCODED items never carry a
 * number; and the pre-v2 pending items (GATE A §6) are listed and pinned.
 */

const MODULES: Record<string, Record<string, unknown>> = {
  "als-catalog": alsModule,
  "death-confirmation": deathModule,
  "post-rosc-catalog": postRoscModule,
  "levels-of-care": levelsModule,
  presentation: presentationModule,
};

const isRef = (x: unknown): x is RefEntry =>
  typeof x === "object" && x !== null && "id" in x && "status" in x && "verifiedOn" in x;

/** Every RefEntry a module exports, in an array or an id-keyed record. */
const exportedRefs = (mod: Record<string, unknown>): RefEntry[] =>
  Object.values(mod).flatMap((v) =>
    Array.isArray(v)
      ? v.filter(isRef)
      : v && typeof v === "object"
        ? Object.values(v).filter(isRef)
        : [],
  );

/** All v2 reference entries, once each (ALS_REFS repeats ALS_CATALOG + DTH). */
const V2_REFS: RefEntry[] = [...new Set(Object.values(MODULES).flatMap(exportedRefs))];

const validIsoDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

const rowIds = (path: string, prefix: string) =>
  [
    ...readFileSync(join(process.cwd(), path), "utf8").matchAll(
      new RegExp(`^\\|\\s*(${prefix}-[A-Z0-9]+(?:-[A-Z0-9]+)?)\\s*\\|`, "gm"),
    ),
  ].map((m) => m[1]!);

/** Everything wrong with one entry, as "ID: problem" strings. */
function problems(e: RefEntry, today: string): string[] {
  const out: string[] = [];
  if (e.status !== "signed") out.push("not signed");
  if (!/^https:\/\/\S+$/.test(e.url) && !/^docs\/clinical\/resus-[a-z-]+\.md$/.test(e.url))
    out.push(`url ${JSON.stringify(e.url)}`);
  if (e.confidence === "verified-web" && !e.url.startsWith("https://"))
    out.push("verified-web without a web url");
  if (!validIsoDate(e.verifiedOn) || e.verifiedOn > today) out.push(`verifiedOn ${e.verifiedOn}`);
  if (!e.source.trim()) out.push("no source code");
  if (!e.text.trim()) out.push("no text");
  return out.map((p) => `${e.id}: ${p}`);
}

describe("Law 3 — every v2 reference entry is signed, sourced, linked and dated", () => {
  it("the four v2 reference modules export entries; presentation.ts exports none", () => {
    // Presentation metadata carries codes and rule IDs, no numbers (GATE A §3).
    for (const [name, mod] of Object.entries(MODULES))
      expect(exportedRefs(mod).length > 0, name).toBe(name !== "presentation");
  });

  it("each entry: status signed, https or catalog url, ISO verifiedOn, source and text", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(V2_REFS.flatMap((e) => problems(e, today))).toEqual([]);
  });

  it("the shape check catches a pending, unlinked, undated, unsourced entry", () => {
    const e = {
      ...V2_REFS[0]!,
      status: "pending_cso",
      url: "",
      verifiedOn: "23/09/2026",
      source: " ",
    };
    expect(problems(e as RefEntry, "2026-09-23")).toHaveLength(4);
  });

  it("IDs are unique across all v2 references", () => {
    const ids = V2_REFS.map((e) => e.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(() => indexRefs(V2_REFS)).not.toThrow();
  });

  it("every reference ID is a row of its signed catalog (no number without a row)", () => {
    const rows = new Set([
      ...rowIds("docs/clinical/resus-als-clinical-catalog.md", "ALS"),
      ...rowIds("docs/clinical/resus-post-rosc-clinical-catalog.md", "PR"),
      ...rowIds("docs/clinical/resus-closeout-clinical-catalog.md", "CO"),
    ]);
    expect(V2_REFS.filter((e) => !rows.has(e.id)).map((e) => e.id)).toEqual([]);
  });
});

describe("refValue — the only way a number reaches the screen", () => {
  it("a signed entry shows its value, or its text when it carries no number", () => {
    for (const e of V2_REFS) expect(refValue(e), e.id).toBe(e.value ?? e.text);
  });

  it("a pending entry shows the pending marker, never its value", () => {
    const pending: RefEntry = { ...V2_REFS[0]!, value: "999", status: "pending_cso" };
    expect(refValue(pending)).toBe(PENDING_CSO);
    expect(refValue({ ...pending, value: undefined })).toBe(PENDING_CSO);
    expect(refValue({ ...pending, status: "signed" })).toBe("999");
  });
});

/**
 * ALS catalog §11 (+ ALS-ADR-06, PR-D-02): items that must never reach the screen
 * as a number. Each item pins EVERY v2 entry whose text mentions it, with the
 * entry's whole value: undefined (no number), or the signed Value cell of a row
 * whose number is about something else (ALS-DRG-04's 60–90 min CPR clock sits
 * beside "thrombolytic doses NOT ENCODED"). A new mention, or a changed value on
 * a mentioning entry, fails until a reviewer re-pins it.
 */
type Pins = Record<string, string | undefined>;
const NOT_ENCODED: [item: string, mention: RegExp, pinned: Pins][] = [
  [
    "thrombolytic doses",
    /thromboly/i,
    { "ALS-DRG-04": "60–90", "ALS-RC-05": undefined, "ALS-MOD-11": "60–90" },
  ],
  ["calcium gluconate as an arrest substitute (D17)", /gluconate/i, {}],
  [
    "hysterotomy minute target (D12)",
    /hysterotomy/i,
    { "ALS-MOD-07": undefined, "ALS-TOR-07": undefined },
  ],
  [
    "sedation doses",
    /sedat/i,
    { "ALS-DRG-03": undefined, "PR-A-01": undefined, "PR-D-03": undefined },
  ],
  [
    "ECPR criteria (capability-gated, off)",
    /ECPR/,
    { "ALS-DEV-01": "capability flags", "ALS-MOD-01": "< 30" },
  ],
  ["magnesium for torsades", /magnesium|torsades/i, {}],
  ["small-increment adrenaline in a monitored arrest", /increment/i, { "ALS-ADR-06": undefined }],
  [
    "vasopressor / inotrope infusion rates",
    /infusion|inotrope|noradrenaline|dobutamine/i,
    { "PR-C-03": undefined, "CO-R9": "2 IM doses", "CO-R10": "GCS ≤ 8" },
  ],
  ["paediatric doses and energies", /paediatric|child|PLS/i, { "ALS-MOD-16": "< 16" }],
  [
    "a post-ROSC glucose number (PR-D-02)",
    /glucose/i,
    {
      "PR-D-02": undefined,
      "PR-PIN-D": "Obeys commands? · glucose · seizures (levetiracetam / valproate)",
    },
  ],
];

describe("NOT ENCODED items never carry a number", () => {
  it.each(NOT_ENCODED)(
    "%s: every mentioning entry is pinned, value as signed",
    (_, mention, pinned) => {
      const mentioning = V2_REFS.filter((e) => mention.test(e.text));
      expect(mentioning.map((e) => e.id).sort()).toEqual(Object.keys(pinned).sort());
      for (const e of mentioning) expect(e.value, e.id).toBe(pinned[e.id]);
    },
  );

  it("no v2 value or unit names a NOT ENCODED drug or procedure", () => {
    const leak = /thromboly|alteplase|tenecteplase|gluconate|magnesium|sedat|hysterotomy|ECPR/i;
    expect(V2_REFS.filter((e) => leak.test(`${e.value ?? ""} ${e.unit ?? ""}`))).toEqual([]);
  });

  it("energy: the only joule number is the profile-entry reference row; no profile → text", () => {
    const joules = V2_REFS.filter((e) => /\d\s*J\b/.test(`${e.value ?? ""} ${e.unit ?? ""}`));
    expect(joules.map((e) => e.id)).toEqual(["ALS-NRG-03"]);
    expect(refValue(alsModule.ALS_REFS["ALS-NRG-02"]!)).toBe("highest available setting");
  });
});

/**
 * GATE A §6 — pre-existing (pre-v2) exceptions to Law 3, by ID; each fact is
 * pinned below so the list cannot go stale. inGateA: false = found by this test
 * (same by-design record-only status as flumazenil), not named in GATE A §6.
 */
const KNOWN_PRE_EXISTING_PENDING = [
  { id: "flumazenil_iv", adr: "0051", inGateA: true }, // needs-CSO-verification, no dose
  { id: "rsi_induction_agent", adr: "0051", inGateA: false }, // needs-CSO-verification, no dose
  { id: "rsi_neuromuscular_blocker", adr: "0051", inGateA: false }, // same
  { id: "doseRangeMg-band-widths", adr: "0054", inGateA: true }, // 1.5× warn / 3× egregious
  { id: "vital-band:diastolicBp", adr: "0058", inGateA: true }, // no danger band
  { id: "vital-band:etco2", adr: "0058", inGateA: true }, // no danger band
] as const;

const listed = (id: string) => KNOWN_PRE_EXISTING_PENDING.some((k) => k.id === id);

describe("KNOWN_PRE_EXISTING_PENDING stays honest", () => {
  it("flumazenil is still needs-CSO-verification with no dose; every such drug is listed", () => {
    const flumazenil = getEmergencyDrug("flumazenil_iv");
    expect(flumazenil?.confidence).toBe("needs-CSO-verification");
    const pending = (EMERGENCY_DRUGS as readonly EmergencyDrug[]).filter(
      (d) => d.confidence === "needs-CSO-verification",
    );
    expect(pending.map((d) => d.id).filter((id) => !listed(id))).toEqual([]);
    for (const d of pending) expect(d.adult, d.id).toBeNull();
  });

  it("doseRangeMg band widths as described (ADR 0054): amiodarone 150–300 mg", () => {
    const drug = getEmergencyDrug("amiodarone_arrest_iv")!;
    expect(drug.doseRangeMg).toEqual({ low: 150, high: 300 });
    const flag = (doseMg: number) =>
      runSafetyChecks({
        drug,
        patient: { ageYears: 40, weightKg: 70, allergies: [], conditions: [] },
        priorAdministrations: [],
        edit: { doseMg },
      }).find((f) => f.code === "dose_range");
    expect(flag(300)).toBeUndefined();
    expect(flag(450)?.severity).toBe("warn");
    expect(flag(451)).toMatchObject({ severity: "block" });
    expect(flag(451)?.egregious).toBeUndefined();
    expect(flag(900)).toMatchObject({ severity: "block", egregious: true });
    expect(listed("doseRangeMg-band-widths")).toBe(true);
  });

  it("DBP and EtCO₂ still have no danger band — neutral by design (ADR 0058)", () => {
    for (const key of ["diastolicBp", "etco2"]) {
      expect(VITAL_REFERENCE[key], key).toBeUndefined();
      expect([vitalBand(key, 1), vitalBand(key, 500)]).toEqual(["normal", "normal"]);
      expect(listed(`vital-band:${key}`)).toBe(true);
    }
  });
});
