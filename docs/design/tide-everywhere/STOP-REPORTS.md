# Tide everywhere: STOP reports

**STOP 0 and 1:** see `gate-a-proposal.md`. Everything was signed on 21 Oct 2026.

## STOP 2–4: the foundation, shells and pharmacy (21 Oct 2026)

**Built**
- `app/globals.css`: the lab's re-pin now also applies on `:root:has([data-ds="tide"])`. Added on top:
  - Tide's face (Figtree, display included) and radii;
  - Tide Navy for dark;
  - pill buttons (`.medsync-btn`) and lagoon primary buttons with navy text;
  - neutral row actions in tables;
  - the shared `SIDEBAR_CLASS` (`medsync-rail`) floats as the rail, and the glass top bar sits on the ground;
  - Emergency top right on desks.
- `lib/design/tide.ts` (`TIDE_SURFACES`) and `components/medsync/tide-scope.tsx`, mounted in every route group:
  - pharmacy, doctor, nurse, reception, ncd, hospital-admin and admin;
  - clinician, ipc, hmis and referral-governance (`staff-other`);
  - patient (`patient-web`);
  - (auth), signup, onboarding, get-started, about, feedback, emergency, the landing page, not-found, not-authorised and offline (`public`);
  - resus under doctor and nurse (forced light).
- "Help" on patient and public routes (D-TW-04): `content/tide.ts`, **draft**.
- `DESIGN-medsync.md` rewritten (signed); ADRs 0360–0361; `tests/design/tide-guards.test.ts`.

**Checks**
- Typecheck and lint are clean.
- Full suite: 10,949 passed, 0 failed.
- `next build` passes.
- axe through the CDP harness, `TIDE_SURFACES=1`, light and dark: 0 violations on 14 pharmacy jobs (queue, review, hand-over, open lines, supplied, stock, controlled, downtime, queue at 390) and 3 public routes (`/`, `/sign-in`, `/get-started`).

**Test edits (selector-level only, Law 3):** `tests/emergency/web-pathway.test.ts`, two greps.
- `<EmergencyPill />` now carries the `tide` prop, so the grep matches `<EmergencyPill `.
- The pill's word is now an expression whose staff branch is `"Emergency"`.

**Lab:** no lab file changed, and `data-lab-tide` is untouched (D-TW-13). The lab's tests pass.

**Not done (honest)**
- The per-screen kit conversion (Section 5, Layer 2 components): 37 files still use a native date input, 4 a left bar, 15 a raw hex. Ratchets hold them.
- The 88px icon rail of the pharmacy canvas: the rail keeps its words-and-counts list, floated.
- The Playwright-style parity crawl per role (D-TW-14 uses the harness instead): run only for the pharmacist and public pages.
- Before and after screenshots for every group at four widths: only pharmacy and public were taken.
- The five-day pilot, then the Step 10 deletion of Chroma, the old fonts and `TIDE_SURFACES`: these need the parity sign-off first.

**For the owner**
- Strings to sign: `content/tide.ts` ("Help", "Help, emergency").
- To switch on: set `TIDE_SURFACES=1`, or a list such as `pharmacy,public`, per environment. No migration.
