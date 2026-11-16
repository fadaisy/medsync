# ADR 0522: Google Maps for the hospital's pin, when the site has a key

**Status:** Accepted, 16 Nov 2026. The owner asked that the location map on Emergency and support "should be google maps".

## Context

Emergency and support (ADR 0521) lets an admin pin the hospital's one coordinate pair (`hospitals.latitude/longitude`, through `ha-set-hospital-emergency-settings`: one admin, audited). The map was Leaflet over OpenStreetMap, then gained Esri satellite imagery, place search and a link to Google Maps. Embedding Google Maps needs a browser API key on a Google Cloud project with billing, which only the owner can create.

## Decision

- **Google Maps when the site has a key.** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (optional, `lib/env.ts`) turns on the Maps JavaScript API for the pin dialog and the "On the map" preview: satellite with road names (`hybrid`) or the street map, click to place the pin, and Google's geocoder for "Find a place", restricted to Uganda. The script is loaded once, only on this page, from Google; only the few shapes used are typed in `_lib/google-maps.ts` (no types package).
- **OpenStreetMap otherwise.** With no key, or when the script cannot load or Google refuses the key (`gm_authFailure`), the same component shows Leaflet over OpenStreetMap and Esri imagery, and search uses OpenStreetMap's Nominatim. Nothing breaks while the key is missing.
- **The pin** is a circle in the action colour (Tide lagoon), never red: red is for emergencies.
- "Check it in Google Maps" stays: it opens Google's satellite view at the pin in a new tab, with no key.

## Consequences

- The owner creates a browser key with the Maps JavaScript API and the Geocoding API enabled, restricts it to the site's addresses, and sets it in Vercel; Google's free monthly use covers an admin page.
- Esri's public imagery remains only as the fallback; its terms expect an ArcGIS account for production use.
- No migration, no change to what is stored or who may change it.
