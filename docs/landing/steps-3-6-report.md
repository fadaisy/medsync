# Tether landing, Steps 3 to 6

13 Nov 2026 · branch `feat/landing-tether` · commits `3671685b` (Steps 3–6) and `cdcd680d` (fixes found at Step 7).
Fadhul said "go through all gates", so STOPs 3 to 6 were not held one by one. Each is recorded here; nothing in
them is signed by this report.

## STOP 3: hero and the example ticket

- **Built:** `hero.tsx` (headline rotator, sub-line, CTAs, phone notification, desktop SMS card, actions) and
  `ticket.tsx` (`ExampleTicket`). The ticket is driven by props only (`status`, `statusWord`, `waiting`,
  `doctor`, `note`, `fields`, `flipped`, `onTurn`), so the reception desk can share it. Turn, tear (57 px, plus a
  hidden button), and copy ("Copied" for 1.6 s; a drag never copies) live inside.
- **Example date** (D-LP-08): six days ahead at 10:40 Kampala, from the server's clock, refreshed hourly
  (`lib/landing/example-visit.ts`, tested across a month end and a year end).
- **Scenarios S5–S8:** pass.
- **Simpler than the canvas:** the doctor line shows initials and does not rotate names (D-LP-04). A plain
  underline replaces the hand-drawn squiggle, and a box shadow replaces the drop shadow that followed the
  notch. Both changes keep LCP on the headline (see REPORT.md).

## STOP 4: statement, How it works, Ways to book

- **Built:** `statement.tsx` (the words light up with scroll, from CSS only), `steps.tsx` (the desktop wave
  with arcs drawn in turn, and the phone snap cards with dots), and `modes.tsx` (the segmented control, facts,
  the honesty line, the ticket per mode, and swipe on the phone).
- **Reduced motion, or no view timelines:** everything shows at once.
- **Scenarios S9–S11:** pass.
- **Changed at Step 7:** the fourth phone card leans toward cascade-3, because white text on cascade-4 is
  3.4 : 1. The statement now finishes by the time it is centred.

## STOP 5: Patients and clinics, Coming next, Questions

- **Built:** `duo.tsx` (booked → coming → here, with the patient/reception switch, toasts and the flash row),
  `coming.tsx` (navy band; phone cards marked "Soon"; the future link hidden, D-LP-10), and `questions.tsx`
  (search, chips, the desktop list and answer panel, the phone accordion). The emergency question comes first.
  Its pre-alert answer shows only while the pre-alert flag is on (D-LP-06).
- **Scenarios S12–S14:** pass. S15 does not apply, because the future link is hidden.

## STOP 6: Footer and the clinic form

- **Built:** `footer.tsx` (navy panel, closing line, desktop columns, phone grouped list) and `ClinicForm` →
  `app/tether/actions.ts` `registerClinic`.
- **How the form handles input:**
  - It checks the address (`lib/landing/lead.ts`).
  - A filled honeypot, or more than 5 sends an hour, gets a silent "thank you".
  - The address is stored with the service role. The log never holds the address.
- **Migration `0293_clinic_leads.sql`:** RLS is forced, anon gets nothing, and only a superadmin can read.
  **Not applied.**
- **S16:** a bad address and the honeypot both pass. Storing a row (S16b) and the anon probe (S17) wait for
  0293; a static test checks the migration until then.

## Copy added (all draft, no `*_COPY_STATUS` touched)

`HERO.doctorInitials`, `comingDoneShort`, `FOOTER.join.failed`, `FOOTER.join.honeypot`, and footer links as
`{label, href}`.
