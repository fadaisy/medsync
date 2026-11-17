"use client";

import "leaflet/dist/leaflet.css";

import type { CircleMarker, Map as LeafletMap, TileLayer } from "leaflet";
import { useEffect, useRef } from "react";
import L from "leaflet";

import e from "./emergency.module.css";

type LatLng = { lat: number; lng: number };
export type MapLayer = "map" | "satellite";

/** Kampala, where the map opens before any pin is set. */
const START: LatLng = { lat: 0.3476, lng: 32.5825 };

/** The street map (OpenStreetMap, as the patient web's places map) and satellite imagery (Esri World Imagery). */
function layersFor(layer: MapLayer): TileLayer[] {
  if (layer === "map")
    return [
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }),
    ];
  return [
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 20,
        maxNativeZoom: 19,
        attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
      },
    ),
    // Road and place names over the imagery, so the entrance can be found by its road.
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 20, maxNativeZoom: 19 },
    ),
  ];
}

/**
 * The hospital's pin on a street map or satellite imagery: click or tap to move it (or, with `interactive` off, a
 * still preview). A circle marker, so no image files. Loaded only in the browser (`next/dynamic`, no SSR) because
 * Leaflet needs `window`.
 */
export default function EntranceMap({
  pin,
  onPick,
  label,
  layer = "map",
  interactive = true,
  small = false,
}: {
  pin: LatLng | null;
  onPick?: (p: LatLng) => void;
  label: string;
  layer?: MapLayer;
  interactive?: boolean;
  small?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const tiles = useRef<TileLayer[]>([]);
  const marker = useRef<CircleMarker | null>(null);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  });

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, {
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
    }).setView(pin ?? START, pin ? (small ? 17 : 18) : 12);
    if (interactive)
      m.on("click", (ev) => pick.current?.({ lat: ev.latlng.lat, lng: ev.latlng.lng }));
    map.current = m;
    // The dialog sizes the box after the map is made; redraw the tiles when it does.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      tiles.current = [];
      marker.current = null;
    };
    // The map is made once; the effects below follow the layer and the pin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const t of tiles.current) t.remove();
    tiles.current = layersFor(layer).map((t) => t.addTo(m));
  }, [layer]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!pin) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (marker.current) marker.current.setLatLng(pin);
    else
      marker.current = L.circleMarker(pin, {
        radius: small ? 8 : 10,
        weight: 3,
        fillOpacity: 1,
        className: e.pin,
      }).addTo(m);
    if (!interactive || !m.getBounds().pad(-0.1).contains(pin))
      m.setView(pin, Math.max(m.getZoom(), small ? 17 : 18));
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
