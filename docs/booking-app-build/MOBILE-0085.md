# Mobile track — ADR 0085 on the phone (photos, ratings, times, counts, emergency tab)

App: /Users/airm1/Desktop/medsync/mobile (Expo SDK 57, expo-router 57 headless tabs, RN 0.86, Reanimated 4.5,
React Compiler ON, typed routes). Read in order: docs/adr/0085-marketplace-presentation-on-the-phone.md,
the previous design contract docs/booking-app-build/REFERENCE-LANGUAGE.md
(its kit, type scale and rules still apply except where this doc overrides), then src/theme/\*, every file in
src/components/ui, src/lib/booking.ts, and the screens you own.

## Server contract (already deployed-ready; the owner deploys)

`pt-bookable-clinicians` → `ClinicianOption[]`:

```ts
{ userId, fullName, specialty: string | null, departmentId, departmentName,
  photoUrl: string | null,               // signed, 1h
  rating: { average: number; count: number } | null,   // null = "No ratings yet"
  autoConfirm: boolean,
  slotsByDate: Record<"YYYY-MM-DD", { startsAtIso: string; endsAtIso: string }[]> } // ascending; day count = length
```

`pt-rate-visit` POST `{ appointment_id, stars: 1..5, comment?: string | null }` → `{ rating_id, stars }`; refuses
(409 sentence "You can rate a visit once it has happened.") unless status ∈ arrived|in_progress|completed and ends_at < now.
`users.avatar_path` is writable by the owner (RLS users_update_own); bucket `avatars` private, key `<uid>/<uuid>.jpg`,
authenticated read, owner write. Signed URLs via `supabase.storage.from("avatars").createSignedUrl(path, 3600)`.

## Foundation (phase 1 — one agent; screens wait for it)

- `src/lib/booking.ts`:
  - Replace `SessionOffer`/`sessionsByDate` with the server contract above (`SlotOffer`, `slotsByDate`). Delete
    `SESSION_LABEL`/`DaySession` re-exports if nothing else needs them (`localSession` stays in @shared/slots).
  - `formatTime(iso)` → "9:30 AM" (Intl en-US, hour numeric, minute 2-digit, hour12, timeZone DEFAULT_TIME_ZONE).
    `formatWhen(iso)` → "Mon 14 Nov · 9:30 AM" (keep DAY_FMT). `dayLabel`, `dateKey` unchanged.
  - `rateVisit({ appointmentId, stars, comment })` via callEdge("pt-rate-visit").
  - `fetchMyRating(appointmentId)` → `{ stars, comment } | null` (own row from `visit_ratings` under RLS).
  - `canRate(row)`: status ∈ arrived|in_progress|completed && endsAt < now.
  - `fetchMyAvatarUrl()` → signed URL of `users.avatar_path` for the caller or null (select own users row).
  - `uploadAvatar(localUri: string, mime: string)` → downscale is NOT available in RN without a dep; use
    `expo-image-picker` with `quality: 0.7, allowsEditing: true, aspect: [1,1]` and `mediaTypes: ["images"]`
    (SDK 57 API — read node_modules/expo-image-picker/build/ImagePicker.d.ts) so the picked file is already
    small; read it with `fetch(uri)` → `arrayBuffer()`; `storage.from("avatars").upload(\`${uid}/${id}.jpg\`, buf, { contentType, upsert: false })`(id from`Crypto.randomUUID`in expo-crypto if installed, else the same time+random id edge.ts uses); then`from("users").update({ avatar_path }).eq("id", uid)`; return the new signed URL. The foundation agent runs
`npx expo install expo-image-picker`(and expo-crypto only if needed) and adds the`expo-image-picker` plugin
    to app.json with photosPermission/cameraPermission strings ("MedSync uses your photo on your patient profile.").
  - Keep everything else (profile, appointments, intakes, walk-in departments, writes).
