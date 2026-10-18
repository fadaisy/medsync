import type { ExpoSpeechRecognitionModule as Module } from "expo-speech-recognition";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

/**
 * On-device speech recognition (`expo-speech-recognition`, ADR 0346): only in
 * a development or release build, which carries the native module. Expo Go
 * does not, and loading it there would throw, so it is never required there;
 * a phone that cannot recognise on the device gets null too. Null means the
 * voice note is kept as sound and the keyboard's microphone does the words.
 */
export type Speech = typeof Module;

function load(): Speech | null {
  if (Platform.OS === "web") return null;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = (require("expo-speech-recognition") as typeof import("expo-speech-recognition"))
      .ExpoSpeechRecognitionModule;
    // On the device or not at all: the patient's voice does not go to a speech service.
    return m.supportsOnDeviceRecognition() ? m : null;
  } catch {
    return null;
  }
}

export const speech: Speech | null = load();
