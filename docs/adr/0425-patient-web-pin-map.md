# ADR 0425 — A map to set a place's pin on the patient web

**Status:** Accepted — 2026-10-26 (owner).

## Decision

Me → Places on the web gets a map under "Use my location": tap or click where the place is to move the pin,
as the phone lets you drag one. It uses Leaflet 1.9.4 (one new dependency, ~40 KB gzipped, no API key) over
OpenStreetMap's tiles. It loads only when the place dialog opens (`next/dynamic`, no SSR), so no other page
pays for it. The pin is a circle marker in the Tide action colour; the map opens on Kampala before a pin is
set. Nothing new is stored: the pin is the same latitude and longitude the dialog already saves, under the
same consent.

## Why

"Use my location" alone fails on a computer without location access, and a patient adding a place they are
not standing in had no way to set it. The repo had no web map (STOP 4–6 report).

## Watch

OpenStreetMap's tile servers allow light use with attribution (shown on the map). Heavy traffic needs a tile
provider with a key; the tile URL is one line in `pin-map.tsx`.
