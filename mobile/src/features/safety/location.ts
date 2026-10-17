import type { LatLng } from "@/lib/nearest";
import { useEffect, useState } from "react";
import * as Location from "expo-location";

/**
 * Where the phone is, ONLY if the patient already allowed location (law L9:
 * Help never asks in the middle of an emergency, and the position stays on
 * the phone). The last known fix: instant and offline, which matters more
 * here than a fresh one. Null when not allowed or not known.
 */
export function useGrantedLocation(): LatLng | null {
  const [here, setHere] = useState<LatLng | null>(null);
  useEffect(() => {
    let cancelled = false;
    Location.getForegroundPermissionsAsync()
      .then((p) => (p.granted ? Location.getLastKnownPositionAsync() : null))
      .then((pos) => {
        if (!cancelled && pos)
          setHere({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return here;
}

/** "0.34760, 32.58250": five places is about a metre, enough to read out on a call. */
export function formatLatLng(p: LatLng): string {
  return `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`;
}
