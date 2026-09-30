# ADR 0193 — The bed services catalogue

**Status:** Proposed — 2026-09-29. The list and its glyphs are prototype inventions for the owner to confirm.

## Context

A patient on oxygen needs a free bed with wall oxygen. Answering that needs the services at each bed recorded
the same way everywhere, and queried in one step.

## Decision

1. **A fixed v1 catalogue** of service codes, each with a label, a short plan glyph and a group:

   | Group               | Code                | Label                    | Glyph |
   | ------------------- | ------------------- | ------------------------ | ----- |
   | Piped services      | `o2`                | Wall oxygen              | O₂    |
   |                     | `suction`           | Wall suction             | S     |
   |                     | `air`               | Medical air              | Air   |
   | Monitoring and call | `monitor`           | Cardiac monitor          | M     |
   |                     | `call`              | Nurse call               | C     |
   |                     | `power`             | Power sockets            | Pw    |
   | At the bedside      | `pump`              | Infusion pump            | P     |
   |                     | `iv_pole`           | IV pole                  | IV    |
   |                     | `locker`            | Locker                   | L     |
   |                     | `overbed_table`     | Overbed table            | T     |
   |                     | `pressure_mattress` | Pressure-relief mattress | PR    |
   |                     | `curtain_track`     | Privacy curtain track    | Cu    |

   The plan shows O₂, S and M on the bed; the rest show in the inspector and on the board.

2. **Stored per bed in `hospital_bed_services`** (bed, code; unique pair; a check on the catalogue), written only
   by publish, so "free beds with oxygen" is one query over beds, services and state.
3. **Room features** (toilet or shower, hand-wash, anteroom, negative pressure) belong to the room and stay in
   the layout document.
4. **Nothing is assumed.** A new bed starts with no services recorded; the admin records what is there. _Row of
   beds_ can record wall oxygen for the whole row, and the _High dependency_ template says in its name that it
   records full services.

## Consequences

- Adding a service is a catalogue change and a migration (the check constraint), deliberately.
- The coverage bars and the checks read the same catalogue as the board.

## Alternatives considered

- **Services in the document only:** the board would parse every ward's document to find a bed with oxygen.
- **The prototype's defaults** (nurse call, locker and curtain on every new bed): would record equipment
  nobody confirmed.
