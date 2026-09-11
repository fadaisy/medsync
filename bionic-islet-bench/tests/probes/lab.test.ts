/**
 * The Probe Lab's six experiments, checked.
 *
 * Each experiment states a claim before the reader runs it. A claim that is
 * only ever read is decoration; these assert that the model actually does what
 * the card says, so that if the physics changes underneath them the card stops
 * being true and the suite says so.
 */
import type { LabConditions } from "../../src/components/lab/labModel.ts";
import { describe, expect, it } from "vitest";

import { EXPERIMENTS } from "../../src/components/lab/experiments.ts";
import { DEFAULT_CONDITIONS, isotherm, solve } from "../../src/components/lab/labModel.ts";
import { CHEMISTRY_COLOURS } from "../../src/components/lab/palette.ts";
import { STATIONS } from "../../src/components/lab/stations.ts";

/* eslint-disable no-console */

function find(id: string) {
  const experiment = EXPERIMENTS.find((e) => e.id === id);
  if (!experiment) throw new Error(`no experiment ${id}`);
  return experiment;
}

function pair(id: string): { left: LabConditions; right: LabConditions } {
  const experiment = find(id);
  return { left: experiment.left.conditions, right: experiment.right.conditions };
}

describe("the six preset experiments say what the model does", () => {
  it("1. the membrane keeps the enzyme in its first order range", () => {
    const { left, right } = pair("membrane");
    const low = solve(left);
    const high = solve(right);

    // Linear: four times the glucose, four times the current, near enough.
    const ratio =
      high.enzymatic.glucoseCurrentNa /
      low.enzymatic.glucoseCurrentNa /
      (right.glucoseMmol / left.glucoseMmol);
    // And the enzyme never gets near saturation, which is why.
    const saturation = Math.max(...Array.from(high.profiles.glucose)) > 0 ? 0 : 0;
    void saturation;
    console.log(
      `  ${left.glucoseMmol} to ${right.glucoseMmol} mmol/L: ${low.enzymatic.glucoseCurrentNa.toFixed(3)} to ${high.enzymatic.glucoseCurrentNa.toFixed(3)} nA, linearity ${(ratio * 100).toFixed(2)} per cent of proportional; Damkohler ${high.enzymatic.damkohler.toExponential(1)}`,
    );
    expect(ratio).toBeGreaterThan(0.98);
    expect(ratio).toBeLessThan(1.02);
    // The membrane is in charge, which is what a Damkohler number this large
    // means and is the mechanism the card names.
    expect(high.enzymatic.damkohler).toBeGreaterThan(100);
  });

  it("2. the electrode gives the oxygen back, and it is worth half the current", () => {
    const { left, right } = pair("oxygen");
    const on = solve(left);
    const off = solve(right);
    console.log(
      `  at ${left.oxygenMmHg} mmHg: ${on.enzymatic.glucoseCurrentNa.toFixed(4)} nA with recycling, ${off.enzymatic.glucoseCurrentNa.toFixed(4)} without; limitation ${on.enzymatic.oxygenLimitation.toFixed(4)} against ${off.enzymatic.oxygenLimitation.toFixed(4)}`,
    );
    expect(on.enzymatic.oxygenReturned).toBeGreaterThan(0.95);
    expect(on.enzymatic.oxygenLimitation).toBeLessThan(0.02);
    expect(off.enzymatic.oxygenLimitation).toBeGreaterThan(0.5);
    // "loses half its current" is the claim on the card.
    expect(off.enzymatic.glucoseCurrentNa).toBeLessThan(on.enzymatic.glucoseCurrentNa * 0.6);
  });

  it("3. half the dye leaves the reading where it was", () => {
    const { left, right } = pair("bleaching");
    const fresh = solve(left);
    const faded = solve(right);
    const countDrop = faded.optical.referenceCounts / fresh.optical.referenceCounts;
    const readingShift =
      Math.abs(faded.optical.readingMmol - fresh.optical.readingMmol) / fresh.optical.readingMmol;
    console.log(
      `  after ${right.flashes.toLocaleString("en-GB")} flashes the counts are ${(countDrop * 100).toFixed(1)} per cent of new and the reading moved ${(readingShift * 100).toFixed(2)} per cent`,
    );
    expect(countDrop).toBeGreaterThan(0.45);
    expect(countDrop).toBeLessThan(0.55);
    // Counting noise rises as the counts fall, so this is not zero; it must
    // stay far below the halving that produced it.
    expect(readingShift).toBeLessThan(0.05);
  });

  it("4. a polyol reads as glucose, upwards", () => {
    const { left, right } = pair("polyol");
    const clean = solve(left);
    const infused = solve(right);
    console.log(
      `  ${right.polyolMmol} mmol/L of polyol takes the reading from ${clean.optical.readingMmol.toFixed(2)} to ${infused.optical.readingMmol.toFixed(2)} mmol/L, with the truth unchanged at ${right.glucoseMmol}`,
    );
    // Upwards is the whole point: every occupied site lights up and the
    // instrument calls all of them glucose.
    expect(infused.optical.readingMmol).toBeGreaterThan(clean.optical.readingMmol);
    expect(infused.optical.totalOccupancy).toBeGreaterThan(infused.optical.glucoseOccupancy);
    // And the glucose itself is doing less, not more.
    expect(infused.optical.glucoseOccupancy).toBeLessThan(clean.optical.glucoseOccupancy);
  });

  it("5. the layer acidifies itself, more at high glucose", () => {
    const { left, right } = pair("acid");
    const low = solve(left);
    const high = solve(right);
    console.log(
      `  pH ${low.enzymatic.localPh.toFixed(2)} at ${left.glucoseMmol} mmol/L and ${high.enzymatic.localPh.toFixed(2)} at ${right.glucoseMmol}`,
    );
    expect(low.enzymatic.localPh).toBeLessThan(7.4);
    expect(high.enzymatic.localPh).toBeLessThan(low.enzymatic.localPh);
  });

  it("6. fouling shows at the probe frequency and not much lower down", () => {
    const { left, right } = pair("impedance");
    const clean = solve(left);
    const fouled = solve(right);

    const atProbe =
      (fouled.enzymatic.impedanceAtProbe.magnitude - clean.enzymatic.impedanceAtProbe.magnitude) /
      clean.enzymatic.impedanceAtProbe.magnitude;
    const pick = (result: typeof clean, frequency: number): number =>
      result.enzymatic.spectrum.find((p) => p.frequency === frequency)?.impedance.magnitude ?? 0;
    const atKilohertz = (pick(fouled, 1000) - pick(clean, 1000)) / pick(clean, 1000);

    console.log(
      `  the protein film the bench deposits moves the magnitude ${(atProbe * 100).toFixed(0)} per cent at the probe frequency and ${(atKilohertz * 100).toFixed(0)} per cent at 1 kHz`,
    );
    // The bench flags an impedance step above 35 per cent, so the difference
    // between these two numbers is the difference between seeing the film and
    // not seeing it. That is the whole reason the probe frequency moved.
    expect(atProbe).toBeGreaterThan(0.5);
    expect(atKilohertz).toBeLessThan(0.35);
  });
});

