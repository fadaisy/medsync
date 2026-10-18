import { useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Icon } from "@/components/tide/icon";
import { Button } from "@/components/tide/primitives";
import { clearOf } from "@/components/tide/screen";
import { TicketShareSheet } from "@/components/tide/ticket-share";
import { feeText, payLook } from "@/features/visits/logic";
import { EASE_OUT_FN, motion } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * The tear-off ticket (prompt §8.3), for a place in today's line and for an
 * asked-for clinic day. A navy top band, a perforation with 28pt notches cut
 * in the page colour, the details (Time is always "Not promised", law L8), a
 * payment strip in one of three looks that never read alike, and the code
 * in mono, which is what the desk reads (no drawn barcode: nothing could scan it). It pops in once (`ticketPop`).
 *
 * The three money looks: paid is a lagoon strip with a tilted PAID stamp on
 * the band; not paid is an outlined strip with "Pay now"; no fee is a quiet
 * grey strip. Each carries its words, never colour alone.
 */
const NOTCH = 28;

function TicketFront({
  kind,
  hospitalName,
  stage,
  aheadLine,
  day,
  dayLine,
  sessionLine,
  status,
  details,
  fee,
  feeLabel,
  paid,
  demoPayment = false,
  onPayNow,
  paying = false,
  code,
  ground,
}: {
  kind: "queue" | "day";
  hospitalName: string;
  /**
   * Queue: the stage as a word ("Place saved", "In the line") and, only once
   * the patient is present, "N ahead of you" (ADR 0084 §6). Never a place
   * number, a total or a wait; null hides it.
   */
  stage?: string;
  aheadLine?: string | null;
  /** Day: "20", "TUE · OCT", "Morning · doors 08:00", "Waiting for the clinic to confirm". */
  day?: string;
  dayLine?: string;
  sessionLine?: string;
  status?: string;
  details: { label: string; value: string }[];
  fee: number | null;
  feeLabel?: string | null;
  paid: boolean;
  demoPayment?: boolean;
  onPayNow?: () => void;
  paying?: boolean;
  code: string;
  /** The page colour the notches are cut in. */
  ground?: string;
}) {
  const t = useTide();
  const look = payLook(fee, paid);
  const money = feeLabel ?? feeText(fee);
  const strip = {
    paid: {
      bg: t.accentTint,
      ring: undefined,
      disc: t.accentText,
      mark: "✓",
      title: `Paid · ${money}`,
      line: demoPayment ? "Demo payment · no money moved" : "Mobile Money · receipt sent by SMS",
      fg: t.accentText,
    },
    owed: {
      bg: t.surface,
      ring: t.primary,
      disc: t.primary,
      mark: "!",
      title: `Not paid · ${money}`,
      line:
        kind === "queue"
          ? "Pay before you are seen, here or at the desk"
          : "Pay before the day, or at the desk",
      fg: t.ink,
    },
    free: {
      bg: t.surface2,
      ring: undefined,
      disc: t.ink4,
      mark: "–",
      title: "No fee",
      line: "This visit is free at this hospital",
      fg: t.ink,
    },
  }[look];
  const label =
    kind === "queue"
      ? `Queue ticket, ${stage ?? ""}${aheadLine ? `, ${aheadLine}` : ""}. Code ${code.split("").join(" ")}`
      : `Visit ticket, ${dayLine ?? ""} ${day ?? ""}, ${sessionLine ?? ""}. Code ${code.split("").join(" ")}`;

  return (
    <View style={{ alignSelf: "stretch" }}>
      {/* top band */}
      <View
        accessibilityRole="summary"
        accessibilityLabel={label}
        style={{
          backgroundColor: t.band,
          borderTopLeftRadius: tRadius.panel,
          borderTopRightRadius: tRadius.panel,
          paddingHorizontal: tSpace[4.5],
          paddingTop: tSpace[4],
          paddingBottom: tSpace[5],
          gap: tSpace[3],
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2.5] }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: tRadius.sm,
              backgroundColor: t.onBand,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="building" size={20} color={t.band} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[tType.label, { color: t.onBand }]} numberOfLines={2}>
              {hospitalName}
            </Text>
            <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.onBand2 }]}>
              {kind === "queue" ? "MedSync queue ticket" : "MedSync visit ticket"}
            </Text>
          </View>
        </View>

        {kind === "queue" ? (
          <View style={{ gap: tSpace[1] }}>
            <Text style={[tType.bodyS, { color: t.onBand2 }]}>Your place in line</Text>
            <Text
              style={{
                fontFamily: tFont.bold,
                fontSize: 34,
                lineHeight: 38,
                letterSpacing: -0.8,
                color: t.accent,
              }}
            >
              {stage}
            </Text>
            {aheadLine ? (
              <Text style={[tType.heading, { fontFamily: tFont.bold, color: t.onBand }]}>
                {aheadLine}
              </Text>
            ) : null}
          </View>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: tSpace[2.5] }}>
              <Text
                style={{
                  fontFamily: tFont.monoBold,
                  fontSize: 68,
                  lineHeight: 68,
                  letterSpacing: -2.6,
                  color: t.onBand,
                }}
              >
                {day}
              </Text>
              <View style={{ paddingBottom: tSpace[1.5] }}>
                <Text style={[tType.heading, { fontFamily: tFont.bold, color: t.onBand }]}>
                  {dayLine}
                </Text>
                <Text style={[tType.bodyS, { color: t.onBand2 }]}>{sessionLine}</Text>
              </View>
            </View>
            {status ? (
              <View
                style={{
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: tSpace[1.5],
                  minHeight: 26,
                  paddingHorizontal: tSpace[2.5],
                  borderRadius: tRadius.pill,
                  backgroundColor: t.bandGlass,
                }}
              >
                <View
                  style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.onBand2 }}
                />
                <Text style={[tType.caption, { color: t.onBand2 }]}>{status}</Text>
              </View>
            ) : null}
          </>
        )}

        {look === "paid" ? (
          <View
            accessibilityLabel="Paid"
            style={{
              position: "absolute",
              right: tSpace[4],
              top: 66,
              transform: [{ rotate: "-12deg" }],
              paddingHorizontal: tSpace[3],
              paddingVertical: tSpace[1],
              borderWidth: 3,
              borderColor: t.onBandAccent,
              borderRadius: tRadius.sm,
            }}
          >
            <Text
              style={{
                fontFamily: tFont.extrabold,
                fontSize: 22,
                lineHeight: 26,
                letterSpacing: 2.6,
                color: t.onBandAccent,
              }}
            >
              PAID
            </Text>
          </View>
        ) : null}
      </View>

      {/* perforation: notches cut in the page colour, then the dashed tear line */}
      <View style={{ height: 0, zIndex: 2 }}>
        {(["left", "right"] as const).map((side) => (
          <View
            key={side}
            style={{
              position: "absolute",
              [side]: -NOTCH / 2,
              top: -NOTCH / 2,
              width: NOTCH,
              height: NOTCH,
              borderRadius: NOTCH / 2,
              backgroundColor: ground ?? t.bg,
            }}
          />
        ))}
      </View>
      <View style={{ backgroundColor: t.surface, paddingHorizontal: tSpace[4.5] }}>
        <View style={{ borderTopWidth: 2, borderStyle: "dashed", borderColor: t.line }} />
      </View>

      {/* details */}
      <View
        style={{
          backgroundColor: t.surface,
          borderBottomLeftRadius: tRadius.panel,
          borderBottomRightRadius: tRadius.panel,
          paddingHorizontal: tSpace[4.5],
          paddingTop: tSpace[4],
          paddingBottom: tSpace[4.5],
          gap: tSpace[3.5],
          boxShadow: t.shadow.card,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            rowGap: tSpace[3],
            columnGap: tSpace[3.5],
          }}
        >
          {details.map((d) => (
            <View key={d.label} style={{ width: "46%", gap: 2 }}>
              <Text
                style={[
                  tType.micro,
                  {
                    fontFamily: tFont.semibold,
                    letterSpacing: 0.9,
                    textTransform: "uppercase",
                    color: t.ink3,
                  },
                ]}
              >
                {d.label}
              </Text>
              <Text style={[tType.labelS, { color: t.ink }]} numberOfLines={1}>
                {d.value}
              </Text>
            </View>
          ))}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: tSpace[2.5],
            padding: tSpace[2.5],
            paddingHorizontal: tSpace[3],
            borderRadius: tRadius.md,
            backgroundColor: strip.bg,
            borderWidth: strip.ring ? 2 : 0,
            borderColor: strip.ring,
          }}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: strip.disc,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: tFont.extrabold, fontSize: 13, color: t.surface }}>
              {strip.mark}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[tType.labelS, { fontFamily: tFont.bold, color: strip.fg }]}>
              {strip.title}
            </Text>
            <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}>
              {strip.line}
            </Text>
          </View>
          {look === "owed" && onPayNow ? (
            <Button label="Pay now" size="sm" onPress={onPayNow} busy={paying} />
          ) : null}
        </View>

        <View style={{ alignItems: "center", gap: tSpace[1.5], paddingTop: tSpace[1] }}>
          <Text selectable style={[tType.code, { color: t.ink }]}>
            {code}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1.5] }}>
            <Icon name="check" size={14} color={t.accentText} />
            <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.accentText }]}>
              Show at the desk · works with no internet
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

