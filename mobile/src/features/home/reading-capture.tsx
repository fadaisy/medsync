import type { StartValues } from "@/data/readings";
import type { ReadingKind } from "@/lib/readings";
import { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { Button } from "@/components/tide";
import { readingFromPhoto } from "@/data/reading-photo";
import { readSpoken } from "@/lib/reading-words";
import { speech } from "@/lib/speech";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

const EXAMPLE: Record<ReadingKind, string> = {
  bp: "For example: 120 over 80, pulse 72",
  sugar: "For example: 6.4",
  weight: "For example: 70 kilos",
  pulse: "For example: 72",
};

/**
 * Say it, or show it (ADR 0411), above the number boxes in Log a reading.
 *
 * - "Say it": in a build with on-device speech the phone listens and writes
 *   what it heard; in Expo Go a line opens for the keyboard's microphone.
 *   Either way the words become numbers in the boxes (`readSpoken`).
 * - "Photo": the camera; Claude reads the device's screen on our server.
 *   Not offered for pulse alone (it comes with blood pressure).
 *
 * Whatever is found only fills the boxes; the patient checks and saves.
 */
export function ReadingCapture({
  kind,
  onFill,
}: {
  kind: ReadingKind;
  onFill: (values: Partial<StartValues>) => void;
}) {
  const t = useTide();
  const [typing, setTyping] = useState(false);
  const [said, setSaid] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const fill = useRef(onFill);
  useEffect(() => {
    fill.current = onFill;
  });

  const take = (text: string) => {
    const found = readSpoken(kind, text);
    if (Object.keys(found).length) {
      fill.current(found);
      setLine("Filled in from what you said. Check the numbers, then save.");
    } else setLine("No reading heard in that. Try again, or type it.");
  };

  // The on-device recogniser, where the build has it: one phrase, then stop.
  useEffect(() => {
    if (!speech) return;
    const subs = [
      speech.addListener("result", (e) => {
        if (e.isFinal) {
          const text = e.results[0]?.transcript ?? "";
          setSaid(text);
          take(text);
        }
      }),
      speech.addListener("end", () => setListening(false)),
      speech.addListener("error", () => {
        setListening(false);
        setLine("Didn't catch that. Try again, or type it.");
      }),
    ];
    return () => subs.forEach((s) => s.remove());
    // `take` reads only `kind` and refs; re-subscribing per kind is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const sayIt = async () => {
    setLine(null);
    if (!speech) {
      setTyping(true);
      return;
    }
    if (listening) {
      speech.stop();
      return;
    }
    const perm = await speech.requestPermissionsAsync();
    if (!perm.granted) {
      setTyping(true);
      setLine("Allow the microphone and speech in Settings, or use the keyboard's microphone.");
      return;
    }
    setSaid("");
    setListening(true);
    speech.start({ lang: "en-US", interimResults: false, requiresOnDeviceRecognition: true });
  };

  const photo = async () => {
    if (kind === "pulse") return;
    setLine(null);
    setBusy(true);
    const res = await readingFromPhoto(kind);
    setBusy(false);
    if (res.ok) {
      if (Object.keys(res.values).length) {
        onFill(res.values);
        setLine("Read from the photo. Check the numbers, then save.");
      } else setLine("Couldn't read the numbers. Try again, or type them.");
    } else if ("message" in res) setLine(res.message);
  };

  return (
    <View style={{ gap: tSpace[2] }}>
      <View style={{ flexDirection: "row", gap: tSpace[2] }}>
        <Button
          label={listening ? "Listening… tap to stop" : "Say it"}
          icon="mic"
          variant="soft"
          size="sm"
          style={{ flex: 1 }}
          onPress={() => void sayIt()}
        />
        {kind !== "pulse" ? (
          <Button
            label={busy ? "Reading…" : "Photo"}
            icon="camera"
            variant="soft"
            size="sm"
            busy={busy}
            style={{ flex: 1 }}
            onPress={() => void photo()}
          />
        ) : null}
      </View>
      {typing ? (
        <TextInput
          autoFocus
          value={said}
          onChangeText={setSaid}
          onSubmitEditing={() => take(said)}
          onBlur={() => said.trim() && take(said)}
          returnKeyType="done"
          placeholder={`${EXAMPLE[kind]}. Tap the keyboard's microphone to speak.`}
          placeholderTextColor={t.ink4}
          accessibilityLabel="Say or type your reading"
          style={[
            tType.bodyM,
            {
              minHeight: 44,
              paddingHorizontal: tSpace[3],
              borderRadius: tRadius.field,
              borderWidth: 1,
              borderColor: t.line,
              backgroundColor: t.surface,
              color: t.ink,
            },
          ]}
        />
      ) : null}
      {listening && said === "" ? (
        <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3 }]}>
          {EXAMPLE[kind]}
        </Text>
      ) : null}
      {line ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}
        >
          {line}
        </Text>
      ) : null}
    </View>
  );
}
