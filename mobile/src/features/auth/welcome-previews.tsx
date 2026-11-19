import type { ReactNode } from "react";
import type { TextStyle } from "react-native";
import { Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { Icon } from "@/components/tide/icon";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tType } from "@/theme/tide";

/**
 * The three pictures on the welcome slides (owner's approved onboarding prototype, 18 Nov 2026).
 *
 * Each is a small still drawing of a screen the app really has (Home's doctors and "Ask for a day", the
 * visit card on the day, the people you book for), not a scene or a character. The words are stand-ins:
 * bracketed where a real screen would show a name, and sample days and codes that belong to nobody. They are
 * decoration for the headline beside them, so the welcome hides the whole drawing from screen readers and
 * nothing in it can be pressed.
 */

const HEAD: TextStyle = { ...tType.title, fontSize: 22, lineHeight: 28, letterSpacing: -0.44 };
const SMALL: TextStyle = { ...tType.bodyS, lineHeight: 17 };
const STRONG: TextStyle = { ...tType.label, fontSize: 15, lineHeight: 20 };

function Sheet({ children, gap = 16 }: { children: ReactNode; gap?: number }) {
  const t = useTide();
  return (
    <View
      style={{
        padding: 20,
        gap,
        borderRadius: tRadius.xl,
        backgroundColor: t.surface,
        boxShadow: t.shadow.card,
      }}
    >
      {children}
    </View>
  );
}

function CodePill({ code }: { code: string }) {
  const t = useTide();
  return (
    <View
      style={{
        height: 26,
        paddingHorizontal: 10,
        borderRadius: tRadius.pill,
        backgroundColor: t.surface3,
        justifyContent: "center",
      }}
    >
      <Text
        style={{ fontFamily: tFont.monoSemibold, fontSize: 13, letterSpacing: 1, color: t.ink }}
      >
        {code}
      </Text>
    </View>
  );
}

/* ─── 1 · Book from anywhere ─────────────────────────────────────────── */

const DOCTORS = [
  { day: "Today", role: "Medical Officer" },
  { day: "Thu 19 Nov", role: "Dental Surgeon" },
  { day: "Mon 23 Nov", role: "Senior Consultant" },
] as const;

function BookPreview() {
  const t = useTide();
  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 10 }}>
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Text style={[HEAD, { color: t.ink }]}>See a doctor</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Text style={[STRONG, { color: t.accentText }]}>See all</Text>
            <Icon name="forward" size={18} color={t.accentText} />
          </View>
        </View>
        {/* The row runs off the right edge, as Home's does. */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {DOCTORS.map((d, i) => (
            <View
              key={d.role}
              style={{
                width: 156,
                borderRadius: tRadius.cardLg,
                overflow: "hidden",
                backgroundColor: t.surface,
                boxShadow: t.shadow.card,
              }}
            >
              <View
                style={{
                  height: 118,
                  backgroundColor: t.surface3,
                  alignItems: "center",
                  justifyContent: "flex-end",
                  overflow: "hidden",
                }}
              >
                {/* A grey outline where a photograph would be. Nobody in particular. */}
                <Svg
                  width={104}
                  height={104}
                  viewBox="0 0 24 24"
                  fill={t.ink3}
                  opacity={0.4}
                  style={{ marginBottom: -18 }}
                >
                  <Circle cx={12} cy={9} r={4.2} />
                  <Path d="M3.5 24c0-5 3.8-8.2 8.5-8.2s8.5 3.2 8.5 8.2z" />
                </Svg>
                <View
                  style={{
                    position: "absolute",
                    left: 10,
                    top: 10,
                    height: 26,
                    paddingHorizontal: 10,
                    borderRadius: tRadius.pill,
                    backgroundColor: i === 0 ? t.primary : t.surface,
                    justifyContent: "center",
                  }}
                >
                  <Text style={[tType.caption, { color: i === 0 ? t.onPrimary : t.ink }]}>
                    {d.day}
                  </Text>
                </View>
              </View>
              <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 }}>
                <Text numberOfLines={1} style={[STRONG, { color: t.ink }]}>
                  [Doctor name]
                </Text>
                <Text numberOfLines={1} style={[SMALL, { color: t.ink2 }]}>
                  {d.role}
                </Text>
                <Text numberOfLines={1} style={[SMALL, { color: t.ink2 }]}>
                  [Your hospital]
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
      <Sheet gap={10}>
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <View
            style={{
              height: 28,
              paddingHorizontal: 12,
              borderRadius: tRadius.pill,
              backgroundColor: t.place.tint,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <View
              style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.area.visits }}
            />
            <Text style={[SMALL, { fontFamily: tFont.semibold, color: t.place.text }]}>
              Next open day: Thu 26 Nov
            </Text>
          </View>
          <Icon name="forward" size={20} color={t.ink3} />
        </View>
        <Text style={[HEAD, { color: t.ink }]}>Ask for a day</Text>
        <Text style={[tType.bodyM, { color: t.ink2 }]}>
          Pick an open clinic day. The clinic confirms it.
        </Text>
      </Sheet>
    </View>
  );
}

/* ─── 2 · Your ticket, on your phone ─────────────────────────────────── */

