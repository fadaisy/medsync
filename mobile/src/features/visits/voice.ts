import type { Attachment } from "@/data/attachments";
import { useEffect, useRef, useState } from "react";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";

import { levelOf, volumeLevel } from "@/features/visits/waveform";
import { requestId } from "@/lib/edge";
import { speech } from "@/lib/speech";
import { useNow } from "@/lib/use-now";

/** Playback leaves record mode, so the sound comes from the speaker, also with the phone on silent. */
export const PLAYBACK = { allowsRecording: false, playsInSilentMode: true } as const;
/** Loudness readings on, for the waveform. A constant: the recorder is made once. */
const RECORDING = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

export interface VoiceNote {
  recording: boolean;
  durationMs: number;
  /** Loudness so far, 0–1: the live waveform. */
  levels: number[];
  /** True where the words are written as the patient speaks (a build with on-device recognition). */
  transcribes: boolean;
  start: () => Promise<string | null>;
  stop: () => Promise<void>;
}

interface Handlers {
  /** A finished note. */
  onNote: (note: Attachment) => void;
  /** Words heard, to add to the note box. */
  onText: (text: string) => void;
  onError: (message: string) => void;
}

/**
 * Expo Go: `expo-audio` records the note (m4a) and reads its loudness; the
 * words come from the keyboard's microphone.
 */
function useRecorderVoice({ onNote }: Handlers): VoiceNote {
  const recorder = useAudioRecorder(RECORDING);
  const rec = useAudioRecorderState(recorder, 250);
  const [levels, setLevels] = useState<number[]>([]);

  useEffect(() => {
    if (!rec.isRecording) return;
    const id = setInterval(() => {
      const db = recorder.getStatus().metering;
      if (db !== undefined) setLevels((l) => [...l, levelOf(db)]);
    }, 100);
    return () => clearInterval(id);
  }, [rec.isRecording, recorder]);

  return {
    recording: rec.isRecording,
    durationMs: rec.durationMillis,
    levels,
    transcribes: false,
    start: async () => {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return "Allow the microphone in Settings, or type instead.";
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      setLevels([]);
      recorder.record();
      return null;
    },
    stop: async () => {
      const ms = rec.durationMillis;
      await recorder.stop();
      await setAudioModeAsync(PLAYBACK);
      const uri = recorder.uri;
      if (uri)
        onNote({ id: requestId(), kind: "voice", uri, mime: "audio/mp4", durationMs: ms, levels });
    },
  };
}

/**
 * A development or release build: the on-device recogniser records the note
 * itself (a wav it keeps) and writes the words as the patient speaks, so one
 * microphone does both. Nothing is sent to a speech service
 * (`requiresOnDeviceRecognition`).
 */
function useRecognizerVoice(handlers: Handlers): VoiceNote {
  const s = speech!;
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [levels, setLevels] = useState<number[]>([]);
  const now = useNow(250);
  // The latest handlers and levels, for events that arrive after a render.
  const latest = useRef({ handlers, levels, startedAt });
  useEffect(() => {
    latest.current = { handlers, levels, startedAt };
  });

  useEffect(() => {
    const subs = [
      s.addListener("result", (e) => {
        const text = e.isFinal ? e.results[0]?.transcript.trim() : "";
        if (text) latest.current.handlers.onText(text);
      }),
      s.addListener("volumechange", (e) => setLevels((l) => [...l, volumeLevel(e.value)])),
      s.addListener("audioend", (e) => {
        const { handlers: h, levels: heard, startedAt: from } = latest.current;
        setStartedAt(null);
        if (e.uri)
          h.onNote({
            id: requestId(),
            kind: "voice",
            uri: e.uri,
            mime: "audio/wav",
            durationMs: from ? Math.max(0, Date.now() - from) : null,
            levels: heard,
          });
      }),
      s.addListener("error", (e) => {
        if (e.error === "aborted" || e.error === "no-speech") return;
        latest.current.handlers.onError(
          e.error === "language-not-supported" || e.error === "service-not-allowed"
            ? "This phone can't turn speech into words here. Type instead, or use the keyboard's microphone."
            : "The voice note stopped. Try again.",
        );
      }),
    ];
    return () => subs.forEach((x) => x.remove());
  }, [s]);

  return {
    recording: startedAt !== null,
    durationMs: startedAt ? Math.max(0, now.getTime() - startedAt) : 0,
    levels,
    transcribes: true,
    start: async () => {
      const perm = await s.requestPermissionsAsync();
      if (!perm.granted) return "Allow the microphone and speech in Settings, or type instead.";
      setLevels([]);
      s.start({
        lang: "en-US",
        interimResults: false,
        continuous: true,
        addsPunctuation: true,
        requiresOnDeviceRecognition: true,
        recordingOptions: { persist: true },
        volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
      });
      setStartedAt(Date.now());
      return null;
    },
    stop: async () => {
      s.stop();
      await setAudioModeAsync(PLAYBACK);
    },
  };
}

/** The voice note for this build: chosen once, so the hooks inside never change order. */
export const useVoiceNote: (handlers: Handlers) => VoiceNote = speech
  ? useRecognizerVoice
  : useRecorderVoice;
