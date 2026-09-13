import type { AppointmentReason, ClinicianOption, PatientProfile, SlotOffer } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import { useCallback, useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { DayStrip } from "@/components/patient/day-strip";
import { EmergencyButton } from "@/components/patient/emergency-button";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Empty } from "@/components/ui/empty";
import { Rating } from "@/components/ui/rating";
import { Screen } from "@/components/ui/screen";
import { Section } from "@/components/ui/section";
import {
  APPOINTMENT_REASONS,
  fetchBookableClinicians,
  fetchPatientProfile,
  formatTime,
  formatWhen,
  requestAppointment,
} from "@/lib/booking";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/** Where a patient with no hospital yet picks one, until the app owns that screen. */

/** The days this clinician has anything open, earliest first. */
const openDays = (c: ClinicianOption) => Object.keys(c.slotsByDate).sort();

/** The (clinician, department) pair the list row named, from a fresh read. */
function pick(list: ClinicianOption[], id: string, department?: string): ClinicianOption | null {
  return (
    list.find((c) => c.userId === id && (!department || c.departmentId === department)) ?? null
  );
}

/**
 * One doctor — the reference's second screen (ADR 0085 §4): photo, rating,
 * name, department; select a day, select a time, say why, and the docked
 * "Book an appointment". One POST at the end, the same
 * `pt-request-appointment` call as ever, carrying the chosen slot's instants.
 *
 * Everything shown is what the server offered: the days are the keys of
 * `slotsByDate`, the times are its entries, the count is the length of the
 * list beside it (§3), and the rating is `clinician_rating_summary` or "No
 * ratings yet" (§2). Nothing here derives, filters or rounds. A time is never
 * shown without its day — the strip above it, `formatWhen` after.
 */
