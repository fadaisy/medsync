import type { IconName } from "@/components/tide";
import type { BookGlance } from "@/data/visits";
import type { AppointmentReason, HouseholdMember } from "@/lib/booking";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Text, View } from "react-native";

import { Avatar, Icon, IconDisc, Note, Press, Screen } from "@/components/tide";
import { loadBookGlance } from "@/data/visits";
import { HospitalPicker } from "@/features/visits/hospital-picker";
import { shortDayOf } from "@/features/visits/logic";
import { HONEST, pickStyle, StepTitle } from "@/features/visits/parts";
import { fetchHousehold } from "@/lib/booking";
import { useSession } from "@/lib/session";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * Book a visit (board TBook, PRD F-09): who, why, how.
 *
 * Who: me, or someone this account books for (`fetchHousehold`, real); the
 * plus opens the household screen to add one. Why: four tiles, each mapped to
 * the server's reason code; "Something new is wrong" goes to the symptom
 * catalogue first, so the right clinic sees them. How: come today (joins the
 * line) or ask for a day. The glance on each door is real: whether a clinic
 * takes walk-ins now, and the next clinic day with a place. No count of
 * people in line (ADR 0084 §5). Without a hospital the patient chooses one
 * first, here.
 */
type Why = "review" | "new" | "lab" | "meds";

const WHY: { key: Why; label: string; icon: IconName; reason: AppointmentReason | null }[] = [
  { key: "review", label: "My diabetes and pressure check", icon: "droplet", reason: "follow_up" },
  { key: "new", label: "Something new is wrong", icon: "activity", reason: null },
  { key: "lab", label: "A lab test only", icon: "flask", reason: "routine" },
  { key: "meds", label: "Pick up my medicines", icon: "pill", reason: "refill" },
];

