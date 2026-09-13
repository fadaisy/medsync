import type { AppointmentRow } from "@/lib/booking";
import type { WaitlistEntry } from "@/lib/notifications";
import type { Palette } from "@/theme/tokens";
import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { DEFAULT_TIME_ZONE } from "@shared/slots";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { WaitlistCard } from "@/components/patient/waitlist-card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Empty } from "@/components/ui/empty";
import { Pill } from "@/components/ui/pill";
import { Screen } from "@/components/ui/screen";
import { Section } from "@/components/ui/section";
import { useTabBarClearance } from "@/components/ui/tab-bar";
import { fetchAppointments, fetchHousehold, formatWhen } from "@/lib/booking";
import { fetchWaitlist } from "@/lib/notifications";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * Your visits — every appointment this patient holds.
 *
 * Two chips split the list: what is still to come, and what has been. The
 * past is grouped by month so a date without a year ("Fri 18 Sep") can never
 * be read against the wrong one. Every row is the same card — the clinician's
 * monogram, the clinic, the day and time, the status word — because the word
 * on the chip is what says whether there is anything left to do.
 *
 * The time is a clock time in the hospital's zone, and it never appears
 * without its day: `formatWhen` is "Mon 16 Nov · 9:30 AM" (ADR 0085 §3, which
 * supersedes 0084 §10 here and keeps the day beside the hour as its one
 * mitigation).
 *
 * Rows re-fetch on focus rather than on mount alone: the detail screen moves
 * and cancels visits, and the list a patient comes back to must already say so.
 */

/** "September 2026" in the clinic's zone — the past list's month heads. */
const MONTH_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEFAULT_TIME_ZONE,
  month: "long",
  year: "numeric",
});

/**
 * Consecutive grouping, not a map: `past` arrives newest-first, so a single
 * pass keeps that order without a second sort.
 */
function byMonth(past: AppointmentRow[]): { month: string; rows: AppointmentRow[] }[] {
  const groups: { month: string; rows: AppointmentRow[] }[] = [];
  for (const row of past) {
    const month = MONTH_FMT.format(new Date(row.startsAtIso));
    const last = groups[groups.length - 1];
    if (last?.month === month) last.rows.push(row);
    else groups.push({ month, rows: [row] });
  }
  return groups;
}

export default function VisitsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // The list owns its own scrolling, so it owns the bar's footprint too.
  const clearance = useTabBarClearance();
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);

  // `null` = not loaded yet. Stale rows stay on screen through a refresh so a
  // focus re-fetch never blanks the list under a patient reading it.
  const [rows, setRows] = useState<{ upcoming: AppointmentRow[]; past: AppointmentRow[] } | null>(
    null,
  );
  // Gate E: the line the patient is in. Fails to empty — a card is a convenience here.
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<"upcoming" | "past">("upcoming");

  const load = useCallback(async () => {
    try {
      // One instant for both halves: two `new Date()`s leave a sliver in which
      // a visit belongs to neither list.
      const now = new Date();
      const [upcoming, past, entries] = await Promise.all([
        fetchAppointments("upcoming", 30, now),
        fetchAppointments("past", 30, now),
        fetchHousehold()
          .then((h) => fetchWaitlist(new Map(h.map((m) => [m.provisionalPatientId, m.label]))))
          .catch(() => [] as WaitlistEntry[]),
      ]);
      setRows({ upcoming, past });
      setWaitlist(entries);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your visits.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const open = useCallback(
    (row: AppointmentRow) => router.push({ pathname: "/visit/[id]", params: { id: row.id } }),
    [router],
  );

  let body;
  if (rows === null && error === null) {
    body = (
      <View style={styles.centre}>
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading your visits" />
      </View>
    );
  } else if (rows === null) {
    body = (
      <Empty
        icon="cloud-offline-outline"
        title="Couldn't load your visits."
        hint="Check your connection and try again."
        action={<Button label="Try again" variant="secondary" onPress={() => void load()} />}
      />
    );
  } else {
    const empty = rows.upcoming.length === 0 && rows.past.length === 0 && waitlist.length === 0;
    const shown = view === "upcoming" ? rows.upcoming : rows.past;
    body = (
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + clearance + space[8] },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.card}
          />
        }
      >
        {empty ? (
          <Empty
            icon="calendar-outline"
            title="No visits booked yet."
            hint="When you ask the clinic for a day, it shows here."
            action={
              // ADR 0084 §2's door, label verbatim. Secondary here as there:
              // this list is not the entry screen, and the same-day door is
              // home's to make primary.
              <Button
                label="Ask for a day — the clinic confirms"
                variant="secondary"
                onPress={() => router.push("/book")}
              />
            }
          />
        ) : (
          <>
            <ChipRow>
              <Chip
                label="Upcoming"
                role="button"
                selected={view === "upcoming"}
                onPress={() => setView("upcoming")}
              />
              <Chip
                label="Past"
                role="button"
                selected={view === "past"}
                onPress={() => setView("past")}
              />
            </ChipRow>

            {/* Gate E: an open offer is the most time-bound thing on the page. */}
            {view === "upcoming" && waitlist.length > 0 ? (
              <View style={styles.rows}>
                {waitlist.map((entry) => (
                  <WaitlistCard
                    key={entry.id}
                    entry={entry}
                    onChanged={({ bookedAppointmentId }) => {
                      void load();
                      if (bookedAppointmentId) {
                        router.push({
                          pathname: "/visit/[id]",
                          params: { id: bookedAppointmentId },
                        });
                      }
                    }}
                  />
                ))}
              </View>
            ) : null}

            {shown.length === 0 ? (
              <Text style={styles.none}>
                {view === "past" ? "Nothing here yet." : "No upcoming visits."}
              </Text>
            ) : view === "upcoming" ? (
              <View style={styles.rows}>
                {shown.map((row) => (
                  <VisitRow key={row.id} row={row} onPress={open} />
                ))}
              </View>
            ) : (
              byMonth(shown).map((group) => (
                <Section key={group.month} title={group.month}>
                  <View style={styles.rows}>
                    {group.rows.map((row) => (
                      <VisitRow key={row.id} row={row} onPress={open} />
                    ))}
                  </View>
                </Section>
              ))
            )}
          </>
        )}
      </ScrollView>
    );
  }

  return (
    <Screen title="Your visits" scroll={false}>
      {body}
    </Screen>
  );
}

