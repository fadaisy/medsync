/**
 * Lab Phase 2 engine fixtures. Every number here is INVENTED for tests (Law 3): no cut-off, elevation,
 * constant or band is a clinical value, and none may be copied into a seed or a sign-off pack.
 */
import type { ResolvedRange } from "@/lib/lab/ranges";
import type { ConfigKind, Payload, SchemePayload, SignedConfig } from "@/lib/lab/signed-config";

export const T0 = new Date("2026-10-12T08:00:00Z");
export const BEFORE = new Date("2026-01-01T00:00:00Z");
export const ADULT = 12_000; // days (fixture)
export const CHILD = 3_300; // days (fixture)

let n = 0;
export function config<K extends ConfigKind>(
  kind: K,
  key: string,
  payload: Payload<K>,
  o: Partial<SignedConfig<K>> = {},
): SignedConfig<K> {
  return {
    id: `cfg-${++n}`,
    hospitalId: "h-a",
    kind,
    key,
    version: 1,
    status: "signed",
    payload,
    inForceFrom: BEFORE,
    supersededAt: null,
    ...o,
  };
}

const b = (category: string, from: string | null, to: string | null) => ({
  category,
  from,
  fromInclusive: true,
  to,
  toInclusive: false,
});

/** A fixture anaemia-like scheme: adult women 5000–20000 days, not pregnant and pregnant (two gestation
 *  spans), lab method only, with a fixture elevation table. */
export const FIXTURE_SCHEME: SchemePayload = {
  concept: "obs.fixture_hb",
  unit: "g/dL",
  label: "Fixture scheme 2026",
  source: "fixture source",
  categories: [
    { code: "none", label: "No fixture anaemia", abnormal: false },
    { code: "mild", label: "Mild fixture", abnormal: true },
    { code: "moderate", label: "Moderate fixture", abnormal: true },
    { code: "severe", label: "Severe fixture", abnormal: true },
  ],
  rows: [
    {
      sex: "female",
      ageFromDays: 5000,
      ageToDays: 20000,
      context: "not_pregnant",
      methods: ["lab"],
      bounds: [
        b("severe", null, "8.0"),
        b("moderate", "8.0", "11.0"),
        b("mild", "11.0", "12.0"),
        b("none", "12.0", null),
      ],
      source: "fixture row np",
    },
    {
      sex: "female",
      ageFromDays: 5000,
      ageToDays: 20000,
      context: "pregnant",
      gestationFromDays: 0,
      gestationToDays: 100,
      methods: ["lab"],
      bounds: [
        b("severe", null, "7.0"),
        b("moderate", "7.0", "10.0"),
        b("mild", "10.0", "11.0"),
        b("none", "11.0", null),
      ],
      source: "fixture row p1",
    },
    {
      sex: "female",
      ageFromDays: 5000,
      ageToDays: 20000,
      context: "pregnant",
      gestationFromDays: 100,
      gestationToDays: 300,
      methods: ["lab"],
      bounds: [
        b("severe", null, "6.0"),
        b("moderate", "6.0", "9.0"),
        b("mild", "9.0", "10.0"),
        b("none", "10.0", null),
      ],
      source: "fixture row p2",
    },
  ],
  elevation: {
    unit: "g/dL",
    table: [
      { fromM: 1, toM: 999, amount: "0" },
      { fromM: 1000, toM: 1999, amount: "1.0" },
    ],
    source: "fixture elevation table",
  },
};

export const refBand = (low: string, high: string): ResolvedRange => ({
  kind: "band",
  band: { id: "ref-band", sex: "any", ageFromDays: null, ageToDays: null, low, high },
  version: {
    id: "rv",
    hospitalId: "h-a",
    testId: "t",
    conceptId: "obs.fixture_hb",
    unitUcum: "g/dL",
    version: 1,
    status: "signed",
    inForceFrom: BEFORE,
    supersededAt: null,
    bands: [],
  },
});
