import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Icon } from "@/components/tide/icon";
import { Button } from "@/components/tide/primitives";
import { feeText, payLook } from "@/features/visits/logic";
import { EASE_OUT_FN, motion } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * The visit ticket (prompt §8.3; ADR 0350), for a place in today's line and
 * for a day asked for: a boarding pass. A band of stripes across the top, the
 * brand and the hospital, the day and the time large, the patient, the other
 * details small, the payment line, then a perforation with notches cut in the
 * page colour and a stub with the code, which is what the desk reads (no
 * drawn barcode: nothing could scan it).
 *
 * Tap it and it turns over to the back: the code large and what to do at the
 * desk. Tapping "Pay now" pays and does not turn it. The face turned away is
 * hidden from touch and screen readers, and a screen reader turns it with the
 * "Turn over" action. Under reduce motion it changes with a fade.
 *
 * Time is "Not promised" for a place in line or a clinic day (law L8); a
 * doctor's slot shows its clock (ADR 0344). The queue shows the stage and,
 * once the patient is present, "N ahead of you", never a place number
 * (ADR 0084 §6). The three money looks each carry their words, never colour
 * alone.
 */
export interface TicketProps {
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
  /** UGX, null for no fee, or left out when this phone does not know it: then no payment line. */
  fee?: number | null;
  feeLabel?: string | null;
  paid: boolean;
  demoPayment?: boolean;
  onPayNow?: () => void;
  paying?: boolean;
  code: string;
  /** The page colour the notches are cut in. */
  ground?: string;
}

const NOTCH = 28;

