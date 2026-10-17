# ADR 0343 — Saved places on a real map, and time-limited live location shares

**Status:** Accepted, 2026-10-18. Owner decision. It extends ADR 0342, and replaces 0170's single home pin with a list of places.

## Context

Sign-up's "Where you live" asked for a typed district and an optional pin on a drawn map. The owner asked for three things:

- the patient's real location, on a real map;
- places the patient can label as home, work or something else;
- a live location the patient can share.

The owner also asked whether a free Google Maps service could do it.

## Decision

1. **The map is free.**
   - The app uses `react-native-maps`, which is already installed.
   - On iPhone that is Apple Maps, with no key and no cost.
   - On Android it is the Google Maps SDK. The native mobile SDK is reported as free to use without limit. A release build needs its own API key; Expo Go already carries one.
   - The pin becomes an address through the phone's own geocoder (`expo-location` `reverseGeocodeAsync`), which is also free.
   - Google's paid web services, such as Geocoding and Places Autocomplete, are not used.
   - The district and subcounty still come from MedSync's own list. The geocoder's answer only pre-fills that search.
2. **Several labelled places** go in `public.patient_places` (migration 0171).
   - Each place is home, work, or the patient's own word, with the consent it was saved under.
   - At most one place is the home, and clinic suggestions use it.
   - Only the patient can read or write their places (row-level security, as in 0029).
   - 0170's single home pin is copied in once as a home place. The phone never writes it again.
3. **Live location is a time-limited share, not tracking**, in `public.location_shares`.
   - The patient starts it from Help or on the way to a visit, for 15 minutes, 1 hour, or until they stop it. The database allows at most 8 hours.
   - Only the latest position is stored, never a trail.
   - The phone updates it while the app is open. Expo Go cannot share in the background on iOS, so background updates wait for a development build.
4. **Family can follow the share through a private link** the patient sends by WhatsApp or SMS.
   - The link is `/share/location/<token>`. The database makes the token from two random UUIDs (64 hex characters), because the phone has no secure random source.
   - The page reads the share through `location_share_view(token)`. That returns only the position, when it was taken and when the share ends. It never returns the patient's name or id.
   - Nothing comes back once the share is stopped or has ended.
   - No hospital screen shows shares yet. That comes later, on the same table.

## Consequences

- Saving places and sharing location both work in Expo Go today, once the owner applies 0171.
- Continuous background tracking is ruled out for now. It would need a development build, "Always" permission, a review under the Data Protection and Privacy Act, and a hospital screen to be useful.
