# ADR 0407 — A ticket you can hold, turn over and share

**Status:** Accepted, 2026-10-18. Owner request: make the visit ticket more interactive, with a back, a feeling of 3D under the finger, and sharing outside MedSync (Snapchat and the like).

## Decision

1. **It leans toward the finger.**
   - The ticket tilts up to 7° toward where it is touched, lifts very slightly, and catches a soft light. It settles back when let go, on the house curve.
   - Touches are only listened to (`onTouchStart` and `onTouchMove`), never claimed. So the page still scrolls from the ticket, and "Pay now" still presses.
2. **It turns over.**
   - "Turn over" spins it half a turn to the back. The back has the code large for the desk, the hospital and day, and three plain steps for arriving.
   - The face turned away is hidden from touch and from screen readers.
3. **It can be shared as a picture.**
   - "Share" opens a sheet showing the exact picture first: a 9:16 story card with the hospital and the day, on the ticket's navy.
   - The phone's share sheet (`expo-sharing`) sends it to Snapchat, WhatsApp, Instagram or anywhere else. The picture is captured at 1080×1920 with `react-native-view-shot`. Both work in Expo Go.
   - **The picture never carries** the patient's name, the code, the clinic or the fee:
     - anyone holding the code could use the ticket;
     - a clinic can say what is wrong;
     - a fee is private.
   - The sheet says so in words.
4. **Reduce motion.** There is no lean, and turning over is a fade.

## Consequences

- Motion here carries meaning: the lean answers the touch, and the turn shows the other side. Neither runs on its own.
- A test holds the share picture to its four omissions.
