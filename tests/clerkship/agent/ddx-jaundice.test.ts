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
  complaintCodes: new Set(["jaundice"]),
  provenance: new Map(),
});
const run = (present: string[]) =>
  suggestDiagnoses(EMPTY, idx(present), maps(), { ranked: true, demographics: undefined });
const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

describe("jaundice — wired sourced weights", () => {
  it("loads the expanded differential incl. new dx (HCC, DILI, leptospirosis, yellow fever)", () => {
    const out = run([]);
    expect(out.length).toBeGreaterThanOrEqual(13);
    expect(byDx(out, "Hepatocellular carcinoma (HBV-related)")).toBeTruthy();
    expect(byDx(out, "Drug-induced liver injury (DILI)")).toBeTruthy();
    expect(byDx(out, "Leptospirosis (Weil's disease)")).toBeTruthy();
    expect(byDx(out, "Yellow fever")).toBeTruthy();
  });

  it("colicky RUQ pain + pale stools/dark urine → gallstones leading", () => {
    const out = run(["right upper quadrant pain", "pale stools / dark urine", "colicky"]);
    expect(byDx(out, "Gallstones (obstructive)")?.tier).toBe("leading");
  });

  it("cholangitis / malignancy / acute liver failure stay UNCONDITIONAL must-not-miss", () => {
    const out = run([]);
    expect(byDx(out, "Ascending cholangitis")?.suggests?.mustNotMiss).toBe(true);
    expect(byDx(out, "Pancreatic / biliary malignancy")?.suggests?.mustNotMiss).toBe(true);
    expect(byDx(out, "Acute liver failure / fulminant hepatitis")?.suggests?.mustNotMiss).toBe(
      true,
    );
  });

  it("HCC + DILI conditionally pinned on their risk populations", () => {
    expect(byDx(run([]), "Hepatocellular carcinoma (HBV-related)")?.suggests?.mustNotMiss).toBe(
      false,
    );
    expect(
      byDx(run(["hepatitis b/c"]), "Hepatocellular carcinoma (HBV-related)")?.suggests?.mustNotMiss,
    ).toBe(true);
    expect(byDx(run([]), "Drug-induced liver injury (DILI)")?.suggests?.mustNotMiss).toBe(false);
    expect(
      byDx(run(["tuberculosis"]), "Drug-induced liver injury (DILI)")?.suggests?.mustNotMiss,
    ).toBe(true);
  });

  it("febrile causes (severe malaria, leptospirosis, yellow fever) pin only with fever", () => {
    expect(byDx(run([]), "Severe malaria / sickle haemolytic crisis")?.suggests?.mustNotMiss).toBe(
      false,
    );
    expect(
      byDx(run(["fever"]), "Severe malaria / sickle haemolytic crisis")?.suggests?.mustNotMiss,
    ).toBe(true);
    expect(byDx(run(["fever"]), "Yellow fever")?.suggests?.mustNotMiss).toBe(true);
  });
});
