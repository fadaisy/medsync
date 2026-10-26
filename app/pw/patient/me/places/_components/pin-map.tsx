"use client";

import "leaflet/dist/leaflet.css";

import type { CircleMarker, Map as LeafletMap } from "leaflet";
import { useEffect, useRef } from "react";
import L from "leaflet";

type LatLng = { lat: number; lng: number };

/** Kampala, where the map opens before any pin is set. */
const START: LatLng = { lat: 0.3476, lng: 32.5825 };

/**
 * The pin on an OpenStreetMap map (ADR 0425): tap or click to move it. A circle marker, so no image files.
 * Loaded only in the browser (`next/dynamic`, no SSR) because Leaflet needs `window`.
 */
export default function PinMap({
  pin,
  onPick,
  label,
}: {
  pin: LatLng | null;
  onPick: (p: LatLng) => void;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<CircleMarker | null>(null);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  });

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { zoomControl: true }).setView(pin ?? START, pin ? 17 : 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(m);
    m.on("click", (e) => pick.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    // The dialog sizes the box after the map is made; redraw the tiles when it does.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // The map is made once; the pin effect below follows later changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !pin) return;
    if (marker.current) marker.current.setLatLng(pin);
    else
      marker.current = L.circleMarker(pin, {
        radius: 10,
        weight: 3,
        fillOpacity: 1,
        className: "fill-pw-act stroke-pw-surface",
      }).addTo(m);
    if (!m.getBounds().contains(pin)) m.setView(pin, Math.max(m.getZoom(), 16));
  }, [pin]);

  return (
    <div
      ref={box}
      role="application"
      aria-label={label}
      className="rounded-pw-row bg-pw-surface-2 relative z-0 h-64 w-full overflow-hidden"
    />
  );
}
