import type { ClinicianOption, PatientProfile } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";

import { DoctorRow } from "@/components/patient/doctor-row";
import { EmergencyButton } from "@/components/patient/emergency-button";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Empty } from "@/components/ui/empty";
import { Screen } from "@/components/ui/screen";
import { fetchBookableClinicians, fetchPatientProfile } from "@/lib/booking";
import { useStyles, useTheme } from "@/theme/theme";
import { font, space } from "@/theme/tokens";

/** Where a patient with no hospital yet picks one, until the app owns that screen. */
const CHOOSE_HOSPITAL_URL = "https://medsync-six.vercel.app/patient/hospitals";

/**
 * Door B — the doctors list (ADR 0085 §4; the "Ask for a day" door of 0084 §2
 * opens here). Every clinician with a day open in the next 14 days, in the
 * order the server sends them — soonest open day first, so the top row is the
 * default the app would once have chosen silently (§9, superseded). A tap
 * opens the doctor page, where the day, the time, the reason and the request
 * live.
 *
 * The rows come from `pt-bookable-clinicians` exactly as returned: nothing
 * here derives a slot, re-sorts by rating, or counts anything. The department
 * chips only hide rows; they never reorder them.
 */
export default function BookScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);

  // `undefined` = still loading. `null` = no patient profile for this session.
  const [profile, setProfile] = useState<PatientProfile | null | undefined>();
  const [clinicians, setClinicians] = useState<ClinicianOption[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  // `null` = every department.
  const [departmentId, setDepartmentId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchPatientProfile()
      .then(async (p) => {
        if (!p?.hospitalId) {
          setProfile(p ?? null);
          return;
        }
        setClinicians(await fetchBookableClinicians(p.hospitalId));
        setProfile(p);
      })
      .catch(() => setLoadFailed(true));
  }, []);

  useEffect(load, [load]);

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
      <Screen {...chrome} title="Doctors">
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Loading" />
        </View>
      </Screen>
    );
  }

  if (!profile?.hospitalId) {
    return (
      <Screen {...chrome}>
        <Empty
          icon="business-outline"
          title="Choose your hospital first."
          hint="Both doors need to know which hospital you go to."
          action={
            <Button
              variant="secondary"
              label="Choose a hospital"
              accessibilityLabel="Choose a hospital, opens in your browser"
              onPress={() => {
                Linking.openURL(CHOOSE_HOSPITAL_URL).catch(() => {});
              }}
            />
          }
        />
      </Screen>
    );
  }

  // One chip per department present, in the order the departments first
  // appear — which is the order of their soonest open day.
  const departments = clinicians.filter(
    (c, i, all) => all.findIndex((x) => x.departmentId === c.departmentId) === i,
  );
  const shown = departmentId
    ? clinicians.filter((c) => c.departmentId === departmentId)
    : clinicians;

  return (
    <Screen {...chrome} title="Doctors">
      <View style={styles.stack}>
        <Text style={styles.eyebrow}>{profile.hospitalName ?? "your hospital"}</Text>
        {/* §2 and §8: the label names real availability, never the horizon. */}
        <Text style={styles.lede}>Choose from the days the clinic has open.</Text>

        {/* Day one's likely reality. Nothing here promises a message when days
            open (§11) — what replaces it is the other door, open by default (§14). */}
        {clinicians.length === 0 ? (
          <Empty
            icon="calendar-clear-outline"
            title="No days open yet."
            hint={`${profile.hospitalName ?? "This hospital"} has not put any clinic days on MedSync yet. You can still be seen — going to the hospital does not depend on this app.`}
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
        ) : (
          <>
            {departments.length > 1 ? (
              <ChipRow>
                <Chip
                  label="All"
                  role="button"
                  selected={departmentId === null}
                  onPress={() => setDepartmentId(null)}
                />
                {departments.map((d) => (
                  <Chip
                    key={d.departmentId}
                    label={d.departmentName}
                    role="button"
                    selected={d.departmentId === departmentId}
                    onPress={() => setDepartmentId(d.departmentId)}
                  />
                ))}
              </ChipRow>
            ) : null}

            <View style={styles.list}>
              {shown.map((c) => (
                <DoctorRow
                  // A clinician can be bookable in two departments; each pair is a row.
                  key={`${c.userId}:${c.departmentId}`}
                  option={c}
                  onPress={() =>
                    router.push({
                      pathname: "/(app)/doctor/[id]",
                      params: { id: c.userId, department: c.departmentId },
                    })
                  }
                />
              ))}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    center: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
    stack: { flexGrow: 1, gap: space[5] },
    list: { gap: space[3] },

    eyebrow: {
      fontFamily: font.body,
      fontSize: 12.5,
      letterSpacing: 0.3,
      color: c.mutedForeground,
      marginTop: -space[3],
    },
    lede: {
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.foreground,
      marginTop: -space[2],
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
  });
