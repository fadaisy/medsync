# ADR 0350 — The ticket as a boarding pass; tap to turn it over

**Status:** Accepted, 2026-10-18. Owner decision. It supersedes ADR 0348 and ADR 0349 (tilt, drag, movement and sharing).

## Context

After trying the tilting, draggable, shareable ticket, the owner asked to drop the sharing and the interactivity. Instead, tapping the ticket should show its back, and the card should look more like a ticket. The reference was a boarding pass.

## Decision

1. **Removed:**
   - the lean toward the finger, the drag to turn, the movement and the light effect;
   - "Share ticket", with `expo-sharing` and `react-native-view-shot` uninstalled.
2. **Tap to turn.**
   - A tap anywhere on the ticket turns it over: a half turn in 450 ms on the house curve, or a fade under reduce motion.
   - "Pay now" keeps its own press and does not turn it.
   - The face turned away is hidden from touch and screen readers. A screen reader turns it with the "Turn over" action.
   - A caption under the ticket says "Tap the ticket to turn it over".
3. **A boarding pass, in Tide tokens.** From top to bottom:
   - a band of diagonal stripes (navy with the Visits hue);
   - the MedSync brand row, and the hospital with the ticket's status;
   - the day and the time large, like a route. For a queue ticket: the stage and the line ahead, never a place number;
   - the patient's name large;
   - the other details as small label and value fields;
   - the payment line in its three looks, with a PAID mark when paid;
   - a perforation with notches in the page colour;
   - a stub with the code large.
   - Still no drawn barcode: nothing could scan it.
4. **The back** keeps the same striped shell, with the hospital and day, the code large, and the three steps at the desk.

## Consequences

- The `Ticket` props are unchanged. The Ask for a day, today's line and visit screens need no change.
- The tests hold the tap: no share or turn button, a tap shows the back, and "Pay now" pays without turning.