- Kit:
  - `avatar.tsx`: add `uri?: string | null` — when set, render `<Image source={{ uri }}>` clipped to the disc
    (same sizes), else the monogram/glyph. Keep `tone`.
  - `rating.tsx` (new): `Rating({ rating: { average, count } | null, size?: "sm" | "md" })` → "★ 4.8 · 12 reviews"
    (star glyph `Ionicons star` in `c.status.cautionFg` amber — never red; number 14 medium `c.foreground`; count
    13.5 muted; singular "1 review") or "No ratings yet" 13.5 muted. `StarInput({ value, onChange })` five
    44px `star`/`star-outline` Pressables, role radio in a radiogroup, labels "1 star"…"5 stars".
  - `tab-bar.tsx`: `TabButton` gains `tone?: "accent" | "critical"`. critical: inactive glyph `c.status.criticalFg`
    (red even at rest — it is THE emergency affordance, ADR 0085 §5), current chip `c.status.criticalBg` fill with
    `c.status.criticalFg` glyph + label.
  - `screen.tsx`: re-add `trailing?: ReactNode` (one control right-aligned on the back row; when there is no
    onBack the row still renders if trailing is given). Used for the red emergency button on pushed screens.
  - `emergency-button.tsx` (new, components/patient): `EmergencyButton()` = `IconButton` variant drawn red
    (`c.status.criticalBg` disc, `c.status.criticalFg` glyph `alert-circle`, label "Emergency") that
    `router.navigate("/(app)/(tabs)/emergency")`. IconButton needs a `tone: "critical"` to support it — add it.
- Typed routes: after creating `src/app/(app)/(tabs)/emergency.tsx` and `src/app/(app)/doctor/[id].tsx` as
  STUBS (export default a Screen with the title) run the regen script so tsc proves every href for the screen agents:
  node mobile/scripts/regen-typed-routes.cjs

## Screens (phase 2 — parallel, disjoint)

### A. Home `(tabs)/index.tsx` + Emergency tab `(tabs)/emergency.tsx` + `(tabs)/_layout.tsx`

- Home, top to bottom: greeting row (Avatar now with `uri` from `fetchMyAvatarUrl()`, loaded on focus like the
  profile); display heading "How are you feeling today?" (Fraunces 28) with the hospital name as the eyebrow above;
  `Section "Coming up"` with the ONE HeroCard as before but the Day/Session tiles become Day / Time
  (`dayLabel`, `formatTime`) with `calendar-outline` / `time-outline`; `Section "Get seen"` with the two doors
  unchanged in copy (primary → today; secondary → `/(app)/book`, which is now the doctors list);
  `Section "Doctors"` with action { label: "View all", onPress → /(app)/book }: a `ChipRow` of role-button chips
  ("All" + each department present, selected filters) and up to 3 `DoctorRow`s (see B — build it in
  components/patient/doctor-row.tsx and BOTH A and B import it; A owns the file). No EmergencyNotice on home.
  Data: `fetchBookableClinicians(hospitalId)` alongside the existing loads; failure → the section is absent, no error.
- `DoctorRow({ option, onPress })`: `c.card`+border 2xl padding 12, `Avatar(fullName, 56, uri=photoUrl)`,
  name 16 medium, `specialty ?? departmentName` 13.5 muted, `Rating size="sm"`, chevron muted. role button.
- Emergency tab screen: `Screen title="Emergency"`; a lead line with the hospital name ("{hospital}" as eyebrow);
  the `EmergencyNotice` block byte-identical (it already takes hospitalName/emergencyPhone); loads the profile on
  focus; no number → the block's own no-number state. This is the only screen that renders EmergencyNotice.
- `(tabs)/_layout.tsx`: four triggers in this order — index "Home", visits "Visits", emergency "Emergency"
  (`tone="critical"`, icon `alert-circle-outline`/`alert-circle`), settings "Settings".

### B. Doctors list `book.tsx` + Doctor page `doctor/[id].tsx`

