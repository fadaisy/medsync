# MedSync Design System — Tide

**Status:** Active — MedSync Tide everywhere ([ADR 0360](docs/adr/0360-medsync-tide-single-web-design-system.md)), signed by Fadhul (CSO) 21 Oct 2026. Supersedes MedSync Chroma (ADR 0162), which is retired surface by surface behind `TIDE_SURFACES` and deleted at Step 10 of `PROMPT-TIDE-WEB-MIGRATION.md`.
**Owner:** Usama Fadhul

This document is the authoritative source for every visual and interactive decision in MedSync, and it wins every visual disagreement. Tide's source of truth is `docs/design/tide/README.md` and `docs/design/tide/tokens.json` (from the MedSync Tide design system artifact). Tokens live in `app/globals.css`; until Step 10, a surface turns Tide when its layout renders `data-ds="tide"` (`components/medsync/tide-scope.tsx`), which re-pins the old token names to Tide values (ADR 0361).

MedSync Tide is calm, rounded and generous: a soft grey ground, navy ink, white cards, pill controls, and one bright lagoon accent for the thing to do now. It is one language at three densities.

## Densities (D-TW-02)

| | Desk (staff, admin) | Phone (patient web) | Public (landing, sign-in, onboarding) |
|---|---|---|---|
| Body | 13–14px, table cells 13px | 17/25, to 200% | 17/25 |
| Page title | 24/28 at 500 | `display` 36/40 at 500 | hero 56/60 desktop, 40/44 at 390 (D-TW-05) |
| Buttons | pills, 36px (small 30px) | 52px pills | 52px pills |
| Targets | ≥ 44px | ≥ 48px | ≥ 48px |
| Radii | cards 18, tiles 16, rows 12, fields 10–12 | cards 22, cascade 28 | cards 22 |
| Navigation | floating rail, icon plus word, lagoon dot under the current place, counts in ink | top bar: mark, back, Help | top bar: mark, links, Sign in, Help |
| Emergency | **Emergency** red pill, top right | **Help** red pill | **Help** red pill |

The reference for the desk is the lab (`app/lab/_components/v2`, ADR 0344) and the *Pharmacy Phase 1 · Tide* canvas (`docs/design/canvases/pharmacy-phase-1-tide/`).

## Colour laws (Law 6)

- **Lagoon acts:** a region's primary action, the selected segment, the current nav dot, the "now" mark. One lagoon fill per region. Lagoon always carries navy text (`accent-on`); as text it is `accent-text`.
- **Navy holds:** ink, bands, done.
- **Plum is place** (D-TW-12): the acting ward, clinic or dispensing point, and avatars. Never a button, a count or a state.
- **Red is a safety property:** Emergency and Help, a genuine clinical emergency, a critical alert. Nothing else.
- **Amber is caution** (D-TW-08), always with an icon and a word: awaiting co-sign, changed since printing, late, overdue, held. Never offline or loading.
- **Green is clinical only:** "in range" on a patient reading. Staff workflow states ("passed", "supplied", "done") are neutral pills with a check.
- **No** orange, coral or peach. No gradients. No left-edge accent bars. Never colour alone.
- The clinical status tokens and the triage scale are CSO-owned and unchanged.

**Area dots** sit on each space's overline only, never behind text, never on a button:

| Space | Token |
|---|---|
| Pharmacy, lab, medicines | `area-medicines` |
| Doctor, nurse, encounters | `area-readings` |
| Reception, visits | `area-visits` |
| Care team, NCD registry | `area-team` |
| Admin, superadmin, account | `area-me` |

## Typography (D-TW-03)

Figtree for all text; Geist Mono for identifiers and codes only. Sentence case everywhere; ALL CAPS only as the overline. Dates `Mon 19 Oct` in headers and fields, `19 OCT 2026` in tables, 24-hour times.

## Screen rules (Section 4)