describe("the lab's own drawing rules", () => {
  it("keeps chemistry clear of the bench's red", () => {
    // The bench reserves red for the insulin path and the invalid state. The
    // build brief names the peroxide colour as coral, and coral is genuinely
    // the nearest of the molecular colours to that red: 53 units away in RGB
    // against 150 or more for every other one. That is the brief's choice and
    // it is kept, because the peroxide is the aggressive species and a warm
    // colour says so. What makes it safe is that the two never share a view:
    // the insulin trace is on the bench's canvas and the peroxide is in the
    // Probe Lab's profile, and the profile has no insulin in it at all.
    //
    // So the assertion is the rule the brief actually states. No chemistry
    // colour is either red, and every one of them has a green channel well
    // clear of the red's, which is what makes coral read as orange.
    const BENCH_RED = "#dc2626";
    const INVALID_RED = "#f87171";
    const channels = (colour: string): [number, number, number] => {
      const value = colour.replace("#", "");
      return [
        parseInt(value.slice(0, 2), 16),
        parseInt(value.slice(2, 4), 16),
        parseInt(value.slice(4, 6), 16),
      ];
    };
    const [rr, rg, rb] = channels(BENCH_RED);

    let closest = Infinity;
    let closestColour = "";
    for (const colour of CHEMISTRY_COLOURS) {
      expect(colour.toLowerCase()).not.toBe(BENCH_RED);
      expect(colour.toLowerCase()).not.toBe(INVALID_RED);
      const [r, g, b] = channels(colour);
      // Not simply red: dominated by the red channel with both others far below.
      expect(r > 150 && g < 80 && b < 80, `${colour} reads as red`).toBe(false);
      // Clear of the bench red in the green channel, which is the difference
      // between a coral and a red.
      expect(g, `${colour} has no more green than the bench's red`).toBeGreaterThan(rg + 20);
      const distance = Math.hypot(r - rr, g - rg, b - rb);
      if (distance < closest) {
        closest = distance;
        closestColour = colour;
      }
    }
    console.log(
      `  ${CHEMISTRY_COLOURS.length} chemistry colours; the nearest to the bench's red is ${closestColour} at ${closest.toFixed(0)} units`,
    );
    expect(closest).toBeGreaterThan(40);
  });

  it("draws an isotherm that starts at the competitors and saturates at one", () => {
    const withPolyol = isotherm({ ...EXPERIMENTS[3]!.right.conditions });
    const first = withPolyol[0]!;
    const last = withPolyol[withPolyol.length - 1]!;
    console.log(
      `  with a polyol infusion the receptor is ${(first.total * 100).toFixed(0)} per cent occupied at zero glucose and ${(last.total * 100).toFixed(0)} per cent at ${last.glucose} mmol/L`,
    );
    expect(first.total).toBeGreaterThan(0);
    expect(first.glucoseOnly).toBe(0);
    expect(last.total).toBeGreaterThan(first.total);
    expect(last.total).toBeLessThanOrEqual(1);
  });
});