type TicketProps = Parameters<typeof TicketFront>[0];

/** How far the ticket leans under a finger, in degrees: enough to feel, not enough to read wrong. */
const TILT = 7;

/**
 * The ticket as a thing in the hand (owner, 18 Oct 2026; ADR 0348): it leans
 * toward the finger in 3D and settles back when let go, turns over to a back
 * with the code large and what to do at the desk, and can be shared as a
 * picture (Snapchat, WhatsApp, Instagram) through the phone's share sheet.
 * The shared picture leaves off the name, the code, the clinic and the fee.
 *
 * Touches are only listened to, never claimed, so the page still scrolls
 * from the ticket and "Pay now" still presses. Under reduce motion there is
 * no lean and turning over is a cut.
 */
export function Ticket(props: TicketProps) {
  const t = useTide();
  const reduced = useReducedMotion();
  const [back, setBack] = useState(false);
  const [sharing, setSharing] = useState(false);
  const size = useSharedValue({ w: 1, h: 1 });
  const leanX = useSharedValue(0);
  const leanY = useSharedValue(0);
  const turn = useSharedValue(0);

  const lean = (x: number, y: number, ms: number) => {
    if (reduced) return;
    const { w, h } = size.value;
    leanY.value = withTiming(((x - w / 2) / (w / 2)) * TILT, { duration: ms });
    leanX.value = withTiming(-((y - h / 2) / (h / 2)) * TILT, { duration: ms });
  };
  const settle = () => {
    leanX.value = withTiming(0, { duration: 400, easing: EASE_OUT_FN });
    leanY.value = withTiming(0, { duration: 400, easing: EASE_OUT_FN });
  };
  const flip = () => {
    const next = !back;
    setBack(next);
    turn.value = reduced
      ? next
        ? 1
        : 0
      : withTiming(next ? 1 : 0, { duration: 450, easing: EASE_OUT_FN });
  };

  // One face's turn and lean; the back starts half a turn round, so each hides when it faces away.
  const faceOf = (isBack: boolean) => {
    "worklet";
    const turned = turn.value * 180 + (isBack ? 180 : 0);
    return {
      backfaceVisibility: "hidden" as const,
      opacity: reduced ? (isBack ? turn.value : 1 - turn.value) : 1,
      transform: [
        { perspective: 1200 },
        { rotateX: `${leanX.value}deg` },
        { rotateY: `${(reduced ? 0 : turned) + leanY.value}deg` },
        { scale: 1 + (Math.abs(leanX.value) + Math.abs(leanY.value)) * 0.0012 },
      ],
    };
  };
  const frontStyle = useAnimatedStyle(() => faceOf(false));
  const backStyle = useAnimatedStyle(() => faceOf(true));
  const glare = useAnimatedStyle(() => ({
    opacity: (Math.abs(leanX.value) + Math.abs(leanY.value)) / (TILT * 4),
    transform: [{ translateX: leanY.value * 6 }, { translateY: -leanX.value * 6 }],
  }));

  return (
    <View style={{ alignSelf: "stretch", gap: tSpace[3] }}>
      <Animated.View
        style={motion.ticketPop(reduced)}
        onLayout={(e) => {
          size.value = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
        }}
        onTouchStart={(e) => lean(e.nativeEvent.locationX, e.nativeEvent.locationY, 140)}
        onTouchMove={(e) => lean(e.nativeEvent.locationX, e.nativeEvent.locationY, 60)}
        onTouchEnd={settle}
        onTouchCancel={settle}
      >
        <Animated.View
          style={frontStyle}
          pointerEvents={back ? "none" : "auto"}
          accessibilityElementsHidden={back}
          importantForAccessibility={back ? "no-hide-descendants" : "auto"}
        >
          <TicketFront {...props} />
          <Animated.View
            pointerEvents="none"
            style={[{ position: "absolute", top: 0, left: 0, right: 0, height: "45%" }, glare]}
          >
            <LinearGradient
              colors={[t.surface, clearOf(t.surface)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                flex: 1,
                borderTopLeftRadius: tRadius.panel,
                borderTopRightRadius: tRadius.panel,
              }}
            />
          </Animated.View>
        </Animated.View>
        <Animated.View
          style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, backStyle]}
          pointerEvents={back ? "auto" : "none"}
          accessibilityElementsHidden={!back}
          importantForAccessibility={back ? "auto" : "no-hide-descendants"}
        >
          <TicketBack {...props} />
        </Animated.View>
      </Animated.View>

      <View style={{ flexDirection: "row", gap: tSpace[2] }}>
        <Button
          label={back ? "Show the front" : "Turn over"}
          icon="replay"
          variant="soft"
          size="sm"
          style={{ flex: 1 }}
          onPress={flip}
        />
        <Button
          label="Share"
          icon="send"
          variant="soft"
          size="sm"
          style={{ flex: 1 }}
          onPress={() => setSharing(true)}
        />
      </View>
      <TicketShareSheet visible={sharing} onClose={() => setSharing(false)} ticket={props} />
    </View>
  );
}

