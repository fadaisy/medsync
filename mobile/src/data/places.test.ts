import {
  addPlace,
  coordWords,
  fromDb,
  geoWords,
  isMissingTable,
  labelProblem,
  placeLabel,
  setHome,
  toDb,
} from "@/data/places";

/** Every call the fake client receives, in order. */
const mockCalls: string[] = [];
let mockNextError: { code?: string; message?: string } | null = null;

function mockChain(table: string, op: string, arg?: unknown) {
  mockCalls.push(`${op} ${table} ${JSON.stringify(arg ?? null)}`);
  const result = { error: mockNextError };
  const q = {
    eq: (col: string, v: unknown) => {
      mockCalls.push(`eq ${col}=${String(v)}`);
      return q;
    },
    order: () => q,
    then: (ok: (r: unknown) => unknown) => Promise.resolve(result).then(ok),
  };
  return q;
}

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: (table: string) => ({
      select: () => mockChain(table, "select"),
      insert: (row: unknown) => mockChain(table, "insert", row),
      update: (row: unknown) => mockChain(table, "update", row),
      delete: () => mockChain(table, "delete"),
    }),
  },
}));

beforeEach(() => {
  mockCalls.length = 0;
  mockNextError = null;
});

describe("row ↔ view", () => {
  it("reads numeric strings, keeps the custom word only for other", () => {
    expect(
      fromDb({
        id: "p1",
        kind: "other",
        custom_label: "Mum's house",
        lat: "0.347600",
        lng: "32.582500",
        address: "  ",
        is_home: false,
      }),
    ).toEqual({
      id: "p1",
      kind: "other",
      customLabel: "Mum's house",
      lat: 0.3476,
      lng: 32.5825,
      address: null,
      isHome: false,
    });
    const work = fromDb({
      id: "p2",
      kind: "work",
      custom_label: "x",
      lat: 1,
      lng: 2,
      is_home: true,
    });
    expect(work.customLabel).toBeNull();
    expect(work.isHome).toBe(true);
    expect(placeLabel(work)).toBe("Work");
  });

  it("writes no custom word for home or work, and rounds to six places", () => {
    expect(
      toDb({ kind: "home", customLabel: "ignored", lat: 0.12345678, lng: 32.9, address: " A " }),
    ).toEqual({ kind: "home", custom_label: null, lat: 0.123457, lng: 32.9, address: "A" });
    expect(toDb({ kind: "other", customLabel: " Shop ", lat: 0, lng: 0, address: "" })).toEqual({
      kind: "other",
      custom_label: "Shop",
      lat: 0,
      lng: 0,
      address: null,
    });
  });

  it("checks the custom word 1–40 characters, only for other", () => {
    expect(labelProblem("home", "")).toBeNull();
    expect(labelProblem("other", "  ")).toMatch(/name/);
    expect(labelProblem("other", "a".repeat(41))).toMatch(/40/);
    expect(labelProblem("other", "Church")).toBeNull();
  });

  it("says the coordinates in words", () => {
    expect(coordWords(-0.5, 32.1)).toEqual({
      text: "0.5000° S, 32.1000° E",
      spoken: "0.5000 degrees south, 32.1000 degrees east",
    });
  });

  it("knows a missing table (0171 not applied)", () => {
    expect(isMissingTable({ code: "PGRST205" })).toBe(true);
    expect(isMissingTable({ code: "42P01" })).toBe(true);
    expect(isMissingTable({ code: "23505" })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
  });
});

describe("reverse geocode → pre-fill", () => {
  it("searches the most local area and fills the village with the street", () => {
    expect(
      geoWords({
        name: "Bombo Road",
        street: "Bombo Road",
        streetNumber: null,
        district: "Kawempe",
        city: "Kampala",
        subregion: "Kampala",
        region: "Central Region",
      }),
    ).toEqual({
      address: "Bombo Road, Kawempe, Kampala",
      village: "Bombo Road, Kawempe",
      query: "Kawempe",
    });
  });

  it("drops 'District' so the UBOS name matches, and copes with nothing", () => {
    expect(geoWords({ subregion: "Wakiso District", city: null, district: null }).query).toBe(
      "Wakiso",
    );
    expect(geoWords({})).toEqual({ address: null, village: null, query: null });
  });
});

describe("one home", () => {
  it("clears the old home before setting the new one", async () => {
    expect(await setHome("p2")).toBe("saved");
    expect(mockCalls.slice(0, 5)).toEqual([
      'update patient_places {"is_home":false}',
      "eq patient_user_id=u1",
      "eq is_home=true",
      'update patient_places {"is_home":true}',
      "eq id=p2",
    ]);
  });

  it("clears the old home before adding a new home, with the consent version", async () => {
    await addPlace(
      { kind: "home", customLabel: null, lat: 1, lng: 2, address: null },
      true,
      new Date("2026-10-18T08:00:00Z"),
    );
    expect(mockCalls[0]).toBe('update patient_places {"is_home":false}');
    expect(mockCalls[3]).toContain('insert patient_places {"kind":"home"');
    expect(mockCalls[3]).toContain('"is_home":true,"consent_version":"place-v1"');
  });

  it("does not touch the home when adding another place", async () => {
    await addPlace(
      { kind: "work", customLabel: null, lat: 1, lng: 2, address: null },
      false,
      new Date(),
    );
    expect(mockCalls[0]).toMatch(/^insert/);
  });

  it("says off before 0171 is applied, and never throws", async () => {
    mockNextError = { code: "PGRST205", message: "Could not find the table" };
    expect(await setHome("p2")).toBe("off");
    mockNextError = { code: "23505" };
    expect(await setHome("p2")).toBe("failed");
  });
});