/**
 * One visit. The same card whatever its status — the word on the pill is what
 * says whether there is anything left to do about it. A past visit still
 * opens: it has a reason note worth reading.
 */
function VisitRow({
  row,
  onPress,
}: {
  row: AppointmentRow;
  onPress: (row: AppointmentRow) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens this visit"
      onPress={() => onPress(row)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar name={row.clinicianName} uri={row.clinicianPhotoUrl} size={56} />
      <View style={styles.text}>
        {/* Gate D: a household member's visit, by the name the agent gave them. */}
        {row.forMember ? (
          <Text style={styles.forMember} numberOfLines={1}>
            For {row.forMember}
          </Text>
        ) : null}
        <Text style={styles.who} numberOfLines={1}>
          {row.clinicianName}
        </Text>
        <Text style={styles.where} numberOfLines={1}>
          {row.departmentName}
        </Text>
        <Text style={styles.when}>{formatWhen(row.startsAtIso)}</Text>
        {/* The code the desk searches by, and the place held in a clinic day
            (Gate C) — monospaced, the two things read aloud (PRD §6.3). */}
        {row.bookingCode ? (
          <Text style={styles.code}>
            Code {row.bookingCode}
            {row.positionNumber !== null ? ` · Position ${row.positionNumber}` : ""}
          </Text>
        ) : null}
        <View style={styles.pill}>
          <Pill status={row.status} />
        </View>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={colors.mutedForeground}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    fill: { flex: 1 },
    centre: { flex: 1, alignItems: "center", justifyContent: "center" },
    list: { flexGrow: 1, gap: space[5] },
    rows: { gap: space[3] },
    none: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: c.mutedForeground },

    // A raised surface with an edge: a white card on a white page has no other
    // outline, and the edge stays in the dark so both themes draw one shape.
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: space[3],
      padding: space[3],
      borderRadius: radius["2xl"],
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    // Opacity, never scale — the kit's rule for every pressed thing.
    pressed: { opacity: 0.88 },

    text: { flex: 1, gap: 2 },
    forMember: {
      fontFamily: font.body,
      fontSize: 12.5,
      letterSpacing: 0.3,
      color: c.mutedForeground,
    },
    who: { fontFamily: font.bodyMedium, fontSize: 16, lineHeight: 22, color: c.foreground },
    where: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },
    when: { fontFamily: font.body, fontSize: 14, lineHeight: 19, color: c.foreground },
    code: { fontFamily: font.mono, fontSize: 13.5, lineHeight: 19, color: c.foreground },
    pill: { marginTop: space[1] },
  });
