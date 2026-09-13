import type {
  AppointmentRow,
  ClinicianOption,
  ClinicSession,
  LiveIntake,
  PatientProfile,
  ServiceLine,
} from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { DEFAULT_TIME_ZONE, localWeekdayAndMinutes } from "@shared/slots";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { DoctorRow } from "@/components/patient/doctor-row";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Empty } from "@/components/ui/empty";
import { HeroAction, HeroCard } from "@/components/ui/hero-card";
import { Screen } from "@/components/ui/screen";
import { Section } from "@/components/ui/section";
import {
  canArrive,
  dateKey,
  dayLabel,
  fetchAppointments,
  fetchBookableClinicians,
  fetchLiveIntake,
  fetchMyAvatarUrl,
  fetchPatientProfile,
  fetchServiceLines,
  fetchSessions,
  formatTime,
  markArrived,
  RESCHEDULABLE,
  STAGE_WORD,
  STATUS_LABEL,
} from "@/lib/booking";
import { useSession } from "@/lib/session";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space, withAlpha } from "@/theme/tokens";

/** Choosing a hospital still lives on the web, like signup does. */
const HOSPITALS_URL = "https://medsync-six.vercel.app/patient/hospitals";

/**
 * What the patient is told they already have today. Lifted verbatim from
 * `app/patient/queue/page.tsx` (`INTAKE_TITLE`) so the phone and the web
 * describe the same intake in the same words. No jargon, no mechanism, no
 * count — the queue is department-scoped and there is no hospital-wide number
 * to show (ADR 0084 §6).
 */
const INTAKE_TITLE: Record<string, string> = {
  declared: "We have already saved you a place today.",
  arrived: "You are already at the hospital today.",
  awaiting_triage: "You are already at the hospital today.",
  triaged: "A nurse has already seen you today.",
};

/** How many doctors the home shows before "View all" — the list is the doctors screen. */
const DOCTORS_ON_HOME = 3;

/**
 * "Good morning" by the HOSPITAL's clock, never the phone's — the same rule
 * every other zone-sensitive value in `lib/booking` follows. Morning until
 * noon, afternoon until five, evening after.
 */
function greetingNow(): string {
  const { minutesOfDay } = localWeekdayAndMinutes(new Date(), DEFAULT_TIME_ZONE);
  if (minutesOfDay < 720) return "Good morning";
  if (minutesOfDay < 1020) return "Good afternoon";
  return "Good evening";
}

type Home =
  | { kind: "loading" }
  /** The profile read failed. Nothing below the emergency block is trustworthy. */
  | { kind: "error" }
  /** Signed in, but no `patient_profiles` row — a staff account in the patient app. */
  | { kind: "not-patient" }
  | {
      kind: "ready";
      profile: PatientProfile;
      visit: AppointmentRow | null;
      ticket: LiveIntake | null;
      /** Null when the read failed — the section is then absent, not an error. */
      doctors: ClinicianOption[] | null;
      /** Session-mode lines at this hospital (ADR 0087), with their open days; null = read failed. */
      clinics: { line: ServiceLine; next: ClinicSession | null }[] | null;
    };

/**
 * The workspace home — ADR 0084 §1–§2 with ADR 0085 §4 on top: the greeting,
 * the question, what is in motion, the two doors, and the doctors.
 *
 * The emergency block no longer lives here; it is the red tab (ADR 0085 §5).
 * The greeting needs no data, so it never moves; everything under it waits
 * for the profile — which is why the hospital name heads the question rather
 * than the screen.
 *
 * Both doors are always shown when there is a hospital; a live ticket does not
 * hide the same-day door. The screen behind it owns the "you already have a
 * place" case, and the server's refusal reaches the patient verbatim if the
 * two ever disagree.
 *
 * "How are you feeling today?" is a heading, not an input: nothing reads it,
 * and the patient is never asked to rate their own urgency (ADR 0085 §4).
 */