/** The back: the code large for the desk, and what to do there. Words only, nothing clinical. */
function TicketBack({
  kind,
  hospitalName,
  day,
  dayLine,
  sessionLine,
  stage,
  details,
  code,
}: TicketProps) {
  const t = useTide();
  const time = details.find((d) => d.label === "Time")?.value;
  const when =
    kind === "day"
      ? [dayLine, day].filter(Boolean).join(" ") + (sessionLine ? ` · ${sessionLine}` : "")
      : (stage ?? "");
  const steps = [
    "Go to the reception desk when you arrive.",
    "Show this code, or tell them the letters.",
    kind === "day" && time && time !== "Not promised"
      ? "Arrive a little early. The doctor may see you later than your time."
      : "You are seen in the order people arrive with a code.",
  ];
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.surface,
        borderRadius: tRadius.panel,
        boxShadow: t.shadow.card,
        padding: tSpace[4.5],
        gap: tSpace[4],
      }}
    >
      <View style={{ gap: 2 }}>
        <Text
          style={[tType.micro, { fontFamily: tFont.semibold, letterSpacing: 0.9, color: t.ink3 }]}
        >
          AT THE HOSPITAL
        </Text>
        <Text style={[tType.label, { color: t.ink }]} numberOfLines={2}>
          {hospitalName}
        </Text>
        <Text style={[tType.bodyS, { color: t.ink2 }]}>{when}</Text>
      </View>

      <View
        style={{
          alignItems: "center",
          gap: tSpace[1.5],
          paddingVertical: tSpace[5],
          borderRadius: tRadius.md,
          backgroundColor: t.surface2,
        }}
      >
        <Text
          style={[tType.micro, { fontFamily: tFont.semibold, letterSpacing: 0.9, color: t.ink3 }]}
        >
          YOUR CODE
        </Text>
        <Text
          selectable
          style={{
            fontFamily: tFont.monoBold,
            fontSize: 40,
            lineHeight: 46,
            letterSpacing: 6,
            color: t.ink,
          }}
        >
          {code}
        </Text>
        <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.accentText }]}>
          Works with no internet
        </Text>
      </View>

      <View style={{ gap: tSpace[2.5] }}>
        {steps.map((line, i) => (
          <View
            key={line}
            style={{ flexDirection: "row", gap: tSpace[2.5], alignItems: "flex-start" }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: t.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontFamily: tFont.bold, fontSize: 12, color: t.onPrimary }}>
                {i + 1}
              </Text>
            </View>
            <Text style={[tType.bodyM, { flex: 1, color: t.ink }]}>{line}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
