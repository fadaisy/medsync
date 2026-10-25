# ADR 0405 — Voice notes become words on the phone, in a development build

**Status:** Accepted, 2026-10-18. Owner decision: "on-device speech recognition with a development build (expo-speech-recognition), and keep Expo Go for everything else". It amends ADR 0404 §5.

## Context

ADR 0404 kept voice notes as sound and left the words to the keyboard's microphone. Expo Go has no speech recogniser, and the app has no speech service. The owner wants the voice note itself turned into text, without patient audio leaving the phone.

## Decision

1. **On the device only.**
   - `expo-speech-recognition` is used with `requiresOnDeviceRecognition`.
   - A phone that cannot recognise on the device gets no transcription: the module reports `supportsOnDeviceRecognition()` false. Nothing falls back to a network service.
2. **One microphone does both.**
   - In a build with the module, the recogniser records the voice note itself and keeps the sound as a wav file (`recordingOptions.persist`).
   - It writes the words into the note box as the patient speaks. The patient can correct them before sending.
   - Its volume events draw the waveform.
   - Recording separately and transcribing the file afterwards is not used: on Android, file transcription takes only raw PCM, not the m4a that `expo-audio` makes.
3. **Expo Go is unchanged.**
   - The module is never loaded in Expo Go (`lib/speech.ts` checks the execution environment). `expo-audio` records an m4a, and the keyboard's microphone does the words.
   - `npm start` opens Expo Go (`expo start --go`).
   - `npm run start:dev` serves a development build.
4. **Migration 0187** lets the attachments bucket take wav (`audio/wav`, `audio/x-wav`).
5. **The development build** is the existing EAS `development` profile:
   - `eas build --profile development --platform android` makes an installable APK.
   - iOS needs the owner's Apple developer account and the phone registered with EAS.

## Consequences

- The words are the recogniser's guess. They go to the clinic as the patient's own note, which the patient sees and can edit first. No tier or routing reads them (ADR 0095).
- Language is English (`en-US`, the on-device model most phones carry). Luganda and other languages need their own on-device models, and are a later decision.