function TodayLabel() {
  const t = useTide();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 28 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.area.visits }} />
      <Text style={[SMALL, { fontFamily: tFont.semibold, letterSpacing: 0.78, color: t.ink2 }]}>
        TODAY
      </Text>
    </View>
  );
}

/** The stage as one bar, never a number (MR4). */
function StageTrack({ part }: { part: `${number}%` }) {
  const t = useTide();
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surface3, overflow: "hidden" }}>
      <View style={{ width: part, height: 6, borderRadius: 3, backgroundColor: t.ink }} />
    </View>
  );
}

function CodePreview() {
  const t = useTide();
  return (
    <View style={{ gap: 14 }}>
      <Sheet>
        <TodayLabel />
        <View style={{ gap: 4 }}>
          <Text style={[HEAD, { color: t.ink }]}>Show this at the desk</Text>
          <Text style={[tType.bodyM, { color: t.ink2 }]}>General OPD · doors open 08:00</Text>
        </View>
        <View
          style={{
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: tRadius.md,
            backgroundColor: t.surface3,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={[tType.bodyM, { color: t.ink2 }]}>Your code</Text>
          <Text
            style={{
              fontFamily: tFont.monoSemibold,
              fontSize: 26,
              lineHeight: 30,
              letterSpacing: 2,
              color: t.ink,
            }}
          >
            K7M-42Q
          </Text>
        </View>
        <View style={{ gap: 8 }}>
          <Text style={[STRONG, { color: t.ink }]}>Booked</Text>
          <StageTrack part="20%" />
        </View>
      </Sheet>
      <Sheet>
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <TodayLabel />
          <CodePill code="K7M-42Q" />
        </View>
        <View style={{ gap: 4 }}>
          <Text style={[HEAD, { color: t.ink }]}>Waiting for the nurse</Text>
          <Text style={[tType.bodyM, { color: t.ink2 }]}>General OPD · [Your hospital]</Text>
        </View>
        <StageTrack part="60%" />
      </Sheet>
    </View>
  );
}

/* ─── 3 · Book for your family ───────────────────────────────────────── */

const FAMILY_VISITS = [
  {
    day: "24",
    weekday: "Tue",
    clinic: "Eye Clinic",
    line: "[Parent] · Morning, doors open 08:00",
    code: "T9R-55C",
  },
  {
    day: "27",
    weekday: "Fri",
    clinic: "Dental Clinic",
    line: "[Child] · Afternoon, doors open 14:00",
    code: "P3D-81X",
  },
] as const;

function FamilyPreview() {
  const t = useTide();
  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 12 }}>
        <Text style={[HEAD, { color: t.ink }]}>People you book for</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(["[Parent]", "[Child]"] as const).map((who) => (
            <View
              key={who}
              style={{
                height: 48,
                paddingLeft: 6,
                paddingRight: 16,
                borderRadius: tRadius.pill,
                backgroundColor: t.surface,
                borderWidth: 1,
                borderColor: t.lineStrong,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: t.surface3,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={[SMALL, { fontFamily: tFont.semibold, color: t.ink2 }]}>
                  {who.charAt(1)}
                </Text>
              </View>
              <Text style={[STRONG, { color: t.ink }]}>{who}</Text>
            </View>
          ))}
          <View
            style={{
              height: 48,
              paddingLeft: 12,
              paddingRight: 16,
              borderRadius: tRadius.pill,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: t.lineStrong,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="plus" size={18} color={t.accentText} />
            <Text style={[STRONG, { color: t.accentText }]}>Add someone</Text>
          </View>
        </View>
      </View>
      <View style={{ gap: 8 }}>
        {FAMILY_VISITS.map((v) => (
          <View
            key={v.code}
            style={{
              padding: 14,
              borderRadius: tRadius.cardLg,
              backgroundColor: t.surface,
              boxShadow: t.shadow.card,
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
            }}
          >
            <View
              style={{
                width: 56,
                height: 64,
                borderRadius: tRadius.row,
                backgroundColor: t.band,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: tFont.semibold,
                  fontSize: 24,
                  lineHeight: 26,
                  color: t.onBand,
                }}
              >
                {v.day}
              </Text>
              <Text style={[tType.bodyS, { fontSize: 12, lineHeight: 16, color: t.onBand }]}>
                {v.weekday}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <Text style={[tType.heading, { fontSize: 18, lineHeight: 24, color: t.ink }]}>
                    {v.clinic}
                  </Text>
                  <Icon name="forward" size={20} color={t.ink3} />
                </View>
                <Text numberOfLines={1} style={[SMALL, { color: t.ink2 }]}>
                  {v.line}
                </Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                <CodePill code={v.code} />
                <View
                  style={{
                    height: 26,
                    paddingHorizontal: 10,
                    borderRadius: tRadius.pill,
                    backgroundColor: t.surface3,
                    justifyContent: "center",
                  }}
                >
                  <Text style={[SMALL, { fontFamily: tFont.semibold, color: t.ink2 }]}>
                    Pays at the hospital
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The drawing for one welcome slide: 0 Book from anywhere, 1 Your ticket, 2 Book for your family. */
export function WelcomePreview({ index }: { index: 0 | 1 | 2 }) {
  return index === 0 ? <BookPreview /> : index === 1 ? <CodePreview /> : <FamilyPreview />;
}