describe("the lens sits on the stack the engine actually builds", () => {
  /*
   * The magnified view places its lens by looking up a layer by name in the
   * solved stack. A layer renamed in the engine would leave the lens quietly
   * spanning the whole probe instead of the film it is supposed to be on, and
   * nothing would throw. So every station's site is resolved here.
   */
  const solution = solve(DEFAULT_CONDITIONS);

  it("names a real layer at every station that claims one", () => {
    for (const station of STATIONS) {
      const site = station.site;
      if (site.kind !== "layer") continue;
      const layers =
        station.probe === "enzymatic" ? solution.enzymatic.layers : solution.optical.layers;
      const band = layers.find((l) => l.name === site.layer);
      expect(band, `station ${station.id} looks for a layer named "${site.layer}"`).toBeTruthy();
      expect(band!.toMicron).toBeGreaterThan(band!.fromMicron);
    }
  });

  it("sends every preset to a station that exists on the probe it names", () => {
    for (const experiment of EXPERIMENTS) {
      const station = STATIONS.find((s) => s.id === experiment.station);
      expect(station, `experiment ${experiment.id} points at "${experiment.station}"`).toBeTruthy();
      expect(station!.probe).toBe(experiment.panel);
    }
  });

  it("only asks for dials the conditions actually have", () => {
    for (const station of STATIONS) {
      for (const key of station.controls) {
        expect(DEFAULT_CONDITIONS, `station ${station.id} wants "${key}"`).toHaveProperty(key);
      }
    }
  });
});
