import { describe, expect, it } from "vitest";

import { haversineKm, orderFacilities } from "@/lib/emergency/nearest";

/** ADR 0098 ruling 9 — own facility first, then distance where known, else name. */
const KAMPALA = { latitude: 0.3476, longitude: 32.5825 };
const MULAGO = { id: "mulago", name: "Mulago", latitude: 0.3386, longitude: 32.5757 };
const ENTEBBE = { id: "entebbe", name: "Entebbe Grade B", latitude: 0.0512, longitude: 32.4637 };
const UNLOCATED_A = { id: "a", name: "Arua Regional", latitude: null, longitude: null };
const UNLOCATED_Z = { id: "z", name: "Zombo HC IV", latitude: null, longitude: null };

describe("haversineKm", () => {
  it("is zero for the same point and symmetric", () => {
    expect(haversineKm(KAMPALA, KAMPALA)).toBe(0);
    expect(haversineKm(KAMPALA, ENTEBBE)).toBeCloseTo(haversineKm(ENTEBBE, KAMPALA), 9);
  });

  it("Kampala → Entebbe is roughly 35 km", () => {
    const km = haversineKm(KAMPALA, ENTEBBE);
    expect(km).toBeGreaterThan(30);
    expect(km).toBeLessThan(40);
  });
});

describe("orderFacilities", () => {
  it("own hospital first, then by distance, then unlocated by name", () => {
    const out = orderFacilities([UNLOCATED_Z, ENTEBBE, UNLOCATED_A, MULAGO], KAMPALA, "entebbe");
    expect(out.map((o) => o.facility.id)).toEqual(["entebbe", "mulago", "a", "z"]);
    expect(out[0]?.isOwn).toBe(true);
    expect(out[1]?.distanceKm).toBe(1);
    expect(out[2]?.distanceKm).toBeNull();
  });

  it("with no location every distance is null and the order is own-then-name", () => {
    const out = orderFacilities([UNLOCATED_Z, MULAGO, ENTEBBE, UNLOCATED_A], null, "z");
    expect(out.map((o) => o.facility.id)).toEqual(["z", "a", "entebbe", "mulago"]);
    expect(out.every((o) => o.distanceKm === null)).toBe(true);
  });

  it("with no own hospital nothing is pinned", () => {
    const out = orderFacilities([MULAGO, ENTEBBE], KAMPALA, null);
    expect(out.map((o) => o.facility.id)).toEqual(["mulago", "entebbe"]);
    expect(out.some((o) => o.isOwn)).toBe(false);
  });

  it("does not mutate the input", () => {
    const input = [UNLOCATED_Z, MULAGO];
    orderFacilities(input, null, null);
    expect(input.map((f) => f.id)).toEqual(["z", "mulago"]);
  });
});
