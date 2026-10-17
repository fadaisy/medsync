import { Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import Svg, { Rect } from "react-native-svg";

import { Icon } from "@/components/tide/icon";
import { Button } from "@/components/tide/primitives";
import { barsFor, feeText, payLook } from "@/features/visits/logic";
import { motion } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * The tear-off ticket (prompt §8.3), for a place in today's line and for an
 * asked-for clinic day. A navy top band, a perforation with 28pt notches cut
 * in the page colour, the details (Time is always "Not promised", law L8), a
 * payment strip in one of three looks that never read alike, a drawn barcode
 * and the code in mono. It pops in once (`ticketPop`).
 *
 * The three money looks: paid is a lagoon strip with a tilted PAID stamp on
 * the band; not paid is an outlined strip with "Pay now"; no fee is a quiet
 * grey strip. Each carries its words, never colour alone.
 */
const NOTCH = 28;

export function Ticket({
  kind,
  hospitalName,
  number,
  ahead,
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
  /** Queue: your number and the people before you. */
  number?: number;
  ahead?: number;
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
  const reduced = useReducedMotion();
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
      ? `Queue ticket, number ${number ?? ""}, ${ahead ?? 0} before you. Code ${code.split("").join(" ")}`
      : `Visit ticket, ${dayLine ?? ""} ${day ?? ""}, ${sessionLine ?? ""}. Code ${code.split("").join(" ")}`;

  return (
    <Animated.View style={[{ alignSelf: "stretch" }, motion.ticketPop(reduced)]}>
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
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              justifyContent: "space-between",
            }}
          >
            <View style={{ gap: 2 }}>
              <Text style={[tType.bodyS, { color: t.onBand2 }]}>Your place in line</Text>
              <Text
                style={{
                  fontFamily: tFont.monoBold,
                  fontSize: 72,
                  lineHeight: 72,
                  letterSpacing: -2.8,
                  color: t.accent,
                }}
              >
                #{number}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", paddingBottom: tSpace[1.5] }}>
              <Text
                style={{
                  fontFamily: tFont.monoBold,
                  fontSize: 22,
                  lineHeight: 26,
                  color: t.onBand,
                }}
              >
                {ahead}
              </Text>
              <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.onBand2 }]}>
                before you
              </Text>
            </View>
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
          <Svg
            width={230}
            height={44}
            viewBox="0 0 230 44"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {barsFor(code).map((b) => (
              <Rect key={b.x} x={b.x} y={0} width={b.w} height={44} fill={t.ink} />
            ))}
          </Svg>
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
    </Animated.View>
  );
}
