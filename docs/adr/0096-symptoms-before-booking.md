# ADR 0096 — Symptoms chosen before booking: the shortlist under "How are you feeling today?"

**Status:** Accepted — product-owner decision (2026-09-21); carries [ADR 0095](0095-symptoms-at-booking-staff-card-custom-blocks.md)'s
**PROVISIONAL** mark, since it moves the same question earlier in the flow.

**Builds on** [ADR 0095](0095-symptoms-at-booking-staff-card-custom-blocks.md) (symptoms as words only) and
[ADR 0085](0085-photos-ratings-times-emergency-tab.md) §4 (the home's question was a heading, not an input).
**Supersedes in part:** the `REFERENCE-LANGUAGE.md` ban on "How are you feeling today?" — the phrase stays banned as a
_self-rating prompt_; it is now sanctioned as the heading over a **descriptive** shortlist.

## Context

ADR 0095 put the symptom selector inside the booking flow — on the reason step of the web wizard, in the phone's
confirm sheet. The owner's ask (2026-09-21, after the round shipped): "allow users to select symptoms before booking,
and display these symptoms — not all of them — under the how are you feeling question." The patient home on the phone
already carries that heading; the web home has no such block.

## Decision

1. **(owner) The patient picks symptoms on the home, before choosing where to book.** Under "How are you feeling
   today?" — kept in the owner's words — a shortlist of catalogue symptoms as toggle chips, and "More…" reaching the
   whole catalogue with search. Web and phone. Only when the patient has a hospital (there is nowhere to book
   otherwise).
2. **(build) The shortlist is the catalogue's first eight in its own order** — `QUICK_PICK_CODES` in
   `supabase/functions/_shared/symptoms.ts`, the IM-first seed's `sort_order` 10…80 (migration 0042). A rule, not a
   curation: nothing here ranks symptoms by frequency, flag or system. To show a different eight, edit the list —
   one line, no migration; it is a CSO item like every other patient-facing clinical word.
3. **(build) Durations are still asked at booking.** The home records words only (`duration: null`); the booking
   selector lists them first with their duration rows and holds Continue until each has one, exactly as before. The
   boundary sentence (`SYMPTOMS_NOTE`) is shown under the shortlist too — wherever a selector is, it is.
4. **(build) How the picks travel.** Web: `sessionStorage` (`lib/patient/pending-symptoms.ts`) — survives browsing
   clinics and doctors, stays in the tab, cleared when a booking lands; the wizard seeds an empty draft from it.
   Phone: an in-memory store (`mobile/src/lib/pending-symptoms.ts`) the home chips and both booking screens share;
   every change on either side writes back; cleared when a booking lands. A relaunch starts clean — a draft of one
   visit is not a record.
5. **(build) What did not change.** Nothing reads the picks before the booking is filed; nothing orders, routes or
   colours by them; the firewall test's assessment-vocabulary and sort/filter guards now cover the two shortlist
   components as selector surfaces.

## Consequences

- The heading over the doors now has input under it. The regulatory reading is ADR 0095's: the software takes the
  words and carries them; it produces no judgement. The CSO re-read that ADR 0095 asks for covers this.
- Three copies of "which eight" would drift; there is one, in the shared module, and the two homes read it.
- A patient who picks on the home and then closes the tab loses the picks (web) — by design; the wizard's own draft
  keeps them once the wizard has them.

## Alternatives considered

- **The first eight by `sort_order` computed at read time.** Rejected: reordering would need a governed catalogue
  migration; a list in the shared module is the honest, cheap knob.
- **A curated "common in Uganda" eight.** Rejected: nobody here can sign that; it is fabricated prioritisation until
  the CSO writes it.
- **Carrying the picks in the URL.** Rejected: every clinic and doctor link would have to thread them; storage
  survives the browse.
