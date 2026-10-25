# ADR 0411 — Say a reading, or photograph the device

**Status:** Accepted, 2026-10-18. Owner decision, including the choice of Claude to read photos (over on-device ML Kit).

## Context

Log a reading takes typed numbers with − and + (sheet and page). The owner asked to add two more ways to fill them in:

- saying the reading;
- photographing the blood pressure monitor, sugar meter or scale, with the pulse filled too when the monitor shows it.

## Decision

1. **Say it.**
   - In a build with on-device speech (ADR 0405) the phone listens for one phrase.
   - In Expo Go a line opens for the keyboard's microphone.
   - `readSpoken` turns the words into numbers:
     - "120 over 80, pulse 72";
     - sugar in mmol/L, converting mg/dL;
     - weight in kg, converting pounds.
   - A word it cannot place fills nothing.
2. **Photo.**
   - The camera takes the photo, which is shrunk to 1024 px and sent to `/api/mobile/reading-photo`. The route checks the patient's sign-in token and is rate-limited to ten a minute.
   - The route asks Claude (the smallest current model) to read the screen, with a prompt that forbids guessing.
   - `readReply` drops any number outside a device's plain range, and any blood pressure whose bottom number is not below the top. It converts units the same way as voice.
   - The photo is not stored or logged anywhere.
   - The key is `ANTHROPIC_API_KEY`, optional. Without it the photo button says it is not switched on.
3. **Pulse with blood pressure.** The blood pressure form has an optional "Pulse" box. A pulse given there, typed or found, is saved as its own pulse reading beside the blood pressure.
4. **Fill, never save.** Whatever is found only fills the boxes, with a line telling the patient to check them. The danger check and save are unchanged.

## Consequences

- The owner adds `ANTHROPIC_API_KEY` to the web app's environment: `.env.local` for the local server the phone uses, and Vercel for production. Photos then cost a fraction of a cent each.
- Expo Go cannot listen by itself. The keyboard's microphone stands in until the development build is used.