export function Ticket(props: TicketProps) {
  const t = useTide();
  const reduced = useReducedMotion();
  const [back, setBack] = useState(false);
  // Both faces take the taller one's height, so neither spills out when turned.
  // ponytail: heights only grow while mounted; a face that shrinks keeps the old height until remount.
  const [frontH, setFrontH] = useState(0);
  const [backH, setBackH] = useState(0);
  const turn = useSharedValue(0);

  const flip = () => {
    const next = !back;
    setBack(next);
    turn.value = withTiming(next ? 1 : 0, {
      duration: reduced ? 150 : 450,
      easing: EASE_OUT_FN,
    });
  };

  // The back starts half a turn round, so each face hides when it faces away.
  const frontStyle = useAnimatedStyle(() => ({
    backfaceVisibility: "hidden",
    opacity: reduced ? 1 - turn.value : 1,
    transform: [{ perspective: 1200 }, { rotateY: `${reduced ? 0 : turn.value * 180}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    backfaceVisibility: "hidden",
    opacity: reduced ? turn.value : 1,
    transform: [{ perspective: 1200 }, { rotateY: `${reduced ? 0 : turn.value * 180 + 180}deg` }],
  }));
  const turnOver = {
    accessibilityActions: [{ name: "activate", label: "Turn over" }],
    onAccessibilityAction: flip,
  };

  return (
    <View style={{ alignSelf: "stretch", gap: tSpace[2] }}>
      <Animated.View style={motion.ticketPop(reduced)}>
        {/* A tap anywhere turns it; a nested button ("Pay now") keeps its own press. */}
        <Pressable accessible={false} onPress={flip}>
          <Animated.View
            style={[{ minHeight: backH }, frontStyle]}
            onLayout={(e) => setFrontH(Math.max(frontH, Math.ceil(e.nativeEvent.layout.height)))}
            pointerEvents={back ? "none" : "auto"}
            accessibilityElementsHidden={back}
            importantForAccessibility={back ? "no-hide-descendants" : "auto"}
          >
            <TicketFront {...props} turnOver={turnOver} />
          </Animated.View>
          <Animated.View
            style={[
              { position: "absolute", top: 0, left: 0, right: 0, minHeight: frontH },
              backStyle,
            ]}
            onLayout={(e) => setBackH(Math.max(backH, Math.ceil(e.nativeEvent.layout.height)))}
            pointerEvents={back ? "auto" : "none"}
            accessibilityElementsHidden={!back}
            importantForAccessibility={back ? "auto" : "no-hide-descendants"}
          >
            <TicketBack {...props} turnOver={turnOver} />
          </Animated.View>
        </Pressable>
      </Animated.View>
      <Text
        style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3, textAlign: "center" }]}
      >
        {back ? "Tap the ticket to see the front" : "Tap the ticket to turn it over"}
      </Text>
    </View>
  );
}

type TurnOver = {
  accessibilityActions: { name: string; label: string }[];
  onAccessibilityAction: () => void;
};

/** The white card and, when given, the perforation and stub. */
function Shell({
  children,
  stub,
  ground,
  fill,
}: {
  children: ReactNode;
  stub?: ReactNode;
  ground?: string;
  /** Stretch to the face's height, so front and back are the same size. */
  fill?: boolean;
}) {
  const t = useTide();
  return (
    <View
      style={{
        flex: fill ? 1 : undefined,
        borderRadius: tRadius.panel,
        backgroundColor: t.surface,
        boxShadow: t.shadow.card,
      }}
    >
      <View
        style={{
          flex: fill ? 1 : undefined,
          paddingHorizontal: tSpace[4.5],
          paddingTop: tSpace[4],
          paddingBottom: stub ? tSpace[4] : tSpace[4.5],
          gap: tSpace[3.5],
        }}
      >
        {children}
      </View>

      {stub ? (
        <>
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
          <View style={{ paddingHorizontal: tSpace[4.5] + NOTCH / 2 }}>
            <View style={{ borderTopWidth: 2, borderStyle: "dashed", borderColor: t.line }} />
          </View>
          <View
            style={{
              paddingHorizontal: tSpace[4.5],
              paddingTop: tSpace[4],
              paddingBottom: tSpace[4.5],
              alignItems: "center",
              gap: tSpace[1.5],
            }}
          >
            {stub}
          </View>
        </>
      ) : null}
    </View>
  );
}

function Rule() {
  const t = useTide();
  return <View style={{ height: 1, backgroundColor: t.line }} />;
}

/** A small grey label over its value: the boarding pass's fields. */
function Field({
  label,
  children,
  align = "left",
  width,
}: {
  label: string;
  children: ReactNode;
  align?: "left" | "right";
  width?: `${number}%`;
}) {
  const t = useTide();
  return (
    <View style={{ width, gap: 2, alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3 }]}>{label}</Text>
      {children}
    </View>
  );
}

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
  turnOver,
}: TicketProps & { turnOver: TurnOver }) {
  const t = useTide();
  const look = fee === undefined ? null : payLook(fee, paid);
  const money = feeLabel ?? feeText(fee ?? null);
  const strip = look
    ? {
        paid: {
          disc: t.accentText,
          mark: "✓",
          title: `Paid · ${money}`,
          line: demoPayment
            ? "Demo payment · no money moved"
            : "Mobile Money · receipt sent by SMS",
          fg: t.accentText,
        },
        owed: {
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
          disc: t.ink4,
          mark: "–",
          title: "No fee",
          line: "This visit is free at this hospital",
          fg: t.ink,
        },
      }[look]
    : null;

  const patient = details.find((d) => d.label === "Patient")?.value;
  const timeValue = details.find((d) => d.label === "Time")?.value;
  // A doctor's slot: "10:40 · arrive a little early" puts 10:40 large; anything else stays a field.
  const clock = timeValue && /^\d/.test(timeValue) ? timeValue.split(" · ")[0] : null;
  const fields = details.filter((d) => d.label !== "Patient" && !(clock && d.label === "Time"));
  const label =
    kind === "queue"
      ? `Queue ticket, ${stage ?? ""}${aheadLine ? `, ${aheadLine}` : ""}. Code ${code.split("").join(" ")}`
      : `Visit ticket, ${dayLine ?? ""} ${day ?? ""}, ${clock ?? sessionLine ?? ""}. Code ${code.split("").join(" ")}`;
  const big = { fontFamily: tFont.bold, fontSize: 30, lineHeight: 34, letterSpacing: -0.6 };

  return (
    <Shell
      fill
      ground={ground}
      stub={
        <>
          <Text selectable style={[tType.code, { fontSize: 26, lineHeight: 32, color: t.ink }]}>
            {code}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1.5] }}>
            <Icon name="check" size={14} color={t.accentText} />
            <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.accentText }]}>
              Show at the desk · works with no internet
            </Text>
          </View>
        </>
      }
    >
      {/* brand */}
      <View
        accessibilityRole="summary"
        accessibilityLabel={label}
        {...turnOver}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1.5] }}>
          <Icon name="forward" size={18} color={t.ink} strokeWidth={3} />
          <Text
            style={{ fontFamily: tFont.extrabold, fontSize: 18, letterSpacing: -0.4, color: t.ink }}
          >
            MedSync
          </Text>
        </View>
        <Text style={[tType.labelS, { color: t.ink2 }]}>
          {kind === "queue" ? "Queue ticket" : "Visit ticket"}
        </Text>
      </View>

      {/* the hospital, like the carrier */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: tSpace[2] }}>
        <Icon name="building" size={18} color={t.ink2} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[tType.labelS, { color: t.ink }]} numberOfLines={2}>
            {hospitalName}
          </Text>
          <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3 }]}>
            {kind === "queue" ? "Today" : (status ?? "")}
          </Text>
        </View>
        {look === "paid" ? (
          <View
            accessibilityLabel="Paid"
            style={{
              transform: [{ rotate: "-8deg" }],
              paddingHorizontal: tSpace[2],
              paddingVertical: 2,
              borderWidth: 2,
              borderColor: t.accentText,
              borderRadius: tRadius.sm,
            }}
          >
            <Text
              style={{
                fontFamily: tFont.extrabold,
                fontSize: 14,
                letterSpacing: 1.6,
                color: t.accentText,
              }}
            >
              PAID
            </Text>
          </View>
        ) : null}
      </View>

      <Rule />

      {/* the day and the time, large, like the route */}
      {kind === "queue" ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: tSpace[3] }}>
          <Field label="Your place">
            <Text style={[big, { fontSize: 24, lineHeight: 28, color: t.ink }]}>{stage}</Text>
          </Field>
          {aheadLine ? (
            <Field label="Now" align="right">
              <Text style={[tType.heading, { fontFamily: tFont.bold, color: t.ink2 }]}>
                {aheadLine}
              </Text>
            </Field>
          ) : null}
        </View>
      ) : (
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: tSpace[3] }}>
          <Field label={dayLine ?? "Day"}>
            <Text style={[big, { fontFamily: tFont.monoBold, color: t.ink }]}>{day}</Text>
          </Field>
          <View style={{ flex: 1 }}>
            <Field label="Time" align="right">
              {clock ? (
                <Text style={[big, { fontFamily: tFont.monoBold, color: t.ink3 }]}>{clock}</Text>
              ) : (
                <Text
                  style={[
                    tType.heading,
                    { fontFamily: tFont.bold, color: t.ink3, textAlign: "right" },
                  ]}
                >
                  {sessionLine}
                </Text>
              )}
            </Field>
          </View>
        </View>
      )}

      {patient ? (
        <>
          <Rule />
          <Field label="Patient">
            <Text
              style={[tType.heading, { fontFamily: tFont.bold, color: t.ink }]}
              numberOfLines={1}
            >
              {patient}
            </Text>
          </Field>
        </>
      ) : null}

      {fields.length ? (
        <>
          <Rule />
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              rowGap: tSpace[3],
              columnGap: tSpace[3],
            }}
          >
            {fields.map((d) => (
              <Field key={d.label} label={d.label} width="46%">
                <Text style={[tType.labelS, { color: t.ink }]} numberOfLines={1}>
                  {d.value}
                </Text>
              </Field>
            ))}
          </View>
        </>
      ) : null}

      {strip ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: tSpace[2.5],
            padding: tSpace[2.5],
            borderRadius: tRadius.md,
            backgroundColor: t.surface2,
          }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: strip.disc,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: tFont.extrabold, fontSize: 12, color: t.surface }}>
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
    </Shell>
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
  ground,
  turnOver,
}: TicketProps & { turnOver: TurnOver }) {
  const t = useTide();
  const time = details.find((d) => d.label === "Time")?.value;
  const when =
    kind === "day"
      ? [dayLine, day].filter(Boolean).join(" ") + (sessionLine ? ` · ${sessionLine}` : "")
      : (stage ?? "");
  const steps = [
    "Go to the reception desk when you arrive.",
    "Show this code, or tell them the letters.",
    kind === "day" && time && /^\d/.test(time)
      ? "Arrive a little early. The doctor may see you later than your time."
      : "You are seen in the order people arrive with a code.",
  ];
  return (
    <Shell ground={ground} fill>
      <View
        {...turnOver}
        accessibilityLabel={`Back of the ticket. Code ${code.split("").join(" ")}`}
      >
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
          gap: tSpace[1],
          paddingVertical: tSpace[3.5],
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
            fontSize: 34,
            lineHeight: 40,
            letterSpacing: 5,
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
    </Shell>
  );
}
