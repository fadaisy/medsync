import type {
  DiffusivityM2PerS,
  Metres,
  MolPerCubicMetre,
  Seconds,
} from "../../src/engine/probes/units.ts";
import { describe, expect, it } from "vitest";

import {
  ampsToNanoamps,
  celsiusToKelvin,
  diffusivity,
  kelvinToCelsius,
  m,
  metresToMicrons,
  micronsToMetres,
  mmHgToPascals,
  mmolPerLitreToSi,
  molPerM3,
  nanoampsToAmps,
  pascalsToMmHg,
  raw,
  s,
  siToMmolPerLitre,
} from "../../src/engine/probes/units.ts";

/* eslint-disable no-console */

/**
 * The brands are a compile-time guarantee, so the real check is that the
 * following lines do not compile. `@ts-expect-error` inverts that: if any of
 * them ever became assignable, `npx tsc --noEmit` fails on this file, which is
 * part of `npm run build`.
 *
 * This is the test the build brief asks for: it fails if the branded types
 * are bypassed.
 */
function typeGuards(): void {
  const length: Metres = m(1e-4);
  const time: Seconds = s(60);
  const concentration: MolPerCubicMetre = molPerM3(6);
  const d: DiffusivityM2PerS = diffusivity(5e-10);

  // @ts-expect-error a length is not a time
  const wrong1: Seconds = length;
  // @ts-expect-error a concentration is not a diffusivity
  const wrong2: DiffusivityM2PerS = concentration;
  // @ts-expect-error a raw number is not a branded quantity
  const wrong3: Metres = 1e-4;
  // @ts-expect-error a diffusivity is not a concentration
  const wrong4: MolPerCubicMetre = d;
  // What branding does NOT catch, stated rather than hidden: arithmetic.
  // `Metres` and `Seconds` are both `number & { brand }`, so `length + time`
  // is a plain `number` and TypeScript is happy with it. An intersection
  // brand guards assignment, not operators. Catching operator misuse would
  // need a wrapper object with a `.value`, which would put an unwrapping call
  // in the middle of every equation in the solver and cost more clarity than
  // it buys. See DECISIONS.md, decision 34.
  const notCaught: number = length + time;

  void wrong1;
  void wrong2;
  void wrong3;
  void wrong4;
  void notCaught;
}

describe("branded units", () => {
  it("declares the type guards that must not compile", () => {
    // The guards above are checked by tsc, not at runtime. Calling the
    // function here keeps it from being tree-shaken out of the type check.
    expect(typeGuards).toBeTypeOf("function");
  });

  it("a branded quantity is an ordinary number at runtime", () => {
    expect(raw(m(2.5e-4))).toBe(2.5e-4);
    expect(m(3) + 0).toBe(3);
  });

  it("mmol per litre and mol per cubic metre are the same number", () => {
    // 1 mmol/L = 1 mol/m3 exactly. Stating it is what stops someone inserting
    // a factor of a thousand in either direction.
    expect(raw(mmolPerLitreToSi(6.4))).toBe(6.4);
    expect(siToMmolPerLitre(molPerM3(6.4))).toBe(6.4);
  });

  it("round-trips every clinical conversion", () => {
    expect(ampsToNanoamps(nanoampsToAmps(12.91))).toBeCloseTo(12.91, 9);
    expect(kelvinToCelsius(celsiusToKelvin(37))).toBeCloseTo(37, 9);
    expect(pascalsToMmHg(mmHgToPascals(40))).toBeCloseTo(40, 9);
    expect(metresToMicrons(micronsToMetres(113.2))).toBeCloseTo(113.2, 9);
  });

  it("converts oxygen partial pressure to the value the model uses", () => {
    const pa = mmHgToPascals(40);
    console.log(`  40 mmHg is ${raw(pa).toFixed(1)} Pa`);
    expect(raw(pa)).toBeCloseTo(5332.9, 1);
  });
});
