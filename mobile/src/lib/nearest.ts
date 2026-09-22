/**
 * "Nearest facility" without trusting coordinates — the phone's copy of
 * `lib/emergency/nearest.ts` (ADR 0098 ruling 9), mirrored rather than
 * imported because the phone cannot reach `lib/`; tests/emergency/
 * phone-pathway.test.ts holds the two rules equal. Runs on device so a
 * location never leaves it unless the per-alert toggle is on.
 *
 * Order: the patient's own facility first; then facilities by distance
 * where BOTH sides have coordinates; the rest by name.
 */
export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface FacilityForOrdering {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export interface OrderedFacility<F extends FacilityForOrdering> {
  facility: F;
  /** Whole km when both sides have coordinates; null otherwise — the UI never prints fake precision. */
  distanceKm: number | null;
  isOwn: boolean;
}

export function orderFacilities<F extends FacilityForOrdering>(
  facilities: readonly F[],
  here: LatLng | null,
  ownHospitalId: string | null,
): OrderedFacility<F>[] {
  const rows = facilities.map((facility) => ({
    facility,
    distanceKm:
      here !== null && facility.latitude !== null && facility.longitude !== null
        ? Math.round(
            haversineKm(here, { latitude: facility.latitude, longitude: facility.longitude }),
          )
        : null,
    isOwn: ownHospitalId !== null && facility.id === ownHospitalId,
  }));
  return rows.sort((x, y) => {
    if (x.isOwn !== y.isOwn) return x.isOwn ? -1 : 1;
    if (x.distanceKm !== null && y.distanceKm !== null && x.distanceKm !== y.distanceKm) {
      return x.distanceKm - y.distanceKm;
    }
    // A located facility outranks an unlocated one; two unlocated sort by name.
    if ((x.distanceKm === null) !== (y.distanceKm === null)) return x.distanceKm === null ? 1 : -1;
    return x.facility.name.localeCompare(y.facility.name);
  });
}
