---
name: patient-app-v2-handoff
description: 17 Nov 2026 cloud-to-Mac handoff of the booking-pilot nested session and the patient app v2 build (Steps 0–12, widgets deferred); branches, signatures, owner items, next steps; plus the phone finish pass 1 of 18 Nov 2026
metadata:
  type: project
---

# Handoff: booking pilot follow-ups and patient app v2 (cloud, 15–17 Nov 2026)

Cloud session session_01AyHv1D2ewdBPDWcVvucFxZ (a nested session of the Tether main chat session_01AyHv1BQVYvi9chtZG8652e) ran two threads. The patient app v2 build ran in its own nested session, session_01AyHv1EmYfFgC7sodexhkEn. Neither conversation can be opened on the Mac. This file is what they knew. Owner rules: [[medsync-owner-rules]].

## 1. Booking pilot branches (done)

| Branch                           | Tip     | State                                                                                                                                                                                                                            |
| -------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude/booking-pilot-onto-main` | c16ab37 | Pilot numbers + clinic set-up guide cherry-picked onto main; docs rewritten for Clinics & schedule (ADR 0508); desk "Running late" steps in RECEPTION-TRAINING. Main later took #308/#310, so check it is merged before using it |
| `claude/booking-pilot-go-live`   | fb89678 | 15-min reminder cron + GO-LIVE.md. **Waits for Vercel Pro.** Main shows a go-live PR #310: check whether this cron is already on main and that Pro is on before any deploy                                                       |

Open: reminder toggle says "Sent at 18:00 the evening before" but the daily cron runs 08:00 EAT until Pro (wording change needs the CSO).

## 2. Patient app v2 (`feat/patient-app-v2`)

Prompt: the owner's "Tether patient app v2, phone and web, with booking payments" (gated, Steps 0–12). Branch was cut from main 971b9da after PR #314 (Apple HIG + Expo SDK 58, ADR 0515) was merged.

**State on 17 Nov:** Steps 0–10 and 12 done and pushed (tip af8d670). Step 11 (widgets) deferred by the owner: "lets first leave out widgets"; options in `docs/patient-app/step11-dependencies.md` (recommended `expo-widgets@58.0.28`). Read `docs/patient-app/REPORT.md` first, then `parity-phone.md`, `parity-web.md`, `gate-a-proposal.md`, `gate-a-amendment-1.md`, `payments-setup.md`, `business-model.md`.

**Already on main:** the first half (migrations 0299–0301, ADRs 0516–0519) reached main before the PR. ADR 0520 on main is "one admin workspace", so v2's Plus ADR is renumbered to **0523**.

**PR #318 open (17 Nov):** https://github.com/justfadhul/medsync/pull/318, feat/patient-app-v2 @ 9b0e88a → main. origin/main is merged in, the CHANGELOG conflict is resolved, and the Plus ADR is renumbered 0520 → 0523. After the merge: typecheck and lint clean; vitest 12,598 pass, once `mobile/` dependencies are installed. Merging is the owner's.

**Flags (all off; `appV2Mobile` was removed on 18 Nov, see section 3):** `appV2Web`, `careMode` (locked in code: `GATE_CG_SIGNED = false`), `mobilePayments` (sandbox only).

**Signed by the owner/CSO in chat, 16 Nov:**

- GATE A §6 block, A1–A5, the feature matrix and renames.json;
- D-PA-07: 30-day credit, then refund on request;
- amendment 1 (MR9: safety free, programmes paid);
- Plus prices 5,000 / 10,000 / 13,000 a month;
- very high BP at 180 or 110;
- red danger hero on both red allowlists;
- stage 3 wording;
- all STOP 4/5 departures.

**Still the owner's:**

1. Sign `parity-phone.md` and `parity-web.md` (gaps: phone 17, web 13).
2. ~~Apply migrations~~ **Done 17 Nov:** the owner applied 0299–0304 from a tablet in the Supabase SQL Editor (each wrapped in begin/commit and recorded in `_medsync_migrations`). Earlier, 0297 was confirmed applied (15 Nov).
3. Secrets: `MEDICAL_ID_TOKEN_SECRET` (32+ chars) and `PAY_WEBHOOK_SECRET` on the functions. Keep `PAY_SANDBOX_*` off production.
4. Deploy the new Edge Functions after merge: pt-pay-intent, pt-refund-request, ha-refund-decide, ha-pay-desk, pt-care-reading, pt-dose-event, pt-care-message, pt-programme-bill, pt-plus, pt-medical-id-token.
5. Payments:
   - choose the provider, Flutterwave or Pesapal (fees, refund API and callback signing not verified);
   - each hospital's merchant agreement;
   - Tether's own agreement for Plus;
   - approve Tether's share on care programme bills (`platform_share_ugx`; needs a provider with UGX split).
6. Care mode:
   - sign the danger-flow wording, including the sugar recheck at 15 min (prompt) or 5 (old phone screen);
   - sign the BP "rest 5 min" step;
   - then Gate CG.
7. Sign the draft strings in `content/patient-app/`. Never edit a `*_COPY_STATUS`.
8. Pilot: `appV2Web` on for one hospital for 5 days, then remove the old web screens (legacy app/patient redirects are already in MOVED). The phone is v2 by default since 18 Nov (section 3).
9. Measure budgets (2 GB Android, iPhone, production web build): not measured in the cloud.
10. Widgets later: App Group, APNs Live Activity key, EAS dev build.

**Known gaps:**

- the full Readings page reuses Add a reading/Trends;
- checks never show Done (no done dates);
- payment SMS drafted but not wired to the dispatcher;
- web ticket says "You" (no name data);
- the doctor's-times booking stays on the old screen;
- Plan goals wait for a targets format.

## 3. Phone finish, pass 1, and v2 as the phone's default (Mac, 18 Nov 2026)

The owner opened the phone app with `appV2Mobile` on and said it "is still showing the old UI": the flag only swapped a few screens inside the old shell. Pass 1 (branch `claude/patient-app-v2-phone-finish-2a8f7a`, PR against main) gives the phone what the web got in PR #322. During the work the owner chose **"v2 by default, old as fallback"**, phone only (**ADR 0524**): the `appV2Mobile` switch is removed.

- **Built:** the Visit-mode tab bar (Home, Book, Visits, Me; the plus beside it), the avatar with the unseen count, a v2 Home with a state for no visit booked, and Tether as the name everywhere a patient reads. Files: `mobile/src/components/tide/v2-shell.tsx`, `features/v2/home.tsx`, `home-route.tsx`, `header-avatar.tsx`, `lib/brand.ts`, `(tabs)/booking.tsx`. Parity rows 1.1 (part), 1.3, 1.11, 3.1.
- **Old screens kept as fallback, reached from v2:** confirm, move and cancel a visit (`/visits/[id]?manage=1`, from the v2 visit page); the week calendar ("Week" on Visits); the Care screen and Wellness (rows on Home while Care mode is locked); "See a doctor" (on Home); the offline health card and settings on Me.
- **Removed:** the old "your day" Home, the simulated pay-now step when asking for a day, the MedSync wordmark. `TideNav` (the old bar) is still in the kit, used only by the dev gallery.
- **Unchanged:** `careMode` and `GATE_CG_SIGNED = false`; `mobilePayments` (off: v2 then offers no Mobile Money and says to pay at the hospital); the web; the consent text.
- **Gallery:** `/dev/visit-v2?screen=home` is the whole shell on fixtures (`&visit=none|loading|failed|next`, `&scheme=dark`).
- **Left out:** the hospitals list (6.3), the v2 settings list (6.4), Care mode's places, folding the old health card into the v2 card on Me, the native splash, app name and icon.
- **Frosted nav (18 Nov, branch `feat/phone-nav-frosted-glass`, check it is merged):** the pill is `GlassView` from `expo-glass-effect` where `isLiquidGlassAvailable()` (iOS 26+), tinted with the raised surface at about 35 %, solid elsewhere; the page scrolls under it (no bottom fade on glass); it sits 4 pt above the home indicator (`visitNavBottom`). Seen in the iOS Simulator, light and dark; not on a real phone or Android. In jest the glass mock reports available, so tests draw the glass pill.
- **Screens redrawn (18 Nov, branch `feat/phone-screens-redraw`, stacked on the frosted-nav branch; check it is merged):** Home, Book, Visits and Me follow the owner's approved prototype (canvas "Tether Home prototype"). Home is one visit card (`VisitCard`, `StageBar` in `features/v2/home.tsx`), "Your care" with four doors, and people chips; the plus is glass on Home (`plusQuiet`) and its menu (`app/(app)/add.tsx`) is one column rising from the plus. Book (`book/index.tsx`) asks one question at a time with a rail; `WhyComing` is split into `WrongAreas` and `PlannedReasons`. Visits (`features/v2/visits-list.tsx`) has a filter by person. Me shows the membership card and one line to the plans, which are their own page (`app/(app)/plans.tsx`, `MeMembershipV2` part `card` or `plans`). **Two traps met:** a `GlassView` laid inside a `Press` takes the touch (put the control inside the glass, as the pill does), and a new route under `(app)` must be listed in `(app)/_layout.tsx` inside the consent gate, or the app opens on it. **One card on Me (owner, 18 Nov):** `components/tide/tether-card.tsx` folds the membership card and the offline health card into one (front: membership; back: Medical ID with every line the health card's back had); `MeMembershipV2` part `card` draws it through `renderCard`, and `MeMembershipRoute` draws it with no plan and no code while the membership has not loaded, so it shows offline. **Left for the owner or CSO:** the CSO's look at the merged card's back, a Monthly or Yearly switch on the plans (the phone pays monthly only), "Same as last time" on Book (no last reason is held), and the new draft strings "Readings" and "Medicines".
- **Onboarding redrawn (18 Nov, same branch):** the splash, the welcome, sign-up and sign-in follow the owner's approved onboarding prototype, look and flow only (no rule, wording, auth call or splash timing changed). `features/auth/welcome.tsx` draws the splash and the three welcome slides (`SplashView`; `app/index.tsx` still decides when); `features/auth/marks.tsx` is the status language (tick, triangle, ring, all ink: `StatusField`, `StepRail`, `StillNeeded`, `CodeBoxes`); the routes export pure views (`SignUpView`, `SignInView`, `PasswordFormView`, `PhoneCodeView`) so `/dev/onboarding?screen=…` draws every state on fixtures. `Screen` has `barTitle`. **Left for the owner or CSO:** the new draft strings (CHANGELOG), the dated sample words in the welcome drawings, the navy native launch screen before a light splash, and a look with Reduce Motion on and on a real phone.
- **For the owner before a release build:** the CSO's sign-off on the draft v2 wording, which is now the default (`content/patient-app/`, including `HOME_V2_COPY.phone`); a look on a real phone; the Help crawl test names `(tabs)/booking.tsx` (a clinical-safety review item).
- **Not seen on a device:** checked with `expo start --web` at phone width only (no Xcode on this Mac). `prettier --check` on `mobile/src` already fails on main for older files; no file touched here fails. The root pre-commit typecheck needs `NODE_OPTIONS=--max-old-space-size=8192` on this 8 GB Mac.

**Not from this work:** 38 PGlite EMR-lane failures already on main (14 Drizzle parity, rls-probes, pharmacy, others).

**Why:** the owner moved back to the Mac on 17 Nov and asked for a handoff.
**How to apply:** first finish the PR (section 2), then work the owner list. Patient app copy and clinical content stay draft until the owner signs.