export default function DoctorScreen() {
  const router = useRouter();
  // `hospital` is the DOCTOR's hospital, carried by the row that was tapped —
  // not the patient's, which need not be the same (ADR 0086).
  const { id, department, hospital } = useLocalSearchParams<{
    id: string;
    department?: string;
    hospital?: string;
  }>();
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);

  // `undefined` = still loading. `null` = no patient profile for this session.
  const [profile, setProfile] = useState<PatientProfile | null | undefined>();
  // `null` = this doctor has no day open any more (or never did).
  const [doctor, setDoctor] = useState<ClinicianOption | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<SlotOffer | null>(null);
  const [reason, setReason] = useState<AppointmentReason | null>(null);
  const [note, setNote] = useState("");
  const [noteFocused, setNoteFocused] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    /** What the database wrote — `confirmed` or `pending_approval` — or null if the reply carried none. */
    status: string | null;
    startsAtIso: string;
  } | null>(null);

  const load = useCallback(() => {
    fetchPatientProfile()
      .then(async (p) => {
        // A patient with no hospital of their own can still book at any of
        // them; only a non-patient has nothing to do here.
        if (!p) {
          setProfile(null);
          return;
        }
        const found = pick(
          await fetchBookableClinicians(hospital ?? p.hospitalId ?? undefined),
          id,
          department,
        );
        setDoctor(found);
        setDayKey(found ? (openDays(found)[0] ?? null) : null);
        setProfile(p);
      })
      .catch(() => setLoadFailed(true));
  }, [id, department, hospital]);

  useEffect(load, [load]);

  // The DOCTOR's hospital: the row names where the booking lands.
  const hospitalName = doctor?.hospitalName ?? profile?.hospitalName ?? "your hospital";
  const days = doctor ? openDays(doctor) : [];
  const slots = doctor && dayKey ? (doctor.slotsByDate[dayKey] ?? []) : [];

  const pickDay = (key: string) => {
    setDayKey(key);
    setSlot(null);
  };

  const onSubmit = async () => {
    if (!profile || !doctor || !reason || !dayKey || !slot || busy) return;
    setBusy(true);
    setError(null);
    const res = await requestAppointment({
      clinicianUserId: doctor.userId,
      hospitalId: doctor.hospitalId,
      departmentId: doctor.departmentId,
      reason,
      reasonNote: note.trim() || null,
      startsAtIso: slot.startsAtIso,
      endsAtIso: slot.endsAtIso,
    });
    if (res.ok) {
      // `data` is undefined on a 2xx with no body (see `callEdge`): the write
      // landed, and the confirmation under-promises rather than guess.
      setDone({ status: res.data?.status ?? null, startsAtIso: slot.startsAtIso });
      return;
    }
    // The server's sentence, verbatim — "Someone just took this slot — pick
    // another and try again." is something a patient can act on.
    setError(res.error);
    setBusy(false);
    // Then make "pick another" possible: re-read this doctor's open slots, and
    // keep the pick only if it is still offered — otherwise the next tap would
    // ask for the same refused instant again.
    try {
      const fresh = pick(await fetchBookableClinicians(doctor.hospitalId), id, department);
      setDoctor(fresh);
      const freshDays = fresh ? openDays(fresh) : [];
      const day = freshDays.includes(dayKey) ? dayKey : (freshDays[0] ?? null);
      setDayKey(day);
      const still = fresh && day ? fresh.slotsByDate[day] : undefined;
      setSlot(still?.find((s) => s.startsAtIso === slot.startsAtIso) ?? null);
    } catch {
      // Keep what is on screen; the sentence above already says to try again.
    }
  };

  const chrome = { onBack: router.back, trailing: <EmergencyButton /> };

  if (loadFailed) {
    return (
      <Screen {...chrome}>
        <Empty
          icon="cloud-offline-outline"
          title="Couldn't load the days the clinic has open."
          hint="Check your connection and try again."
          action={
            <Button
              variant="secondary"
              label="Try again"
              onPress={() => {
                setLoadFailed(false);
                load();
              }}
            />
          }
        />
      </Screen>
    );
  }

  if (profile === undefined) {
    return (
      <Screen {...chrome}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Loading" />
        </View>
      </Screen>
    );
  }

  if (profile === null) {
    return (
      <Screen {...chrome}>
        <Empty
          icon="person-circle-outline"
          title="This is the patient app."
          hint="Sign in with your patient account to book a doctor."
        />
      </Screen>
    );
  }

  if (done) {
    const confirmed = done.status === "confirmed";
    // No back control: the request is filed, and a step back would offer the
    // same instant a second time.
    return (
      <Screen footer={<Button label="Done" onPress={() => router.dismissTo("/(app)/(tabs)")} />}>
        <View style={styles.doneRoot}>
          {/* Decorative: the heading under it says what happened. */}
          <View
            style={styles.doneDisc}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name="checkmark" size={32} color={colors.accentForeground} />
          </View>
          <Text accessibilityRole="header" style={styles.doneTitle}>
            {confirmed ? "This time is yours" : "We asked the clinic for this time"}
          </Text>
          {/* The day beside the time, on the screen most likely to be read
              aloud to somebody else — the same string the visits list prints. */}
          <Text style={styles.doneWhen}>{formatWhen(done.startsAtIso)}</Text>
          {doctor ? (
            <Text style={styles.doneMuted}>
              {doctor.fullName} · {doctor.departmentName} · {hospitalName}
            </Text>
          ) : null}
          {/* §11: no notification is promised — there is no transport that
              could carry one. What replaces it is where the answer will be. */}
          <Text style={styles.doneMuted}>You will find the answer under Visits.</Text>
        </View>
      </Screen>
    );
  }

  // The doctor the row named has nothing open now — the days filled between
  // the list and this tap, or the link is stale. The other door still works.
  if (!doctor || !dayKey) {
    return (
      <Screen {...chrome}>
        <Empty
          icon="calendar-clear-outline"
          title="No days open yet."
          action={
            <View style={styles.exit}>
              <Button
                label="Coming to the hospital today"
                onPress={() => router.replace("/(app)/today")}
              />
              <Text style={styles.exitBody}>
                We save your place in line. You will be seen in turn. We cannot tell you the hour.
              </Text>
            </View>
          }
        />
      </Screen>
    );
  }

  const picked = APPOINTMENT_REASONS.find((r) => r.value === reason);

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      // Same split as sign-in: the two platforms report the keyboard
      // differently, and one behaviour for both leaves the docked button under
      // it on whichever platform loses.
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Screen
        {...chrome}
        footer={
          <>
            {error ? (
              <View style={styles.well}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.status.cautionFg} />
                <Text style={styles.wellText} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              </View>
            ) : null}
            <Button
              label="Book an appointment"
              busy={busy}
              disabled={!slot || !reason}
              onPress={() => void onSubmit()}
            />
          </>
        }
      >
        <View style={styles.stack}>
          {/* The person. The photo is decorative — the name is written under
              it — and a monogram when there is none (§1). */}
          <View style={styles.head}>
            {doctor.photoUrl ? (
              <Image
                source={{ uri: doctor.photoUrl }}
                style={styles.photo}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            ) : (
              <Avatar name={doctor.fullName} size={72} />
            )}
            <View style={styles.ratingPill}>
              <Rating rating={doctor.rating} />
            </View>
            <Text accessibilityRole="header" style={styles.name}>
              {doctor.fullName}
            </Text>
            <Text style={styles.specialty}>{doctor.specialty ?? doctor.departmentName}</Text>
            <Text style={styles.meta}>
              {doctor.departmentName} · {hospitalName}
            </Text>
          </View>

          <Section title="Select date">
            <DayStrip days={days} selected={dayKey} onSelect={pickDay} />
          </Section>

          {/* The count is the length of the list under it — the one number
              §3 lets a screen print, and it says so by being that list. */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Select time
              </Text>
              <Text style={styles.count}>
                {slots.length === 1 ? "1 slot" : `${slots.length} slots`}
              </Text>
            </View>
            <ChipRow>
              {slots.map((s) => (
                <Chip
                  key={s.startsAtIso}
                  label={formatTime(s.startsAtIso)}
                  selected={s.startsAtIso === slot?.startsAtIso}
                  onPress={() => setSlot(s)}
                />
              ))}
            </ChipRow>
          </View>

          <Section title="Why are you coming?">
            {/* Five plain choices. `urgent_review` is not one of them and
                must not come back (ADR 0084 §12). */}
            <ChipRow>
              {APPOINTMENT_REASONS.map((r) => (
                <Chip
                  key={r.value}
                  label={r.title}
                  selected={r.value === reason}
                  onPress={() => setReason(r.value)}
                />
              ))}
            </ChipRow>
            {picked ? <Text style={styles.hint}>{picked.hint}</Text> : null}
          </Section>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, noteFocused && styles.fieldLabelFocused]}>
              Add a note for the clinic (optional)
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              onFocus={() => setNoteFocused(true)}
              onBlur={() => setNoteFocused(false)}
              multiline
              maxLength={500}
              placeholder="e.g. The chest pain comes on after climbing stairs."
              placeholderTextColor={colors.mutedForeground}
              selectionColor={colors.primary}
              accessibilityLabel="Add a note for the clinic. Optional."
              style={[styles.input, noteFocused && styles.inputFocused]}
            />
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    fill: { flex: 1 },
    center: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
    stack: { flexGrow: 1, gap: space[5] },

    head: { alignItems: "center", gap: space[2] },
    photo: { width: 120, height: 120, borderRadius: radius["2xl"], backgroundColor: c.accent },
    // The rating rides on a raised pill so it reads as a badge, not a caption.
    ratingPill: {
      paddingHorizontal: space[3],
      paddingVertical: space[1],
      borderRadius: radius.full,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    name: {
      fontFamily: font.display,
      fontSize: 28,
      lineHeight: 34,
      letterSpacing: -0.6,
      color: c.foreground,
      textAlign: "center",
      marginTop: space[1],
    },
    specialty: {
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.mutedForeground,
      textAlign: "center",
      marginTop: -space[1],
    },
    meta: {
      fontFamily: font.body,
      fontSize: 13.5,
      lineHeight: 19,
      color: c.mutedForeground,
      textAlign: "center",
    },

    // `Section`'s own head, with a count where its link would go.
    section: { gap: space[3] },
    sectionHead: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: space[3],
    },
    sectionTitle: {
      fontFamily: font.bodyMedium,
      fontSize: 16.5,
      lineHeight: 22,
      color: c.foreground,
    },
    count: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },

    hint: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },

    // The sunken input: a muted well, no edge until it has focus — and the
    // label lifts in weight too, so focus is never colour alone.
    field: { gap: space[2] },
    fieldLabel: {
      fontFamily: font.body,
      fontSize: 12.5,
      letterSpacing: 0.3,
      color: c.mutedForeground,
    },
    fieldLabelFocused: { fontFamily: font.bodyMedium, color: c.primary },
    input: {
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.foreground,
      minHeight: 48,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      borderRadius: radius.lg,
      backgroundColor: c.muted,
      // The web's inputs carry `--input` (= border) as their edge; a sunken
      // fill alone is invisible on the dark page until focus, and a field a
      // patient cannot find is not a field.
      borderWidth: 1,
      borderColor: c.border,
      textAlignVertical: "top",
    },
    inputFocused: { borderColor: c.primary },

    // The confirmation, centred like `Empty`: a mark, what happened, the facts.
    doneRoot: {
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: space[8],
      gap: space[3],
    },
    doneDisc: {
      width: 72,
      height: 72,
      borderRadius: radius.full,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: space[2],
    },
    doneTitle: {
      fontFamily: font.display,
      fontSize: 28,
      lineHeight: 34,
      letterSpacing: -0.6,
      color: c.foreground,
      textAlign: "center",
    },
    doneWhen: {
      fontFamily: font.bodyMedium,
      fontSize: 17,
      lineHeight: 23,
      color: c.foreground,
      textAlign: "center",
    },
    doneMuted: {
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.mutedForeground,
      textAlign: "center",
      maxWidth: 300,
    },

    exit: { width: "100%", gap: space[3], alignItems: "center" },
    exitBody: {
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.mutedForeground,
      textAlign: "center",
      maxWidth: 300,
    },

    // Amber, not red: a refused request is not a clinical emergency. The amber
    // is the frame and the glyph; the words are in the page's own ink.
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
