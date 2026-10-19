import type { BookGlance } from "@/data/visits";
import type { Door } from "@/features/visits/why-coming";
import type { AppointmentReason, HouseholdMember } from "@/lib/booking";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Text, View } from "react-native";

import { Avatar, Icon, Press, Screen } from "@/components/tide";
import { loadBookGlance } from "@/data/visits";
import { HospitalPicker } from "@/features/visits/hospital-picker";
import { shortDayOf } from "@/features/visits/logic";
import { HONEST, StepTitle } from "@/features/visits/parts";
import { WhyComing } from "@/features/visits/why-coming";
import { fetchHousehold } from "@/lib/booking";
import { useSession } from "@/lib/session";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * Book a visit (board TBook, PRD F-09; "two doors", owner 19 Oct 2026): who,
 * why, how.
 *
 * Who: me, or someone this account books for (`fetchHousehold`, real); the
 * plus opens the household screen to add one. Why: two doors.
 * "Something is wrong" shows the symptom checker's own body areas and opens
 * it on the one tapped, so a new problem is described before any booking
 * and the checker suggests the door (or Help). "Planned care" lists every
 * other Appendix A reason in plain words, grouped, none built around one
 * condition (`PLANNED_GROUPS`). How: come today (joins the line) or ask for a
 * day, with the real glance on each door. No count of people in line
 * (ADR 0084 §5). Without a hospital the patient chooses one first, here.
 */

export default function BookScreen() {
  const t = useTide();
  const router = useRouter();
  const { session } = useSession();
  const fullName = session?.user.user_metadata?.full_name;
  const me = typeof fullName === "string" && fullName.trim() ? fullName : "Me";

  const [who, setWho] = useState<HouseholdMember | null>(null);
  const [door, setDoor] = useState<Door>("planned");
  const [reason, setReason] = useState<AppointmentReason>("follow_up");
  const [household, setHousehold] = useState<HouseholdMember[]>([]);
  const [glance, setGlance] = useState<BookGlance | null>(null);

  // On focus (a person added on the household screen shows when they come
  // back), and again once a hospital is chosen below.
  const load = useCallback(() => {
    fetchHousehold().then(setHousehold, () => setHousehold([]));
    loadBookGlance().then(setGlance, () => setGlance(null));
  }, []);
  useFocusEffect(load);

  const params = {
    reason,
    ...(who ? { member: who.provisionalPatientId, memberName: who.label } : {}),
  };
  const go = (to: "/book/today" | "/book/day") => router.push({ pathname: to, params });
  // Joining today's line is for the account holder only: the intake has no
  // "on behalf of" (pt-declare-intake), unlike asking for a day.
  const todayOff = who !== null;
  const helpInPage = door === "wrong";

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
      // The "Something is wrong" card draws its own red Help, so the header one steps aside (law L6 still holds).
      help={helpInPage ? "none" : "round"}
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

      <WhyComing
        n={2}
        door={door}
        onDoor={setDoor}
        reason={reason}
        onReason={setReason}
        onSymptoms={(area) =>
          router.push(area ? { pathname: "/symptoms", params: { area } } : "/symptoms")
        }
      />

      {door === "planned" ? (
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
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
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
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
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
      ) : null}

      {helpInPage ? null : (
        <Text
          style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3, textAlign: "center" }]}
        >
          Very unwell right now? Do not book. Press the red Help button.
        </Text>
      )}
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
