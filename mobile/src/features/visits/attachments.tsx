import type { IconName } from "@/components/tide/icon";
import type { Attachment } from "@/data/attachments";
import { useState } from "react";
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
import { requestId } from "@/lib/edge";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

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
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder, 250);
  const [error, setError] = useState<string | null>(null);
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
        await setAudioModeAsync({ allowsRecording: false });
        const uri = recorder.uri;
        if (uri) add([{ id: requestId(), kind: "voice", uri, mime: "audio/mp4", durationMs: ms }]);
        return;
      }
      if (voices.length >= MAX_VOICE) return setError(`Up to ${MAX_VOICE} voice notes.`);
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return setError("Allow the microphone in Settings, or type instead.");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
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

/** One voice note: play it back, or take it out. */
function VoiceRow({ note, n, onRemove }: { note: Attachment; n: number; onRemove: () => void }) {
  const t = useTide();
  const player = useAudioPlayer(note.uri);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const toggle = () => {
    if (playing) return player.pause();
    if (status.didJustFinish || status.currentTime >= status.duration) void player.seekTo(0);
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
        onPress={toggle}
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
      <Text style={[tType.labelS, { flex: 1, color: t.ink }]}>
        {`Voice note ${n} · ${clock(note.durationMs ?? 0)}`}
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
