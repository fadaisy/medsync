"use client";

import type { GMap, GMarker } from "../_lib/google-maps";
import type { MapLayer } from "./entrance-map";
import { useEffect, useRef } from "react";

import { loadGoogleMaps, onGoogleRefused } from "../_lib/google-maps";
import e from "./emergency.module.css";

type LatLng = { lat: number; lng: number };

/** Kampala, where the map opens before any pin is set. */
const START: LatLng = { lat: 0.3476, lng: 32.5825 };
/** The pin in the desk's action colour (Tide lagoon), never the emergency red. */
const PIN_FILL = "#2dd4bf";

/**
 * The hospital's pin on Google Maps (ADR 0522): satellite with road names, or the street map; click to move the pin,
 * or, with `interactive` off, a still preview. Calls `onFail` when the script cannot load or Google refuses the key,
 * and the caller falls back to OpenStreetMap.
 */
export default function GoogleMap({
  pin,
  onPick,
  label,
  layer = "satellite",
  interactive = true,
  small = false,
  onFail,
}: {
  pin: LatLng | null;
  onPick?: (p: LatLng) => void;
  label: string;
  layer?: MapLayer;
  interactive?: boolean;
  small?: boolean;
  onFail: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<GMap | null>(null);
  const marker = useRef<GMarker | null>(null);
  const markerOf = useRef<((p: LatLng) => GMarker) | null>(null);
  const latest = useRef({ pin, layer, onPick, onFail });
  useEffect(() => {
    latest.current = { pin, layer, onPick, onFail };
  });

  useEffect(() => {
    let gone = false;
    const off = onGoogleRefused(() => latest.current.onFail());
    loadGoogleMaps()
      .then((g) => {
        if (gone || !box.current) return;
        const { pin: p, layer: l } = latest.current;
        const m = new g.Map(box.current, {
          center: p ?? START,
          zoom: p ? (small ? 17 : 19) : 12,
          mapTypeId: l === "satellite" ? "hybrid" : "roadmap",
          tilt: 0,
          disableDefaultUI: !interactive,
          zoomControl: interactive,
          fullscreenControl: interactive,
          streetViewControl: false,
          mapTypeControl: false,
          clickableIcons: false,
          keyboardShortcuts: interactive,
          gestureHandling: interactive ? "greedy" : "none",
        });
        if (interactive)
          m.addListener("click", (ev) => {
            if (ev.latLng) latest.current.onPick?.({ lat: ev.latLng.lat(), lng: ev.latLng.lng() });
          });
        markerOf.current = (at) =>
          new g.Marker({
            map: m,
            position: at,
            clickable: false,
            icon: {
              path: g.SymbolPath.CIRCLE,
              scale: small ? 8 : 10,
              fillColor: PIN_FILL,
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 3,
            },
          });
        if (p) marker.current = markerOf.current(p);
        map.current = m;
      })
      .catch(() => latest.current.onFail());
    return () => {
      gone = true;
      off();
      marker.current?.setMap(null);
      marker.current = null;
      map.current = null;
    };
    // The map is made once; the effects below follow the layer and the pin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    map.current?.setMapTypeId(layer === "satellite" ? "hybrid" : "roadmap");
  }, [layer]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!pin) {
      marker.current?.setMap(null);
      marker.current = null;
      return;
    }
    if (marker.current) marker.current.setPosition(pin);
    else if (markerOf.current) marker.current = markerOf.current(pin);
    if (!interactive || !m.getBounds()?.contains(pin)) {
      m.setCenter(pin);
      m.setZoom(Math.max(m.getZoom() ?? 0, small ? 17 : 19));
    }
  }, [pin, interactive, small]);

  return (
    <div
      ref={box}
      role={interactive ? "application" : "img"}
      aria-label={label}
      className={`${e.map} ${small ? e.mapSm : ""}`}
    />
  );
}
