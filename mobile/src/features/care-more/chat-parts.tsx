import type { ChatMessage } from "@/data/chat";
import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { Button, Icon, Press, StatusPill } from "@/components/tide";
import { ROLE_WORDS } from "@/data/chat";
import { checkReading, THRESHOLDS_NOTE } from "@/lib/readings";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

const BUBBLE_W = 270;

/** The reading classifier's level as a pill tone (law L7: the words come from the rules). */
const LEVEL_TONE = {
  empty: "pending",
  ok: "stable",
  watch: "caution",
  danger: "critical",
} as const;

/** A reply chip with a lagoon edge: quick replies under a card, "Order my refill". */
export function ReplyChip({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTide();
  return (
    <Press
      onPress={onPress}
      accessibilityLabel={label}
      hitSlop={6}
      style={{
        minHeight: 34,
        paddingHorizontal: tSpace[3],
        borderRadius: tRadius.pill,
        justifyContent: "center",
        backgroundColor: t.surface,
        borderWidth: 1.5,
        borderColor: t.accent,
      }}
    >
      <Text style={[tType.caption, { color: t.accentText }]}>{label}</Text>
    </Press>
  );
}

export function DayMark({ label }: { label: string }) {
  const t = useTide();
  return (
    <View
      style={{
        alignSelf: "center",
        minHeight: 24,
        paddingHorizontal: tSpace[2.5],
        borderRadius: tRadius.pill,
        backgroundColor: t.surface3,
        justifyContent: "center",
      }}
    >
      <Text style={[tType.micro, { fontFamily: tType.caption.fontFamily, color: t.ink2 }]}>
        {label}
      </Text>
    </View>
  );
}

/** The "Lab results ready" card: the message and the way to the tests. No values exist for patients. */
function LabsCard({ text }: { text: string }) {
  const t = useTide();
  const router = useRouter();
  return (
    <View style={{ gap: tSpace[1] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1.5] }}>
        <Icon name="flask" size={14} color={t.area.medicines} />
        <Text style={[tType.overline, { fontSize: 11, color: t.ink2 }]}>Lab tests</Text>
      </View>
      <Text
        style={[
          tType.bodyM,
          {
            fontFamily: tType.body.fontFamily,
            fontSize: 14,
            lineHeight: 20,
            color: t.ink,
            paddingBottom: tSpace[1],
          },
        ]}
      >
        {text}
      </Text>
      <Button
        label="See your tests"
        variant="soft"
        size="sm"
        iconRight="forward"
        onPress={() => router.push("/care/labs")}
        style={{ marginTop: tSpace[1.5] }}
      />
    </View>
  );
}

function ReadingCard({ top, bottom, at }: { top: number; bottom: number; at: string }) {
  const t = useTide();
  const check = checkReading({ kind: "bp", top, bottom });
  return (
    <View
      accessible
      accessibilityLabel={`Shared reading: ${top} over ${bottom} at ${at}. ${check.text}. ${THRESHOLDS_NOTE}`}
      style={{
        width: 230,
        padding: tSpace[3],
        paddingHorizontal: tSpace[3.5],
        borderRadius: 20,
        borderBottomRightRadius: 6,
        backgroundColor: t.band,
        gap: tSpace[1.5],
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1.5] }}>
        <Icon name="heart" size={14} color={t.onBandAccent} />
        <Text style={[tType.overline, { fontSize: 11, color: t.onBandAccent }]}>
          Shared reading
        </Text>
      </View>
      <Text
        style={[
          tType.title,
          { fontFamily: tType.numeral.fontFamily, fontSize: 24, lineHeight: 28, color: t.onBand },
        ]}
      >
        {top}/{bottom}{" "}
        <Text style={[tType.caption, { fontFamily: tType.bodyS.fontFamily, color: t.onBand2 }]}>
          mmHg · {at}
        </Text>
      </Text>
      <StatusPill tone={LEVEL_TONE[check.level]} label={check.text} />
      <Text style={[tType.micro, { color: t.onBand2 }]}>{THRESHOLDS_NOTE}</Text>
    </View>
  );
}

