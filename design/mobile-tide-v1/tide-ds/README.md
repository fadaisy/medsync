# MedSync Tide

MedSync Tide is the design language of the MedSync patient app. It is calm, rounded and generous: a soft grey ground, navy ink, white cards, pill-shaped controls, and one bright lagoon accent for the thing to do now. A patient's day reads as a tide of cards, deep navy for what is done and lagoon for what is due.

Tide sits beside **MedSync Chroma**, the dense staff system used on the web. The two share MedSync's safety laws and the clinical status colours, unchanged. They differ on purpose in density, type and shape, because a nurse at a desk and a patient in a queue need different things.

## Principles

- **One thing at a time.** Every screen has one headline and one main action. The day is shown in order, so a patient never has to work out what comes next.
- **Navy holds, lagoon acts.** Navy is the ink and the done. Lagoon is the button, the selected segment, the centre plus and the card that is due now. Nothing else is lagoon.
- **Red, amber and green belong to health.** Red is the Help button, "Get help now" and a dangerous reading. Amber is "above your target". Green is "in your range". None of them is ever decoration, a category or an offline message.
- **Colour by order, place by dot.** Cascade cards change tone with time, not with topic. Which part of the app something belongs to is shown by a small area dot and its word, as in the reference's "Personal" and "Work" tags.
- **An icon never travels alone.** Every icon carries its word, the nav included. Many patients read slowly. Key screens offer "Read this to me".
- **Big enough to hit in a queue.** Nothing a thumb touches is under 48px. Primary buttons are 52px pills.
- **Works on 2G.** Every screen draws six states: loading, nothing yet, couldn't load, no signal, waiting to send, done.

## Content fundamentals

- **Second person, plain words, short sentences.** "Sit and rest for five minutes first." Not "Ensure adequate rest prior to measurement."
- **Say the fact and its basis.** "138/86 · above your target of 140/90", never "BP slightly elevated".
- **Never promise the hour.** "We save your place in line. We cannot tell you the hour." Said once, where the patient commits.
- **Sentence case** everywhere. ALL CAPS only through `overline`.
- **Dates** `Thu 30 Oct`, times 24-hour `13:00`, codes in mono `K7M-42Q`. Units always shown, smaller than the value.
- **No emoji. No invented data.** Mocks use placeholders like `[Medicine name]` and say "Illustrative. No real patients."
- **No doses** anywhere on a screen unless the Clinical Safety Officer has signed that content.
- **Discreet by default.** Lock-screen notifications and SMS never name a medicine or a condition. Phones are shared.

## Colour

Four jobs. Every colour belongs to one.

| Job | Tokens | Where |
| --- | --- | --- |
| Ground | `bg`, `surface`, `surface-raised`, `surface-sunken`, `ink`, `ink-2`, `ink-3`, `line`, `line-strong` | Pages, cards, text, hairlines |
| Action | `accent`, `accent-on`, `accent-text`, `accent-tint`, `focus` | Primary pills, centre plus, selected segment, nav dot, links |
| Order | `cascade-1` to `cascade-3`, `cascade-now`, `cascade-next`, `navy-*`, `on-band`, `on-band-2` | The day cascade, header bands, the date tile |
| Health | `status-*`, `emergency`, `on-emergency` | Reading pills, out-of-range values, Help |

Area dots (`area-readings`, `area-medicines`, `area-visits`, `area-team`, `area-me`) are dots and icons only. They never fill behind text and never colour a button.

**Two themes.** Light is the soft grey day. Navy is the night: the ground turns `navy-900`, cards turn `navy-800`, and the cascade keeps its tones. There is no pure black and no pure white text in Navy.

**Rules**
- Lagoon always carries navy text (`accent-on`). White on lagoon fails.
- Lagoon as text is `accent-text`, never `accent`.
- One lagoon fill per screen region. If two things look like the main action, one of them is wrong.
- Offline, loading and errors are grey (`surface-sunken`, `ink-2`). Never amber, never red.
- No gradients. A cascade is flat blocks of different tones, stacked.
- No left-edge accent bars. State shows through a pill, an icon and a word.

## Typography

| Family | Face | Use |
| --- | --- | --- |
| `sans` | **Figtree** (Google Fonts) | Everything: headlines, body, numbers, nav |
| `mono` | **Geist Mono** (Google Fonts) | Booking codes only |

- Headlines are `display`, 36/40 at weight 500: large but not heavy, like the reference's "Check your schedule today".
- Body is 17, the phone default. All sizes follow the phone's text setting up to 200%; layouts reflow, never clip.
- Dates in the rail and reading values use `numeral` 30/32 at 600 with tabular figures.
- Bold 700 is only for an out-of-range value, in `status-critical-fg`, with an arrow.
- Figtree covers Latin Extended-A, which includes Luganda's ŋ. Check every new face for it before adopting it.

## Shape and space

- Radii: `radius-sm` 10 tags, `radius-md` 14 fields, `radius-lg` 22 cards, `radius-xl` 28 cascade cards and sheets, `radius-pill` for every button, segment and the nav.
- Page gutter `space-5` 20. Card padding `space-4` 16.
- **The cascade:** each card overlaps the one before by `cascade-overlap` (32px, always more than the 28px corner radius, so no square corner peeks out), top corners `radius-xl`, so the stack reads as one object, earliest at the top.
- **The date rail bleeds into the bezel.** The selected date tile sits flush against the screen's left edge, square on the left and `radius-lg` on the right, as if pulled out of the phone. Other dates float on the ground with no tile.

## Elevation

`shadow-card` for cards and the date tile. `shadow-float` for the nav pill, sheets and toasts. `shadow-accent` glows only under the centre plus and the primary pill. `shadow-emergency` sits only under Help. Navy uses darker, shorter shadows.

## Navigation

A floating pill above the home indicator, `nav-h` 72, inset 16 from the screen edges, `surface-raised` with `shadow-float`. Its top edge rises in a soft bump around the centre plus. Five places: **Home, Visits, [+], Care, Me**. The current place shows its icon and word in `ink` at 600 with a lagoon dot beneath. The others are `ink-3`. The centre plus opens "What do you want to do?": log a reading, I took a medicine, book a visit, tell my care team something.

**Help is never in the nav.** A red `Help` pill sits in the top-right of every screen's header, signed in or not, beside the notifications bell.

## Motion and touch

- 150ms ease-out for presses and segment changes. Cards rise into place at 250ms.
- A light haptic on every press, a success haptic when a dose or reading is saved, one strong haptic for a dangerous reading. Nothing flashes, nothing repeats.
- Reduced motion: fades only.

## Iconography

Lucide, outline, 1.75px stroke, round caps and joins. 22px in the nav, 20px in rows, 16px in tags and pills. Icons are `ink` or `ink-3`, an area colour in place tiles, `accent-on` on lagoon, `on-band` on navy.

## Never

- Orange, coral or peach anywhere. In MedSync those read as caution about your health.
- A place colour on a button, a count or a status.
- Red as a notification badge. Counts are `ink` on `surface`.
- Icon-only controls (the nav included).
- Grey text on a coloured card below 4.5:1.
- Inter, Roboto or Arial.
