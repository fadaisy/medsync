/**
 * Phase 3 mutation tests: every safety item is load-bearing. Removing any acute-route rule,
 * any red therapy flag or any blocking validity caveat must change the result of at least one
 * golden patient; an item no patient notices is untested, whatever the parity score says.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DiabetesPack, PackInput, PackValues } from "@/lib/ncd/pack/types";
import { describe, expect, it } from "vitest";

import { diabetesPack } from "@/lib/ncd/pack";
import { runProtocol } from "@/lib/ncd/pack/engine";

interface Vignette {
  id: string;
  site: "referral" | "district";
  established: boolean;
  ageBand: PackInput["ageBand"];
  values: PackValues;
}
const VIGNETTES = (
  JSON.parse(readFileSync(join(__dirname, "fixtures", "diabetes-pack-vignettes.json"), "utf8")) as {
    vignettes: Vignette[];
  }
).vignettes;
const P = diabetesPack();
const signature = (pack: DiabetesPack) =>
  VIGNETTES.map((v) => {
    const r = runProtocol(pack, {
      values: v.values,
      site: v.site,
      established: v.established,
      ageBand: v.ageBand,
    });
    return JSON.stringify([
      r.fired,
      r.urgency,
      r.caveats,
      r.diagnosis,
      r.bandsBlocked,
      r.blockedCriteria,
      r.gaps,
    ]);
  });
const BASE = signature(P);
const noticed = (pack: DiabetesPack) => signature(pack).some((s, i) => s !== BASE[i]);

describe("every safety item is noticed by at least one golden patient", () => {
  const acute = P.rules.filter((r) => r.x.lane === "acute_route").map((r) => r.id);
  const red = P.therapyFlags.filter((f) => f.severity === "red").map((f) => f.id);
  const blocking = P.validityCaveats.filter((c) => c.blocksDiagnosis).map((c) => c.id);

  it("acute-route rules", () => {
    expect(
      acute.filter((id) => !noticed({ ...P, rules: P.rules.filter((r) => r.id !== id) })),
    ).toEqual([]);
  });
  it("red therapy flags", () => {
    expect(
      red.filter(
        (id) => !noticed({ ...P, therapyFlags: P.therapyFlags.filter((f) => f.id !== id) }),
      ),
    ).toEqual([]);
  });
  it("blocking validity caveats", () => {
    expect(
      blocking.filter(
        (id) => !noticed({ ...P, validityCaveats: P.validityCaveats.filter((c) => c.id !== id) }),
      ),
    ).toEqual([]);
  });
});
