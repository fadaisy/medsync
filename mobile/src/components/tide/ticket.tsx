import { useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { captureRef } from "react-native-view-shot";

import { FieldError } from "@/components/tide/field";
import { Icon } from "@/components/tide/icon";
import { Button } from "@/components/tide/primitives";
import { clearOf } from "@/components/tide/screen";
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
  /** UGX, null for no fee, or left out when this phone does not know it: then no payment strip. */
  fee?: number | null;
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
  const look = fee === undefined ? null : payLook(fee, paid);
  const money = feeLabel ?? feeText(fee ?? null);
  const strips = {
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
  };
  const strip = look ? strips[look] : null;
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

        {strip ? (
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
        ) : null}

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
/** How much of a drag the ticket follows as movement: it moves with the hand, a little. */
const FOLLOW = 0.14;

/**
 * The ticket as a thing in the hand (owner, 18 Oct 2026; ADR 0348, 0349).
 *
 * - Touch it and it leans toward the finger in 3D, then settles when let go.
 * - Drag it sideways and it turns with the finger and moves a little with the
 *   hand; let go and it lands on whichever face is nearer, the front or the
 *   back (the code large and the steps at the desk). A quick flick turns it.
 * - "Share" sends the whole front as a picture through the phone's share
 *   sheet (Snapchat, WhatsApp, Instagram), name and code included, as the
 *   owner asked; the line under the button says so.
 *
 * Only a sideways drag is claimed, so the page still scrolls from the ticket
 * and "Pay now" still presses. A screen reader turns it with the "Turn over"
 * action. Under reduce motion there is no lean or movement, and a swipe
 * turns it with a fade.
 */
export function Ticket(props: TicketProps) {
  const t = useTide();
  const reduced = useReducedMotion();
  const [back, setBack] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const front = useRef<View>(null);
  const size = useSharedValue({ w: 1, h: 1 });
  const leanX = useSharedValue(0);
  const leanY = useSharedValue(0);
  /** The turn in degrees: 0, 180, 360… at rest; between them while dragged. */
  const spin = useSharedValue(0);
  const moveX = useSharedValue(0);
  const moveY = useSharedValue(0);
  // Where the turn rests and whether a drag is on, for the touch handlers.
  const rest = useSharedValue(0);
  const dragging = useSharedValue(false);
  const start = useSharedValue({ x: 0, y: 0 });

  const lean = (x: number, y: number, ms: number) => {
    if (reduced || dragging.value) return;
    const { w, h } = size.value;
    leanY.value = withTiming(((x - w / 2) / (w / 2)) * TILT, { duration: ms });
    leanX.value = withTiming(-((y - h / 2) / (h / 2)) * TILT, { duration: ms });
  };
  const settle = () => {
    if (dragging.value) return;
    const ease = { duration: 400, easing: EASE_OUT_FN };
    leanX.value = withTiming(0, ease);
    leanY.value = withTiming(0, ease);
    moveX.value = withTiming(0, ease);
    moveY.value = withTiming(0, ease);
  };
  /** Land on the nearer face; `toward` +1/-1 forces a half turn that way. */
  const land = (to: number) => {
    rest.value = to;
    setBack(Math.abs(Math.round(to / 180)) % 2 === 1);
    spin.value = reduced ? to : withTiming(to, { duration: 450, easing: EASE_OUT_FN });
  };

  const touch = (n: { pageX: number; pageY: number; locationX: number; locationY: number }) => {
    start.value = { x: n.pageX, y: n.pageY };
    lean(n.locationX, n.locationY, 140);
  };
  const grab = () => {
    dragging.value = true;
  };
  /** The ticket turns with the finger and moves a little with the hand. */
  const follow = (pageX: number, pageY: number) => {
    if (reduced) return;
    const { w, h } = size.value;
    const dx = pageX - start.value.x;
    const dy = pageY - start.value.y;
    spin.value = rest.value + (dx / w) * 180;
    moveX.value = dx * FOLLOW;
    moveY.value = dy * FOLLOW;
    leanX.value = Math.max(-TILT, Math.min(TILT, (-dy / h) * TILT * 2));
  };
  const finish = (dx: number) => {
    dragging.value = false;
    const from = rest.value;
    if (reduced) {
      // A swipe is a turn; nothing follows the finger.
      if (Math.abs(dx) > 40) land(from + (dx > 0 ? 180 : -180));
    } else {
      // Where the finger left it; a drag past a quarter of the width turns it, as a flick would.
      const at = from + (dx / size.value.w) * 180;
      const nearest = Math.round(at / 180) * 180;
      land(
        nearest === from && Math.abs(dx) > size.value.w / 4 ? from + Math.sign(dx) * 180 : nearest,
      );
    }
    settle();
  };

  const share = async () => {
    setShareError(null);
    setBusy(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setShareError("Sharing isn't available on this phone.");
        return;
      }
      const uri = await captureRef(front, { format: "png", quality: 1, result: "tmpfile" });
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        UTI: "public.png",
        dialogTitle: "Share your ticket",
      });
    } catch {
      setShareError("The ticket didn't share. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // One face's turn, lean and movement; the back starts half a turn round, so each hides when it faces away.
  const faceOf = (isBack: boolean) => {
    "worklet";
    const facingBack = Math.abs(Math.round(spin.value / 180)) % 2 === 1;
    return {
      backfaceVisibility: "hidden" as const,
      opacity: reduced ? (isBack === facingBack ? 1 : 0) : 1,
      transform: [
        { perspective: 1200 },
        { translateX: moveX.value },
        { translateY: moveY.value },
        { rotateX: `${leanX.value}deg` },
        { rotateY: `${(reduced ? 0 : spin.value + (isBack ? 180 : 0)) + leanY.value}deg` },
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
        // Sideways only: an upright drag stays the page's scroll, and a tap stays "Pay now".
        onMoveShouldSetResponder={(e) => {
          const dx = e.nativeEvent.pageX - start.value.x;
          const dy = e.nativeEvent.pageY - start.value.y;
          return Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2;
        }}
        onResponderTerminationRequest={() => false}
        onResponderGrant={grab}
        onResponderMove={(e) => follow(e.nativeEvent.pageX, e.nativeEvent.pageY)}
        onResponderRelease={(e) => finish(e.nativeEvent.pageX - start.value.x)}
        onResponderTerminate={(e) => finish(e.nativeEvent.pageX - start.value.x)}
        style={motion.ticketPop(reduced)}
        accessibilityActions={[{ name: "activate", label: "Turn over" }]}
        onAccessibilityAction={() => land(rest.value + 180)}
        accessibilityHint="Drag sideways to turn the ticket over."
        onLayout={(e) => {
          size.value = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
        }}
        onTouchStart={(e) => touch(e.nativeEvent)}
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
          {/* What "Share" captures: the whole front, flat, without the light on it. */}
          <View ref={front} collapsable={false} style={{ backgroundColor: t.bg }}>
            <TicketFront {...props} />
          </View>
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

      <View style={{ gap: tSpace[1.5] }}>
        <Button
          label="Share ticket"
          icon="send"
          variant="soft"
          size="sm"
          busy={busy}
          onPress={() => void share()}
        />
        <Text
          style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3, textAlign: "center" }]}
        >
          Drag it sideways to turn it over. Sharing sends the whole ticket, with your name and code.
        </Text>
        {shareError ? <FieldError>{shareError}</FieldError> : null}
      </View>
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
