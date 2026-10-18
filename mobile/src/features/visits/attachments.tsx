import type { IconName } from "@/components/tide/icon";
import type { Attachment } from "@/data/attachments";
import { useEffect, useState } from "react";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { ScrollView, Text, View } from "react-native";

import { FieldError, Icon, Press } from "@/components/tide";
import { MAX_MEDIA, MAX_VOICE, storedMime } from "@/data/attachments";
import { bars, levelOf } from "@/features/visits/waveform";
import { requestId } from "@/lib/edge";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/** Loudness readings on, for the waveform. A constant: the recorder is made once. */
const RECORDING = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };
const BARS = 36;
/** Playback leaves record mode, so the sound comes from the speaker, also with the phone on silent. */
const PLAYBACK = { allowsRecording: false, playsInSilentMode: true } as const;

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Say it or show it, under the note on Ask for a day (board AskFlow, 18 Oct
 * 2026): a voice note, photos from the phone, or a photo or video taken now.
 * Nothing leaves the phone until the request is made (`sendAttachments`).
 *
 * Speech to text: Expo Go has no speech recogniser of its own, so the words
 * come from the keyboard's own microphone into the note box, and the voice
 * note is kept as sound for the clinic.
 */
export function AttachmentTools({
  value,
  onChange,
}: {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
}) {
  const t = useTide();
  const recorder = useAudioRecorder(RECORDING);
  const rec = useAudioRecorderState(recorder, 250);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>([]);

  // Read the loudness ten times a second while recording: the live waveform, then the note's.
  useEffect(() => {
    if (!rec.isRecording) return;
    const id = setInterval(() => {
      const db = recorder.getStatus().metering;
      if (db !== undefined) setLevels((l) => [...l, levelOf(db)]);
    }, 100);
    return () => clearInterval(id);
  }, [rec.isRecording, recorder]);
  const voices = value.filter((a) => a.kind === "voice");
  const media = value.filter((a) => a.kind !== "voice");

  const add = (list: Attachment[]) => onChange([...value, ...list]);
  const remove = (id: string) => onChange(value.filter((a) => a.id !== id));

  const toggleVoice = async () => {
    setError(null);
    try {
      if (rec.isRecording) {
        const ms = rec.durationMillis;
        await recorder.stop();
        await setAudioModeAsync(PLAYBACK);
        const uri = recorder.uri;
        if (uri)
          add([{ id: requestId(), kind: "voice", uri, mime: "audio/mp4", durationMs: ms, levels }]);
        return;
      }
      if (voices.length >= MAX_VOICE) return setError(`Up to ${MAX_VOICE} voice notes.`);
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return setError("Allow the microphone in Settings, or type instead.");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      setLevels([]);
      recorder.record();
    } catch {
      setError("The voice note didn't record. Try again.");
    }
  };

  const fromPhone = async () => {
    setError(null);
    const room = MAX_MEDIA - media.length;
    if (room <= 0) return setError(`Up to ${MAX_MEDIA} photos or videos.`);
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: room,
      quality: 0.7,
    });
    if (!picked.canceled) take(picked.assets.slice(0, room));
  };

  const fromCamera = async () => {
    setError(null);
    if (media.length >= MAX_MEDIA) return setError(`Up to ${MAX_MEDIA} photos or videos.`);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError("Allow the camera in Settings to take one here.");
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images", "videos"],
      videoMaxDuration: 60,
      quality: 0.7,
    });
    if (!shot.canceled) take(shot.assets.slice(0, 1));
  };

  const take = (assets: ImagePicker.ImagePickerAsset[]) => {
    const ok: Attachment[] = [];
    for (const a of assets) {
      const kind = a.type === "video" ? "video" : "photo";
      const mime = storedMime(kind, a.mimeType);
      if (mime)
        ok.push({ id: requestId(), kind, uri: a.uri, mime, durationMs: a.duration ?? null });
    }
    if (ok.length < assets.length)
      setError("One file is a type we can't send. Try a photo or video.");
    add(ok);
  };

  const tool = (icon: IconName, label: string, onPress: () => void, on = false) => (
    <Press
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      style={{
        flex: 1,
        height: 44,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: tSpace[1.5],
        borderRadius: tRadius.field,
        borderWidth: 1,
        borderColor: on ? t.primary : t.line,
        backgroundColor: on ? t.primary : t.surface,
      }}
    >
      <Icon name={icon} size={18} color={on ? t.onPrimary : t.ink} />
      <Text style={[tType.labelS, { fontSize: 13, color: on ? t.onPrimary : t.ink }]}>{label}</Text>
    </Press>
  );

  return (
    <View style={{ gap: tSpace[2] }}>
      <View style={{ flexDirection: "row", gap: tSpace[2] }}>
        {rec.isRecording
          ? tool("stop", `Stop · ${clock(rec.durationMillis)}`, () => void toggleVoice(), true)
          : tool("mic", "Voice note", () => void toggleVoice())}
        {tool("image", "Add photo", () => void fromPhone())}
        {tool("camera", "Camera", () => void fromCamera())}
      </View>
      <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3 }]}>
        {rec.isRecording
          ? "Recording. Tap Stop when you are done."
          : "To type by talking, tap the microphone on your keyboard."}
      </Text>
      {error ? <FieldError>{error}</FieldError> : null}

      {rec.isRecording ? (
        <View
          accessibilityLabel={`Recording, ${clock(rec.durationMillis)}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: tSpace[2.5],
            padding: tSpace[3],
            borderRadius: tRadius.field,
            backgroundColor: t.surface,
            boxShadow: t.shadow.card,
          }}
        >
          <Icon name="mic" size={18} color={t.ink} />
          {/* The newest readings, so the bars move with the voice. */}
          <Waveform heights={bars(levels.slice(-BARS), BARS)} played={1} />
          <Text style={[tType.labelS, { color: t.ink, fontVariant: ["tabular-nums"] }]}>
            {clock(rec.durationMillis)}
          </Text>
        </View>
      ) : null}

      {voices.map((v, i) => (
        <VoiceRow key={v.id} note={v} n={i + 1} onRemove={() => remove(v.id)} />
      ))}
      {media.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: tSpace[2] }}
        >
          {media.map((m) => (
            <View
              key={m.id}
              style={{
                width: 76,
                height: 76,
                borderRadius: tRadius.field,
                overflow: "hidden",
                backgroundColor: t.surface3,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {m.kind === "photo" ? (
                <Image
                  source={{ uri: m.uri }}
                  style={{ position: "absolute", inset: 0 }}
                  contentFit="cover"
                  accessibilityLabel="Photo you added"
                />
              ) : (
                <View style={{ alignItems: "center", gap: 2 }}>
                  <Icon name="video" size={22} color={t.ink} />
                  <Text style={[tType.micro, { fontFamily: tFont.semibold, color: t.ink2 }]}>
                    {m.durationMs ? `Video ${clock(m.durationMs)}` : "Video"}
                  </Text>
                </View>
              )}
              <Press
                onPress={() => remove(m.id)}
                accessibilityLabel={m.kind === "photo" ? "Remove photo" : "Remove video"}
                hitSlop={6}
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: t.surface,
                }}
              >
                <Icon name="close" size={13} color={t.ink} />
              </Press>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

/** Bars for loudness; the part already played is in the action colour. */
function Waveform({ heights, played }: { heights: number[]; played: number }) {
  const t = useTide();
  return (
    <View
      accessible={false}
      style={{ flex: 1, height: 28, flexDirection: "row", alignItems: "center", gap: 2 }}
    >
      {heights.map((h, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(3, h * 28),
            borderRadius: 2,
            backgroundColor: (i + 0.5) / heights.length <= played ? t.primary : t.lineStrong,
          }}
        />
      ))}
    </View>
  );
}

/** One voice note: play it back with its waveform, or take it out. */
function VoiceRow({ note, n, onRemove }: { note: Attachment; n: number; onRemove: () => void }) {
  const t = useTide();
  const player = useAudioPlayer(note.uri, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const total = status.duration > 0 ? status.duration : (note.durationMs ?? 0) / 1000;
  const at = status.didJustFinish ? 0 : status.currentTime;
  const toggle = async () => {
    if (playing) return player.pause();
    await setAudioModeAsync(PLAYBACK);
    if (status.didJustFinish || (total > 0 && status.currentTime >= total - 0.05)) {
      await player.seekTo(0);
    }
    player.play();
  };
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: tSpace[2],
        padding: tSpace[2],
        paddingLeft: tSpace[3],
        borderRadius: tRadius.field,
        backgroundColor: t.surface,
        boxShadow: t.shadow.card,
      }}
    >
      <Press
        onPress={() => void toggle()}
        accessibilityLabel={playing ? `Pause voice note ${n}` : `Play voice note ${n}`}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: t.primary,
        }}
      >
        <Icon name={playing ? "stop" : "play"} size={16} color={t.onPrimary} />
      </Press>
      <Waveform heights={bars(note.levels ?? [], BARS)} played={total ? at / total : 0} />
      <Text
        accessibilityLabel={`Voice note ${n}, ${clock(total * 1000)} long`}
        style={[
          tType.caption,
          { fontFamily: tFont.semibold, color: t.ink2, fontVariant: ["tabular-nums"] },
        ]}
      >
        {playing || at > 0 ? clock(at * 1000) : clock(total * 1000)}
      </Text>
      <Press
        onPress={onRemove}
        accessibilityLabel={`Remove voice note ${n}`}
        hitSlop={8}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: t.surface3,
        }}
      >
        <Icon name="close" size={16} color={t.ink} />
      </Press>
    </View>
  );
}