/** A voice note, drawn only: there is no playback (PRD non-goal). */
function VoiceNote({ length, seconds }: { length: string; seconds: number }) {
  const t = useTide();
  const bars = [6, 14, 20, 10, 16, 8, 22, 12, 6, 14, 8, 18, 10, 6, 14, 8, 4, 10, 6];
  return (
    <View
      accessible
      accessibilityLabel={`Voice note, ${seconds} seconds. Playing is not available yet.`}
      style={{
        width: 220,
        minHeight: 52,
        paddingLeft: tSpace[1.5],
        paddingRight: tSpace[3],
        borderRadius: 20,
        borderBottomRightRadius: 6,
        backgroundColor: t.accent,
        flexDirection: "row",
        alignItems: "center",
        gap: tSpace[2.5],
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: t.band,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="play" size={14} color={t.onBand} fill={t.onBand} />
      </View>
      <Svg width={120} height={26} viewBox="0 0 120 26">
        {bars.map((h, i) => (
          <Rect
            key={i}
            x={i * 6}
            y={(26 - h) / 2}
            width={3}
            height={h}
            rx={1.5}
            fill={t.onAccent}
            opacity={i < 9 ? 1 : 0.35}
          />
        ))}
      </Svg>
      <Text style={[tType.caption, { color: t.onAccent }]}>{length}</Text>
    </View>
  );
}

/** One message: who (theirs only), the bubble, any action under it, and the time. */
export function Message({ m, onReply }: { m: ChatMessage; onReply: (text: string) => void }) {
  const t = useTide();
  const router = useRouter();
  const mine = m.from === "me";
  const who = m.from === "me" ? null : ROLE_WORDS[m.from];
  const action = m.action;
  const corner = mine ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 };
  let bubble: ReactNode;
  switch (m.body.kind) {
    case "text":
      bubble = (
        <View
          style={{
            maxWidth: BUBBLE_W,
            paddingVertical: tSpace[2.5],
            paddingHorizontal: 13,
            borderRadius: 20,
            ...corner,
            backgroundColor: mine ? t.primary : t.surface,
            boxShadow: mine ? undefined : t.shadow.card,
          }}
        >
          <Text
            style={[
              tType.bodyM,
              { fontFamily: tType.body.fontFamily, color: mine ? t.onPrimary : t.ink },
            ]}
          >
            {m.body.text}
          </Text>
        </View>
      );
      break;
    case "labs":
      bubble = (
        <View
          style={{
            width: BUBBLE_W,
            paddingVertical: tSpace[3],
            paddingHorizontal: tSpace[3.5],
            borderRadius: 20,
            ...corner,
            backgroundColor: t.surface,
            boxShadow: t.shadow.card,
          }}
        >
          <LabsCard text={m.body.text} />
        </View>
      );
      break;
    case "reading":
      bubble = <ReadingCard top={m.body.top} bottom={m.body.bottom} at={m.body.at} />;
      break;
    case "voice":
      bubble = <VoiceNote length={m.body.length} seconds={m.body.seconds} />;
      break;
  }
  const status =
    m.status === "seen" ? " · Seen" : m.status === "waiting" ? " · Waiting to send" : "";
  return (
    <View style={{ alignItems: mine ? "flex-end" : "flex-start", gap: 3 }}>
      {who === null ? null : (
        <Text
          style={[
            tType.micro,
            { fontFamily: tType.caption.fontFamily, color: t.ink2, paddingHorizontal: tSpace[1.5] },
          ]}
        >
          {who}
        </Text>
      )}
      {bubble}
      {m.body.kind === "labs" ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: tSpace[1.5],
            paddingTop: tSpace[1],
          }}
        >
          {m.body.replies.map((r) => (
            <ReplyChip key={r} label={r} onPress={() => onReply(r)} />
          ))}
        </View>
      ) : null}
      {action ? <ReplyChip label={action.label} onPress={() => router.push(action.href)} /> : null}
      <Text style={[tType.micro, { color: t.ink3, paddingHorizontal: tSpace[1.5] }]}>
        {m.time}
        {status}
      </Text>
    </View>
  );
}