export default function HomeScreen() {
  const router = useRouter();
  const { session, signOut } = useSession();
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const [home, setHome] = useState<Home>({ kind: "loading" });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  // Gate D: "I have arrived" from the hero, on the day itself.
  const [arriving, setArriving] = useState(false);
  const [arriveError, setArriveError] = useState<string | null>(null);

  // The account holder, the way the ticket names them: `full_name` is what
  // signup wrote to auth metadata — the same value `users.full_name` mirrors.
  const fullName = session?.user.user_metadata?.full_name;
  const firstName = typeof fullName === "string" ? fullName.split(" ")[0] : undefined;
  const greeting = greetingNow();

  const load = useCallback(async () => {
    // A refresh keeps what is on screen and fails quietly; only the first load
    // shows the spinner or the error. Otherwise every return from a door
    // blanks the doors, and a dropped packet on the way back replaces a good
    // screen with "try again".
    setHome((h) => (h.kind === "ready" ? h : { kind: "loading" }));
    // Never throws; null is the monogram, on day one and on a bad connection.
    void fetchMyAvatarUrl().then(setAvatarUrl);
    let profile: PatientProfile | null;
    try {
      profile = await fetchPatientProfile();
    } catch {
      setHome((h) => (h.kind === "ready" ? h : { kind: "error" }));
      return;
    }
    if (!profile) {
      setHome({ kind: "not-patient" });
      return;
    }
    if (!profile.hospitalId) {
      setHome({
        kind: "ready",
        profile,
        visit: null,
        ticket: null,
        doctors: null,
        clinics: null,
      });
      return;
    }
    // ponytail: the three glances fail to "absent", never to an error screen —
    // the same rule as the web home, which must survive a scheduling outage.
    // The screen then claims nothing about visits, places or doctors, which is
    // true; the doors still work and the server still refuses a duplicate with
    // its own sentence. Ceiling: a patient with a live ticket whose read failed
    // sees no ticket card. Upgrade path: a per-card "couldn't check" line.
    const [visit, ticket, doctors, lines, sessions] = await Promise.all([
      fetchAppointments("upcoming-active", 1).then(
        (rows) => rows[0] ?? null,
        () => null,
      ),
      fetchLiveIntake(profile.hospitalId).catch(() => null),
      fetchBookableClinicians(profile.hospitalId).catch(() => null),
      fetchServiceLines({ hospitalId: profile.hospitalId }).catch(() => null),
      fetchSessions({ hospitalId: profile.hospitalId }).catch(() => null),
    ]);
    // The next open day per clinic — sessions arrive soonest first, so the
    // first open one of a line is its next. A line with none says so.
    const clinics =
      lines && sessions
        ? lines
            .filter((l) => l.capacityMode === "session")
            .map((line) => ({
              line,
              next: sessions.find((s) => s.serviceLineId === line.id && s.placesLeft > 0) ?? null,
            }))
        : null;
    setHome({ kind: "ready", profile, visit, ticket, doctors, clinics });
  }, []);

  // On focus rather than on mount: a patient returning from the same-day door
  // has just been given a place, and the home must show it without a restart.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // The function's own gate is `canArrive`; its refusal sentence lands in
  // the well under the hero verbatim. Success re-reads the home so the hero
  // says "You've arrived" from the row, not from a guess.
  const onArrived = useCallback(
    async (appointmentId: string) => {
      if (arriving) return;
      setArriving(true);
      setArriveError(null);
      const res = await markArrived(appointmentId);
      setArriving(false);
      if (!res.ok) {
        setArriveError(res.error);
        return;
      }
      void load();
    },
    [arriving, load],
  );

  const onSignOut = useCallback(async () => {
    // Feedback, not a lock: `signOut` awaits the server before the gate moves,
    // which on a slow connection is seconds of a tap that seems to do nothing.
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }, [signOut]);

  let body: ReactNode;
  if (home.kind === "loading") {
    body = (
      <ActivityIndicator
        color={colors.primary}
        accessibilityLabel="Loading"
        style={styles.loading}
      />
    );
  } else if (home.kind === "error") {
    body = (
      <Empty
        icon="cloud-offline-outline"
        title="Couldn't load your hospital."
        hint="Check your connection and try again."
        action={<Button variant="secondary" label="Try again" onPress={load} />}
      />
    );
  } else if (home.kind === "not-patient") {
    // A patient reaches sign-out through Settings; a staff account has no
    // Settings control here, so the way out sits under the sentence that
    // tells them to take it. The gate does the redirect.
    body = (
      <Empty
        icon="person-outline"
        title="We couldn't find a patient account for this sign-in."
        hint="The MedSync app is for patients. Sign out and sign in with your patient account."
        action={
          <Button variant="secondary" label="Sign out" busy={signingOut} onPress={onSignOut} />
        }
      />
    );
  } else if (!home.profile.hospitalId) {
    // The doors need a hospital; the block above does not. Choosing one is a
    // web flow, so the exit says so rather than pretending.
    body = (
      <Empty
        icon="business-outline"
        title="Choose your hospital first."
        hint="Pick your hospital on the MedSync website, then come back here."
        action={
          <Button
            variant="secondary"
            label="Choose your hospital"
            accessibilityLabel="Choose your hospital, opens in your browser"
            onPress={() => {
              Linking.openURL(HOSPITALS_URL).catch(() => {});
            }}
          />
        }
      />
    );
  } else {
    const { profile, visit, ticket, doctors, clinics } = home;

    // The departments present, in the order the server sends (soonest open
    // day first); a chip that no longer exists after a refresh falls back to
    // "All" rather than filtering everything away.
    const departments = (doctors ?? []).filter(
      (o, i, all) => all.findIndex((x) => x.departmentId === o.departmentId) === i,
    );
    const filter = departments.some((d) => d.departmentId === department) ? department : null;
    const shown = (doctors ?? [])
      .filter((o) => filter === null || o.departmentId === filter)
      .slice(0, DOCTORS_ON_HOME);

    // One thing in motion, at most. A place saved today outranks a visit on
    // another day — same order the two glances always had.
    let hero: ReactNode = null;
    if (ticket) {
      const sentence = INTAKE_TITLE[ticket.status] ?? "You are already in today's line.";
      const stage = STAGE_WORD[ticket.status];
      hero = (
        <HeroCard
          eyebrow="Your place today"
          title={ticket.departmentName ?? sentence}
          subtitle={ticket.departmentName ? sentence : undefined}
          tiles={[
            { icon: "pricetag-outline", label: "Patient code", value: profile.patientCode },
            ...(stage
              ? [{ icon: "footsteps-outline" as const, label: "Stage", value: stage }]
              : []),
          ]}
          actions={
            <HeroAction
              variant="primary"
              label="Open your ticket"
              onPress={() => router.push("/(app)/ticket")}
            />
          }
        />
      );
    } else if (visit) {
      const word = STATUS_LABEL[visit.status];
      const arrivable = canArrive(visit);
      hero = (
        <HeroCard
          leading={
            <Avatar
              name={visit.clinicianName}
              uri={visit.clinicianPhotoUrl}
              size={56}
              tone="onPrimary"
            />
          }
          // A household member's visit says whose it is (Gate D).
          eyebrow={[
            visit.forMember ? `For ${visit.forMember}` : "Your next visit",
            word,
            visit.bookingCode ? `Code ${visit.bookingCode}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          title={visit.clinicianName || "Your clinician"}
          subtitle={`${visit.departmentName} · ${visit.hospitalName}`}
          // The day always beside the time, in the hospital's zone (ADR 0085 §3).
          tiles={[
            {
              icon: "calendar-outline",
              label: "Day",
              value: dayLabel(dateKey(new Date(visit.startsAtIso))),
            },
            // A clinic day is a position, not a time (ADR 0087).
            visit.positionNumber !== null
              ? { icon: "people-outline", label: "Position", value: String(visit.positionNumber) }
              : { icon: "time-outline", label: "Time", value: formatTime(visit.startsAtIso) },
          ]}
          // On the day itself, arriving is the white pill (Gate D); a
          // member's visit is logistics only, so no "Move it" for it.
          actions={
            <>
              {arrivable ? (
                <HeroAction
                  variant="primary"
                  label="I have arrived"
                  onPress={() => void onArrived(visit.id)}
                />
              ) : null}
              <HeroAction
                variant={arrivable ? "ghost" : "primary"}
                label="See this visit"
                onPress={() =>
                  router.push({ pathname: "/(app)/visit/[id]", params: { id: visit.id } })
                }
              />
              {!arrivable && visit.forMember === null && RESCHEDULABLE.has(visit.status) ? (
                <HeroAction
                  label="Move it"
                  onPress={() =>
                    router.push({
                      pathname: "/(app)/visit/[id]",
                      params: { id: visit.id, move: "1" },
                    })
                  }
                />
              ) : null}
            </>
          }
        />
      );
    }

    body = (
      <>
        {/* The hospital the doors lead to, over the one question the screen
            asks. Placed here rather than in the chrome so the greeting stays
            first and never shifts when the name arrives. */}
        <View style={styles.heading}>
          {profile.hospitalName ? <Text style={styles.eyebrow}>{profile.hospitalName}</Text> : null}
          <Text accessibilityRole="header" style={styles.question}>
            How are you feeling today?
          </Text>
        </View>

        {hero ? (
          <Section title="Coming up">
            {hero}
            {arriveError ? (
              <View style={styles.well}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.status.cautionFg} />
                <Text style={styles.wellText} accessibilityLiveRegion="polite">
                  {arriveError}
                </Text>
              </View>
            ) : null}
          </Section>
        ) : null}

        {/* ⚠ RATIFIED PATIENT-FACING COPY — ADR 0084 §1 and §2. ⚠
            The words are the decision. Do not paraphrase, do not add a number
            to either door. Primary is a LAYOUT fact: full width, the one
            filled surface on the screen, first in order. The booking door is
            demoted by having less of everything. The glyphs are distinct and
            subordinate; the label carries the meaning. */}
        <Section title="Get seen">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(app)/today")}
            style={({ pressed }) => [styles.door, styles.primaryDoor, pressed && styles.pressed]}
          >
            <View
              style={[styles.disc, styles.primaryDisc]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Ionicons name="walk-outline" size={22} color={colors.ctaForeground} />
            </View>
            <View style={styles.doorText}>
              <Text style={styles.primaryTitle}>Coming to the hospital today</Text>
              <Text style={styles.primaryBody}>
                We save your place in line. You will be seen in turn. We cannot tell you the hour.
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={colors.ctaForeground}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(app)/book")}
            style={({ pressed }) => [styles.door, styles.secondaryDoor, pressed && styles.pressed]}
          >
            <View
              style={[styles.disc, styles.secondaryDisc]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Ionicons name="calendar-outline" size={22} color={colors.accentForeground} />
            </View>
            <View style={styles.doorText}>
              <Text style={styles.secondaryTitle}>Ask for a day — the clinic confirms</Text>
              <Text style={styles.secondaryBody}>Choose from the days the clinic has open.</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={colors.mutedForeground}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          </Pressable>
        </Section>

        {/* ADR 0085 §4: the doctors, filtered by department, three at most —
            the full list is the booking door. Every photo and every rating
            here came from the server; a missing one is a monogram and
            "No ratings yet", never a stand-in. A failed read hides the
            section rather than apologising for it. */}
        {doctors && doctors.length > 0 ? (
          <Section
            title="Doctors"
            action={{ label: "View all", onPress: () => router.push("/(app)/book") }}
          >
            <ChipRow>
              <Chip
                role="button"
                label="All"
                selected={filter === null}
                onPress={() => setDepartment(null)}
              />
              {departments.map((d) => (
                <Chip
                  key={d.departmentId}
                  role="button"
                  label={d.departmentName}
                  selected={filter === d.departmentId}
                  onPress={() => setDepartment(d.departmentId)}
                />
              ))}
            </ChipRow>
            <View style={styles.rows}>
              {shown.map((o) => (
                <DoctorRow
                  key={`${o.userId}:${o.departmentId}`}
                  option={o}
                  onPress={() =>
                    router.push({
                      pathname: "/(app)/doctor/[id]",
                      params: { id: o.userId, department: o.departmentId, hospital: o.hospitalId },
                    })
                  }
                />
              ))}
            </View>
          </Section>
        ) : null}

        {/* ADR 0087: the clinics that book by the day — a place in a
            published clinic day rather than a clinician's time. The next
            open day and its places are the allocator's own numbers. */}
        {clinics && clinics.length > 0 ? (
          <Section title="Clinics">
            <View style={styles.rows}>
              {clinics.map(({ line, next }) => (
                <Pressable
                  key={line.id}
                  accessibilityRole="button"
                  accessibilityHint="Opens this clinic"
                  onPress={() =>
                    router.push({ pathname: "/(app)/clinic/[id]", params: { id: line.id } })
                  }
                  style={({ pressed }) => [styles.clinic, pressed && styles.pressed]}
                >
                  <View
                    style={[styles.disc, styles.secondaryDisc]}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    <Ionicons name="medkit-outline" size={22} color={colors.accentForeground} />
                  </View>
                  <View style={styles.doorText}>
                    <Text style={styles.secondaryTitle} numberOfLines={1}>
                      {line.name}
                    </Text>
                    <Text style={styles.secondaryBody} numberOfLines={1}>
                      {next
                        ? `Next clinic day ${dayLabel(dateKey(new Date(next.startsAtIso)))} · ${
                            next.placesLeft === 1
                              ? "1 place left"
                              : `${next.placesLeft} places left`
                          }`
                        : "No days open yet"}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.mutedForeground}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  />
                </Pressable>
              ))}
            </View>
          </Section>
        ) : null}
      </>
    );
  }

  return (
    <Screen>
      <View style={styles.column}>
        {/* The greeting needs no data, so it never moves; the photo fills in
            when it arrives, over the monogram. */}
        <View style={styles.greeting}>
          <Avatar
            name={typeof fullName === "string" ? fullName : undefined}
            size={44}
            uri={avatarUrl}
          />
          <View>
            <Text style={styles.greetingWord}>{greeting}</Text>
            {firstName ? <Text style={styles.name}>{firstName}</Text> : null}
          </View>
        </View>

        {body}
      </View>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    column: { flexGrow: 1, gap: space[5] },
    loading: { marginTop: space[8] },
    rows: { gap: space[3] },

    greeting: { flexDirection: "row", alignItems: "center", gap: space[3] },
    greetingWord: {
      fontFamily: font.body,
      fontSize: 13.5,
      lineHeight: 19,
      color: c.mutedForeground,
    },
    name: { fontFamily: font.bodyMedium, fontSize: 16, lineHeight: 22, color: c.foreground },

    heading: { gap: space[1] },
    eyebrow: {
      fontFamily: font.body,
      fontSize: 12.5,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: c.mutedForeground,
    },
    question: {
      fontFamily: font.display,
      fontSize: 28,
      lineHeight: 34,
      letterSpacing: -0.6,
      color: c.foreground,
    },

    door: {
      flexDirection: "row",
      alignItems: "center",
      gap: space[3],
      borderRadius: radius["2xl"],
    },
    doorText: { flex: 1, gap: space[1] },
    disc: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
    },

    // The signature pair — the mint fill and its dark ink — spent on the one
    // primary act of the screen, as a full-width surface rather than a pill.
    primaryDoor: { padding: space[5], backgroundColor: c.cta },
    primaryDisc: { backgroundColor: withAlpha(c.ctaForeground, 0.12) },
    primaryTitle: {
      fontFamily: font.display,
      fontSize: 21,
      lineHeight: 27,
      letterSpacing: -0.3,
      color: c.ctaForeground,
    },
    primaryBody: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: c.ctaMuted },

    // A plain card with a hairline: the demotion is having less — no fill, a
    // smaller title, the page's own ink.
    secondaryDoor: {
      padding: space[4],
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    secondaryDisc: { backgroundColor: c.accent },
    // The same card as the secondary door: a clinic is a booking door too.
    clinic: {
      flexDirection: "row",
      alignItems: "center",
      gap: space[3],
      padding: space[4],
      borderRadius: radius["2xl"],
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    secondaryTitle: {
      fontFamily: font.bodyMedium,
      fontSize: 16,
      lineHeight: 22,
      color: c.foreground,
    },
    secondaryBody: {
      fontFamily: font.body,
      fontSize: 14,
      lineHeight: 20,
      color: c.mutedForeground,
    },

    // Opacity, never scale — same rule as the buttons.
    pressed: { opacity: 0.88 },

    // Amber, not red: a refused arrival is not a clinical emergency.
    well: {
      flexDirection: "row",
      gap: space[2],
      alignItems: "flex-start",
      padding: space[3],
      borderRadius: radius.lg,
      backgroundColor: c.status.cautionBg,
      borderWidth: 1,
      borderColor: c.status.cautionFg,
    },
    wellText: {
      flex: 1,
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.foreground,
    },
  });
