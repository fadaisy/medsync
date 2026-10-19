import type { BookGlance } from "@/data/visits";
import type { AppointmentReason, HouseholdMember } from "@/lib/booking";
import { useCallback, useState } from "react";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { t as sayCatalog, visibleCategories } from "@shared/symptom-catalog/classify";
import { useFocusEffect, useRouter } from "expo-router";
import { Text, View } from "react-native";

import { Avatar, Button, Card, Icon, IconDisc, Press, Screen } from "@/components/tide";
import { loadBookGlance } from "@/data/visits";
import { PLANNED_GROUPS } from "@/features/visits/book-reasons";
import { HospitalPicker } from "@/features/visits/hospital-picker";
import { shortDayOf } from "@/features/visits/logic";
import { HONEST, StepTitle } from "@/features/visits/parts";
import { fetchHousehold } from "@/lib/booking";
import { useSession } from "@/lib/session";
import { useCatalogMode } from "@/lib/symptoms";
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
type Door = "wrong" | "planned";

export default function BookScreen() {
  const t = useTide();
  const router = useRouter();
  const { session } = useSession();
  const fullName = session?.user.user_metadata?.full_name;
  const me = typeof fullName === "string" && fullName.trim() ? fullName : "Me";

  const [who, setWho] = useState<HouseholdMember | null>(null);
  const [door, setDoor] = useState<Door>("planned");
  const [reason, setReason] = useState<AppointmentReason>("follow_up");
  const catalog = useCatalogMode();
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
  const areas = visibleCategories(CATALOG, "adult");

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

      <View style={{ gap: tSpace[2.5] }}>
        <StepTitle n={2}>Why are you coming?</StepTitle>
        <View style={{ flexDirection: "row", gap: tSpace[2.5] }}>
          {(
            [
              [
                "wrong",
                "Something is wrong",
                "I feel unwell, or something is new or worse",
                "activity",
              ],
              [
                "planned",
                "Planned care",
                "A check, a refill, results, pregnancy, a child",
                "calendar",
              ],
            ] as const
          ).map(([key, label, sub, icon]) => {
            const on = door === key;
            return (
              <Press
                key={key}
                onPress={() => setDoor(key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${label}. ${sub}`}
                style={{
                  flex: 1,
                  minHeight: 164,
                  padding: tSpace[3.5],
                  borderRadius: tRadius.panel,
                  justifyContent: "space-between",
                  gap: tSpace[3],
                  backgroundColor: on ? t.primary : t.surface,
                  borderWidth: 2,
                  borderColor: on ? t.primary : t.line,
                  boxShadow: on ? t.shadow.float : undefined,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <IconDisc
                    name={icon}
                    size={44}
                    color={on ? t.onBandAccent : t.ink}
                    bg={on ? t.bandGlass : t.surface3}
                  />
                  {on ? (
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: t.onBandAccent,
                      }}
                    >
                      <Icon name="check" size={13} color={t.primary} strokeWidth={3} />
                    </View>
                  ) : null}
                </View>
                <View style={{ gap: 4 }}>
                  <Text
                    style={[
                      tType.label,
                      { fontSize: 17, lineHeight: 21, color: on ? t.onPrimary : t.ink },
                    ]}
                  >
                    {label}
                  </Text>
                  <Text
                    style={[
                      tType.caption,
                      { fontFamily: tFont.medium, color: on ? t.onBand2 : t.ink2 },
                    ]}
                  >
                    {sub}
                  </Text>
                </View>
              </Press>
            );
          })}
        </View>

        {door === "wrong" ? (
          <Card padding={tSpace[4]} style={{ gap: tSpace[3] }}>
            <View style={{ gap: 2 }}>
              <Text style={[tType.label, { fontSize: 16, color: t.ink }]}>
                Where do you feel it?
              </Text>
              <Text style={[tType.bodyS, { color: t.ink2 }]}>
                Pick an area. We ask a few questions, then suggest the right door.
              </Text>
            </View>
            {catalog && catalog !== "off" ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[2] }}>
                {areas.map((c) => (
                  <Press
                    key={c.key}
                    onPress={() => router.push({ pathname: "/symptoms", params: { area: c.key } })}
                    accessibilityLabel={sayCatalog(CATALOG, c.labelKey)}
                    style={{
                      flexBasis: "48%",
                      flexGrow: 1,
                      minHeight: 48,
                      paddingHorizontal: tSpace[3],
                      paddingVertical: tSpace[2],
                      borderRadius: tRadius.field,
                      justifyContent: "center",
                      backgroundColor: t.surface2,
                    }}
                  >
                    <Text style={[tType.labelS, { color: t.ink }]}>
                      {sayCatalog(CATALOG, c.labelKey)}
                    </Text>
                  </Press>
                ))}
              </View>
            ) : null}
            <Button
              label={catalog && catalog !== "off" ? "Something else" : "Tell us what is wrong"}
              variant="soft"
              onPress={() => router.push("/symptoms")}
            />
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
              <Text style={[tType.bodyS, { flex: 1, color: t.ink }]}>
                Very unwell right now? Do not book.
              </Text>
              <Button
                label="Help"
                icon="phone"
                variant="danger"
                size="sm"
                onPress={() => router.push("/help")}
              />
            </View>
          </Card>
        ) : (
          PLANNED_GROUPS.map((g) => (
            <View key={g.title} style={{ gap: tSpace[1.5] }}>
              <Text
                style={[
                  tType.micro,
                  { fontFamily: tFont.bold, letterSpacing: 0.8, color: t.ink3, paddingLeft: 4 },
                ]}
              >
                {g.title.toUpperCase()}
              </Text>
              <Card padding={0} radius={tRadius.card} style={{ gap: 0, overflow: "hidden" }}>
                {g.reasons.map((r, i) => {
                  const on = reason === r.reason;
                  return (
                    <Press
                      key={r.reason}
                      haptic={false}
                      onPress={() => setReason(r.reason)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={r.label}
                      style={{
                        minHeight: 60,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: tSpace[3],
                        paddingHorizontal: tSpace[3.5],
                        paddingVertical: tSpace[2.5],
                        backgroundColor: on ? t.accentTint : t.surface,
                        borderTopWidth: i ? 1 : 0,
                        borderTopColor: t.line,
                      }}
                    >
                      <IconDisc
                        name={r.icon}
                        size={36}
                        color={on ? t.onBandAccent : t.ink}
                        bg={on ? t.primary : t.surface3}
                      />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[tType.labelS, { fontSize: 15, color: t.ink }]}>
                          {r.label}
                        </Text>
                        {on ? (
                          <Text
                            style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}
                          >
                            {r.hint}
                          </Text>
                        ) : null}
                      </View>
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          borderWidth: on ? 7 : 2,
                          borderColor: on ? t.primary : t.lineStrong,
                          backgroundColor: t.surface,
                        }}
                      />
                    </Press>
                  );
                })}
              </Card>
            </View>
          ))
        )}
      </View>

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
