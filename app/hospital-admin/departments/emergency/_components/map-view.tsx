"use client";

import type { MapLayer } from "./entrance-map";
import { useState } from "react";

import { GOOGLE_MAPS_KEY } from "../_lib/google-maps";
import EntranceMap from "./entrance-map";
import GoogleMap from "./google-map";

type LatLng = { lat: number; lng: number };

/**
 * The hospital's pin map (ADR 0522): Google Maps when the site has a Google Maps browser key and Google accepts it,
 * otherwise OpenStreetMap with satellite imagery, with the same props. Loaded with `next/dynamic` and no SSR by its
 * callers: both maps need `window`.
 */
export default function MapView(props: {
  pin: LatLng | null;
  onPick?: (p: LatLng) => void;
  label: string;
  layer?: MapLayer;
  interactive?: boolean;
  small?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (GOOGLE_MAPS_KEY && !failed) return <GoogleMap {...props} onFail={() => setFailed(true)} />;
  return <EntranceMap {...props} />;
}