1. One headline and one main action per region.
2. One task per view: unrelated forms become tabs.
3. The field kit: one date-and-time field with quick picks (never a native `type="date"`), pick by name, chips for four or fewer choices, numbers with locked units, **a disabled button always says why**, and three empty kinds (`empty`, `no_data`, `not_set`).
4. A navy patient band, with both identifiers, wherever a screen works on one patient.
5. Numbered sections for any form with more than three groups. No Next buttons between sections.
6. Dialogs are centred landscape `EditorDialog`s (ADR 0161). No side sheets.
7. Desks are fluid from 1280 to 1920; below 1024 the rail becomes a top row of icon-and-word tabs; wide tables scroll inside their card.
8. Every state is honest: loading, nothing yet, couldn't load, offline, waiting to send, done. Offline and loading are grey.
9. Paper is print CSS only, black on white, Figtree.

## Forced light (Law 8)

The symptom catalogue and its emergency interrupt, the patient danger interrupt, Help and SOS, and the resus desk (D-TW-07) stay light in every theme (`TideScope light`).

## Dark (D-TW-11)

Every surface that supported dark ships Tide Navy (`tokens.json` dark column). Light-only surfaces stay light-only.

## Motion

150ms ease-out for presses and segment changes; cards rise at 250ms; reduced motion fades only. No decorative animation.

## Iconography

Lucide, outline, 1.75px stroke. Every icon carries its word.

## Retired

MedSync Chroma's place hues, Bricolage Grotesque and Geist sans are retired. They stay in `app/globals.css` until the Step 10 deletion, for surfaces not yet switched on.

---

## Resus state colour system (resus surface — GATE A of the visual rework)

Semantic, glanceable state colour for the ABCDE resus surface — colour **means state**, not decoration. Discipline: **alarm scarcity** — red (`rose`) is reserved for a genuine life threat (active-threat step) or a **failed** action. Everything else uses the calm ramp (teal = good/done, amber = open/recommended, grey = pending/parked). **Never colour alone** — every state also carries a word + (for actions) a Lucide icon, and meets WCAG 2.2 AA in light/dark.

> **No left-edge accent bars** (standing project rule): state is conveyed by **full border + tinted fill + ring + a coloured letter/state chip + icon + word** — never a coloured left stripe.

### ABCDE step-bar states (`lib/resus/engine` status → visual)

| Visual state      | Engine source                                                                                  | Card                                                                                       | Letter chip                         |
| ----------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------- |
| **Pending**       | `stepStatus = pending`                                                                         | neutral grey — `border-border bg-muted/30`                                                 | `bg-muted text-muted-foreground`    |
| **Clear**         | `stepStatus = clear`                                                                           | teal — `border-teal-300/70 bg-teal-50/60` (dark `bg-teal-950/25`)                          | `bg-teal-100 text-teal-700`         |
| **Addressed**     | `stepStatus = addressed`                                                                       | deep teal, settled — `border-teal-600/60 bg-teal-600/10`                                   | **filled** `bg-teal-700 text-white` |
| **Threatened**    | `stepStatus = open` (no life-threat-now)                                                       | amber — `border-amber-300/80 bg-amber-50/70` (dark `bg-amber-950/25`)                      | `bg-amber-400 text-amber-950`       |
| **Active threat** | `open` + life-threat-now (e.g. airway `completely_obstructed`/`apnoeic_*`, or arrest detected) | **filled red, loudest** — `border-rose-600 bg-rose-600 text-white ring-1 ring-rose-500/50` | `bg-white text-rose-700`            |

- **Focus vs state are separate:** the _current/focused_ step gets a brand **teal focus ring** (`ring-2 ring-teal-500/70 ring-offset-1`) — a step can be focused AND threatened. The recommended-next step gets a subtle teal dashed outline (not red).
- Active-threat is **calm-but-unmissable** — filled + ring, **no flashing** (reduced-motion-safe by construction; any pulse is `motion-safe:` only).

### Action-state tokens (`indicated / in_progress / performed / not_indicated / deferred / failed`)