- `book.tsx` becomes the list: `Screen title="Doctors" onBack trailing={<EmergencyButton/>}`; lede
  "Choose from the days the clinic has open."; `ChipRow` department filter; `DoctorRow` per option (ordered as the
  server sends — soonest open day first); tap → `/(app)/doctor/[id]` with params `{ id: userId, department: departmentId }`.
  Empty → `Empty` "No days open yet." with the existing hint. Delete the wizard code entirely (steps, ChoiceList,
  the confirmation) — it moves to the doctor page.
- `doctor/[id].tsx` (reference screen 2): `Screen onBack trailing={<EmergencyButton/>}` no title; a header block:
  photo — `Image` 120×120 radius 2xl if `photoUrl`, else `Avatar(name, 72)`; beside/below it a `c.card` pill
  `Rating` badge; name Fraunces 28; `specialty ?? departmentName` muted; "{departmentName} · {hospital}" 13.5 muted.
  `Section "Select date"` → `DayStrip` over `Object.keys(slotsByDate).sort()`; `Section "Select time"` with
  action-less right text "{n} slots" ("1 slot") 13.5 muted → `ChipRow` of `Chip`s (radio) labelled `formatTime`,
  selected = the slot; `Section "Why are you coming?"` `ChipRow` of APPOINTMENT_REASONS; the sunken note field;
  footer = kit primary "Book an appointment" (disabled until day+time+reason) + the caution well for refusals.
  On success replace the content with the confirmation (72px accent disc + checkmark; title "This time is yours"
  when status confirmed else "We asked the clinic for this time"; `formatWhen`; "You will find the answer under
  Visits."; footer "Done" → `router.dismissTo("/(app)/(tabs)")`). After a refusal re-fetch and keep the pick if
  still offered, as the old wizard did. The request body is unchanged: `requestAppointment({ clinicianUserId,
hospitalId, departmentId, reason, reasonNote, startsAtIso, endsAtIso })`.

### C. Visits `(tabs)/visits.tsx` + Visit `visit/[id].tsx`

- Rows and hero tiles use Day / Time (`formatTime`) — no session words anywhere on these two screens.
- Visit detail: the move panel picks a day (DayStrip) then a time (ChipRow of `formatTime` chips) from the
  clinician's `slotsByDate`; `rescheduleAppointment` gets the chosen slot's instants.
- Rating: when `canRate(visit)` — a `Section "Rate this visit"` card: `StarInput`, an optional comment (sunken,
  ≤ 500), a secondary Button "Send rating" → `rateVisit`; shows the existing rating (fetchMyRating) pre-filled with
  "Update rating"; the server's refusal sentence in the caution well. Never shown for cancelled/no_show/declined.

### D. Settings `(tabs)/settings.tsx` + Today `today.tsx` + Ticket `ticket.tsx`

- Settings profile card: `Avatar(name, 72, uri)` + name + patient code + a link Button "Change photo" → the
  picker flow (`uploadAvatar`); busy state while uploading; a caution well on failure ("Couldn't save your photo.
  Try again."). Remove-photo is out of scope.
- today.tsx / ticket.tsx: remove the `EmergencyNotice`; today gets `trailing={<EmergencyButton/>}`; ticket too.
  The walk-in door keeps its session words (a queue has no clock). Nothing else changes.

## Rules (unchanged from the previous contract + these)

- Every star shown comes from `rating`/`fetchMyRating`; no rating → "No ratings yet". No invented counts; the slot
  count is `slotsByDate[day].length`.
- Red only on the emergency affordances (tab, EmergencyButton). Everything else as before.
- Copy: use the sentences given here; keep the existing ones elsewhere.
- Tokens only; both themes; a11y roles; React Compiler lint; no hooks in helpers.

## Verify (per agent, from mobile/): npx tsc --noEmit · npx eslint <files> --max-warnings=0 · npx prettier --check <files> ·

grep raw colours. Route files → regen typed routes first.
