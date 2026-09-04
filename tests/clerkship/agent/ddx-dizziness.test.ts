import type { AgentInput, FeatureIndex } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { loadAgentPacks } from "@/lib/clerkship/agent/packs";
import { suggestDiagnoses } from "@/lib/clerkship/agent/reducers/diagnosis";

const EMPTY: AgentInput = {
  hpcItems: [],
  ros: [],
  pmhItems: [],
  pmhScreen: {},
  examVitals: {},
  bpStandard: {} as AgentInput["bpStandard"],
  examGeneralFindings: [],
  examRespiratory: {},
  examCardiovascular: {},
  examAbdominal: {},
  examNeurological: {},
  examMusculoskeletal: {},
  examEndoVascularFoot: {},
};

const maps = () => loadAgentPacks().rankedMaps;
const idx = (present: string[]): FeatureIndex => ({
  presentDisplays: new Set(present.map((p) => p.toLowerCase())),
  deniedDisplays: new Set(),
  complaintCodes: new Set(["dizziness"]),
  provenance: new Map(),
});
const run = (present: string[]) =>
  suggestDiagnoses(EMPTY, idx(present), maps(), { ranked: true, demographics: undefined });
const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

describe("dizziness — wired sourced weights", () => {
  it("loads the expanded differential incl. new dx (anaemia, ototoxicity, malaria, crypto, AS, PPPD)", () => {
    const out = run([]);
    expect(out.length).toBeGreaterThanOrEqual(15);
    expect(byDx(out, "Anaemia")).toBeTruthy();
    expect(byDx(out, "Drug-induced dizziness / vestibular ototoxicity")).toBeTruthy();
    expect(byDx(out, "Malaria")).toBeTruthy();
    expect(byDx(out, "Cryptococcal meningitis")).toBeTruthy();
    expect(byDx(out, "Aortic stenosis / structural outflow obstruction")).toBeTruthy();
    expect(byDx(out, "Persistent postural-perceptual dizziness / anxiety")).toBeTruthy();
  });

  // The dizziness map phrases every discriminator in prose the catalog never
  // captures; these assert the alias bridge (dizz_* / ros_dizziness_* displays).
  it("alias bridge: catalog displays drive the ranking, not the map's prose", () => {
    const bppv = run(["seconds, positional", "vertigo (spinning)"]);
    expect(byDx(bppv, "BPPV")?.tier).toBe("leading");
    // the same capture must push the central cause DOWN, not just BPPV up
    expect(byDx(bppv, "Posterior-circulation stroke / TIA (central)")?.tier).toBe("ruled_down");
    // brief positional attacks are not vestibular migraine (5 min–72 h episodes)
    expect(byDx(bppv, "Vestibular migraine")?.tier).not.toBe("leading");

    const central = run(["days, continuous", "focal neurology"]);
    expect(byDx(central, "Posterior-circulation stroke / TIA (central)")?.tier).toBe("leading");
    // continuous vertigo alone looks like neuritis — focal signs must demote it
    expect(byDx(central, "Vestibular neuritis / labyrinthitis")?.tier).not.toBe("leading");
  });

  it("stroke / arrhythmia / hypoglycaemia stay UNCONDITIONAL must-not-miss", () => {
    const out = run([]);
    expect(byDx(out, "Posterior-circulation stroke / TIA (central)")?.suggests?.mustNotMiss).toBe(
      true,
    );
    expect(byDx(out, "Cardiac arrhythmia (presyncope)")?.suggests?.mustNotMiss).toBe(true);
    expect(byDx(out, "Hypoglycaemia")?.suggests?.mustNotMiss).toBe(true);
  });

  it("conditional pins: anaemia (pallor), malaria (fever), crypto (HIV), AS (exertional)", () => {
    const anaemia = "Anaemia";
    expect(byDx(run([]), anaemia)?.suggests?.mustNotMiss).toBe(false);
    // reaches the pin through the existing pallor → 'conjunctival pallor' alias
    expect(byDx(run(["conjunctival pallor"]), anaemia)?.suggests?.mustNotMiss).toBe(true);

    const malaria = "Malaria";
    expect(byDx(run([]), malaria)?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["fever"]), malaria)?.suggests?.mustNotMiss).toBe(true);

    const crypto = "Cryptococcal meningitis";
    expect(byDx(run([]), crypto)?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["HIV"]), crypto)?.suggests?.mustNotMiss).toBe(true);

    const as = "Aortic stenosis / structural outflow obstruction";
    expect(byDx(run([]), as)?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["exertion"]), as)?.suggests?.mustNotMiss).toBe(true);
  });

  // Endemic residence is near-universal in Uganda: pinning malaria on it would
  // fire for every dizzy patient, so the pin gates on fever / a recorded dx.
  it("malaria pin does NOT fire on endemic residence alone (anti alarm-flood)", () => {
    expect(byDx(run(["malaria-endemic residence/travel"]), "Malaria")?.suggests?.mustNotMiss).toBe(
      false,
    );
  });

  it("Uganda calibration: pallor + presyncope makes anaemia leading, but not malaria", () => {
    const out = run(["conjunctival pallor", "pre-syncope (about to faint)"]);
    expect(byDx(out, "Anaemia")?.tier).toBe("leading");
    // pallor is shared ground: malaria must not lead in an afebrile patient
    expect(byDx(out, "Malaria")?.tier).not.toBe("leading");
  });

  it("hearing loss + tinnitus + unsteady surfaces ototoxicity (the DR-TB blind spot)", () => {
    const out = run(["hearing loss", "tinnitus", "disequilibrium (unsteady)"]);
    expect(byDx(out, "Drug-induced dizziness / vestibular ototoxicity")?.tier).toBe("leading");
  });

  // PPPD is a diagnosis of exclusion — it must never outrank a central cause.
  it("PPPD is ruled down whenever focal neurology is present", () => {
    const out = run(["days, continuous", "focal neurology"]);
    expect(byDx(out, "Persistent postural-perceptual dizziness / anxiety")?.tier).toBe(
      "ruled_down",
    );
  });
});