| State                    | Meaning                           | Token (fill / text)                                                                        | Icon (Lucide)   |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------ | --------------- |
| **Indicated**            | recommended, not yet done         | amber `bg-amber-100 text-amber-800`                                                        | `CircleDot`     |
| **In progress**          | being performed now               | blue `bg-blue-100 text-blue-800` (subtle `motion-safe` pulse)                              | `LoaderCircle`  |
| **Performed**            | done                              | teal/green `bg-teal-100 text-teal-800`                                                     | `Check`         |
| **Failed / ineffective** | tried, didn't work → **escalate** | red `bg-rose-100 text-rose-700` (the only action alarm; surfaces the next-tier escalation) | `TriangleAlert` |
| **Deferred**             | consciously postponed             | muted grey `bg-muted text-muted-foreground`                                                | `Pause`         |
| **Not indicated (N/A)**  | not applicable                    | outline only, recessive `text-muted-foreground/60`                                         | `Minus`         |

- The **active** state is a **filled coloured token** (icon + word); the other states are quieter controls to change it.
- **Failed** is the action alarm — it tints the card and highlights the `escalatesTo` next-tier action.
- Indicated (amber) is the "do this next" cue; the clinician's eye is drawn to **amber (do)** and **red (failed → escalate)**.

### Timeline + findings

- The immutable record (right rail) tints each entry subtly by state (`failed` → faint rose, `performed` → faint teal, danger assessment → faint rose) — scannable by state, never shouting.
- **Findings stay calmer than actions** (findings _describe_; actions are where colour-as-state matters): a selected finding uses the brand **teal** selected state; the airway-STATE indicator carries the urgency, not the individual chips.

Reused by every ABCDE step (B/C/D/E) so the whole resus surface stays consistent.

## Laboratory workspace — MedSync Tide at desk density (ADR 0344; CSO signature pending)

`/lab` is the one staff surface on Tide. Every rule above still applies, except where this section says otherwise. Other staff workspaces stay on Chroma.

- **Scope.** The tokens apply only while the lab shell (`data-lab-tide`) is on the page: `:root:has([data-lab-tide])` in `app/globals.css`. Use the semantic classes and the `tide-*` utilities; never use raw hex.
- **Ground and ink.** The ground is soft grey `#f6f7f9`, with white cards (`shadow-tide-card`, radius 18). The ink ramp is navy-tinted, ink-900 being `#1b2540`.
- **Accent.**
  - The lagoon fill (`bg-tide-lagoon`, `#2dd4bf`) always carries navy text (`text-tide-on-lagoon`). Lagoon fills only:
    - the one primary action of a card or panel;
    - the current place's dot;
    - the selected queue row's tint.
  - Lagoon is never text. Links and focus stay teal-700 (`text-primary`, the `accent-text` role).
- **Navy band.** `bg-tide-navy-900` with `text-tide-on-band` / `-on-band-2` marks the patient band and the Today hero. Both text tokens are at least 4.5:1.
- **Type.**
  - Figtree is the text face; Geist Mono is for identifiers only (lab number, hospital number, form and manifest numbers).
  - A figure is never in code type.
  - Body is 13–14px. The page title is 24/28 at weight 500, one per screen, in the top bar.
- **Shape and size.**
  - Radii: cards 18, tiles 16, rows 12, fields 10.
  - Heights: buttons 36, small buttons 30, table rows at least 44, rail items at least 54.
  - Tabs and chips are pills.
- **Colour.**
  - Red appears only for a critical (`CriticalPill`, `CriticalTile`, `ResultValueText`) and the Emergency button (`EmergencyInline`).
  - Amber (`Pill tone="caution"`) is for late, held, delta waiting, overdue, quarantined and down.
  - **Nothing in the lab is green.** "Passed" is a neutral pill with a check.
  - Change lines are an arrow and words in ink, never a coloured badge.
- **Field kit (ADR 0348).**
  - No native date inputs: use `DateTimeField` / `DateField`.
  - Pick by name with `PickField`; chips for four or fewer options.
  - A disabled `LabButton` always prints its reason.
  - Three kinds of nothing: an empty list says why and what next; "No data" is muted; "Not set" names who sets it.
  - No dashed boxes.
- **Charts.** Hand-built SVG in the cascade tones. Each has a text alternative, and the larger ones a "view as table" disclosure. Marks differ by shape or lightness as well as hue.
- **Not adopted.** Tide's lagoon glow (`shadow-accent`): this system forbids glows.
- **Pop-ups** stay centred dialogs.
- **Dark.** Values are written but not shipped; the lab ships light.
