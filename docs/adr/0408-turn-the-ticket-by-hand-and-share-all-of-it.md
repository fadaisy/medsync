# ADR 0408 — Turn the ticket by hand, and share all of it

**Status:** Accepted, 2026-10-18. Owner decision. It supersedes ADR 0407 §2 (the "Turn over" button) and §3 (the story card that left the name, code, clinic and fee off).

## Context

Trying ADR 0407 on the phone, the owner asked for two changes: no button to turn the ticket, but turning and moving it with touch; and sharing the whole ticket.

## Decision

1. **Turned by hand.**
   - A sideways drag turns the ticket with the finger. It also moves a little with the hand (14% of the drag) and leans with an upward or downward drag.
   - When let go, it lands on the nearer face. A drag past a quarter of its width turns it over, as a flick would.
   - Only a sideways drag is claimed. An up-and-down drag still scrolls the page, and a tap still presses "Pay now".
   - The lean toward the touch (ADR 0407 §1) stays.
2. **No turn button.** A screen reader turns the ticket with its "Turn over" action. A caption under the ticket says "Drag it sideways to turn it over."
3. **Sharing sends the whole front of the ticket**, as a picture, flat and without the light effect. That includes the name, code, clinic, time and payment, as the owner asked.
   - The caption says plainly that the name and code go with it, so the patient chooses knowingly.
   - The code still needs the desk's identity check to be used.
4. **Reduce motion.** Nothing follows the finger. A sideways swipe turns the ticket with a fade.

## Consequences

- The separate share card and its sheet are removed (`ticket-share.tsx`).
- The test now holds that there is no turn button, and that the share line names what is sent.