export default function BookScreen() {
  const t = useTide();
  const router = useRouter();
  const { session } = useSession();
  const fullName = session?.user.user_metadata?.full_name;
  const me = typeof fullName === "string" && fullName.trim() ? fullName : "Me";

  const [who, setWho] = useState<HouseholdMember | null>(null);
  const [why, setWhy] = useState<Why>("review");
  const [household, setHousehold] = useState<HouseholdMember[]>([]);
  const [glance, setGlance] = useState<BookGlance | null>(null);

  // On focus (a person added on the household screen shows when they come
  // back), and again once a hospital is chosen below.
  const load = useCallback(() => {
    fetchHousehold().then(setHousehold, () => setHousehold([]));
    loadBookGlance().then(setGlance, () => setGlance(null));
  }, []);
  useFocusEffect(load);

  const reason = WHY.find((w) => w.key === why)?.reason ?? null;
  const params = {
    ...(reason ? { reason } : {}),
    ...(who ? { member: who.provisionalPatientId, memberName: who.label } : {}),
  };
  const go = (to: "/book/today" | "/book/day") =>
    why === "new" ? router.push("/symptoms") : router.push({ pathname: to, params });
  // Joining today's line is for the account holder only: the intake has no
  // "on behalf of" (pt-declare-intake), unlike asking for a day.
  const todayOff = who !== null && why !== "new";

  const whoChip = (
    label: string,
    initials: string,
    on: boolean,
    onPress: () => void,
    place = false,
  ) => (
    <Press
      key={label}
      onPress={onPress}
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      style={{
        minHeight: 48,
        paddingLeft: 6,
        paddingRight: tSpace[3.5],
        borderRadius: tRadius.pill,
        flexDirection: "row",
        alignItems: "center",
        gap: tSpace[2],
        backgroundColor: on ? t.primary : t.surface,
        borderWidth: on ? 0 : 1,
        borderColor: t.lineStrong,
      }}
    >
      <Avatar
        initials={initials}
        size={36}
        bg={place ? t.place.tint : t.info.tint}
        fg={place ? t.place.text : t.info.text}
      />
      <Text style={[tType.labelS, { color: on ? t.onPrimary : t.ink }]}>{label}</Text>
    </Press>
  );

  return (
    <Screen
      back={{ label: "Back" }}
      overline="Visits"
      overlineColor={t.area.visits}
      title="Book a visit"
      helpSource="book"
    >
      {glance?.hasHospital === false ? <HospitalPicker onChosen={load} /> : null}
      <View style={{ gap: tSpace[2] }}>
        <StepTitle n={1}>Who is this visit for?</StepTitle>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[2] }}>
          {whoChip("Me", initialsOf(me), who === null, () => setWho(null))}
          {household.map((m) =>
            whoChip(m.label, initialsOf(m.label), who?.id === m.id, () => setWho(m), true),
          )}
          <Press
            onPress={() => router.push("/household")}
            accessibilityLabel="Add someone"
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.lineStrong,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="plus" size={20} color={t.ink} />
          </Press>
        </View>
      </View>

      <View style={{ gap: tSpace[2] }}>
        <StepTitle n={2}>What is it about?</StepTitle>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[2] }}>
          {WHY.map((w, i) => {
            const on = w.key === why;
            const tone = i === 0 ? t.area.readings : i === 1 ? t.area.team : t.area.medicines;
            return (
              <Press
                key={w.key}
                onPress={() => setWhy(w.key)}
                accessibilityState={{ selected: on }}
                accessibilityLabel={w.label}
                style={{
                  width: "48.5%",
                  minHeight: 82,
                  padding: tSpace[3],
                  borderRadius: tRadius.card,
                  gap: tSpace[1.5],
                  ...pickStyle(t, on),
                }}
              >
                <IconDisc name={w.icon} size={30} color={tone} bg={t.surface2} />
                <Text style={[tType.labelS, { color: t.ink }]}>{w.label}</Text>
              </Press>
            );
          })}
        </View>
        {why === "new" ? (
          <Note tone="info">
            Next we will ask a few questions about what is wrong, so the right clinic sees you.
          </Note>
        ) : null}
      </View>

      <View style={{ gap: tSpace[2] }}>
        <StepTitle n={3}>How do you want to come?</StepTitle>
        <Press
          onPress={() => go("/book/today")}
          disabled={todayOff}
          accessibilityLabel="Come to the hospital today"
          style={{
            borderRadius: tRadius.panel,
            padding: tSpace[4],
            backgroundColor: t.band,
            gap: tSpace[2.5],
            opacity: todayOff ? 0.5 : 1,
          }}
        >
          <View
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: tSpace[1.5],
                minHeight: 26,
                paddingHorizontal: tSpace[2.5],
                borderRadius: tRadius.pill,
                backgroundColor: t.bandGlass,
              }}
            >
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.accent }} />
              <Text style={[tType.caption, { color: t.onBandAccent }]}>
                {glance?.openNow === true
                  ? "Open now"
                  : glance?.openNow === false
                    ? "No clinic takes walk-ins now"
                    : "Today"}
              </Text>
            </View>
            <Icon name="arrowRight" size={22} color={t.onBand} />
          </View>
          <Text
            style={{
              fontFamily: tFont.semibold,
              fontSize: 22,
              lineHeight: 27,
              letterSpacing: -0.44,
              color: t.onBand,
            }}
          >
            Come to the hospital today
          </Text>
          <Text style={[tType.bodyM, { fontSize: 14, color: t.onBand2 }]}>
            {todayOff
              ? "Coming today is for your own visit for now. Ask for a day for someone else."
              : HONEST}
          </Text>
        </Press>

        <Press
          onPress={() => go("/book/day")}
          accessibilityLabel="Ask for a day"
          style={{
            borderRadius: tRadius.panel,
            padding: tSpace[4],
            backgroundColor: t.surface,
            gap: tSpace[2],
            boxShadow: t.shadow.card,
          }}
        >
          <View
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: tSpace[1.5],
                minHeight: 26,
                paddingHorizontal: tSpace[2.5],
                borderRadius: tRadius.pill,
                backgroundColor: t.place.tint,
              }}
            >
              <View
                style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.area.visits }}
              />
              <Text style={[tType.caption, { color: t.place.text }]}>
                {glance?.nextDayKey
                  ? `Next open day: ${shortDayOf(glance.nextDayKey)}`
                  : "Pick an open day"}
              </Text>
            </View>
            <Icon name="arrowRight" size={22} color={t.ink3} />
          </View>
          <Text style={[tType.section, { fontSize: 19, lineHeight: 24, color: t.ink }]}>
            Ask for a day
          </Text>
          <Text style={[tType.bodyM, { fontSize: 14, color: t.ink2 }]}>
            Pick an open clinic day. The clinic confirms it.
          </Text>
        </Press>
      </View>

      <Text
        style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3, textAlign: "center" }]}
      >
        Very unwell right now? Do not book. Press the red Help button.
      </Text>
    </Screen>
  );
}

function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  return (
    words
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "ME"
  );
}
