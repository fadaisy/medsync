import type { ClinicianOption, PatientProfile } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { DoctorRow } from "@/components/patient/doctor-row";
import { EmergencyButton } from "@/components/patient/emergency-button";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Empty } from "@/components/ui/empty";
import { Screen } from "@/components/ui/screen";
import { Section } from "@/components/ui/section";
import { fetchBookableClinicians, fetchPatientProfile } from "@/lib/booking";
import { useStyles, useTheme } from "@/theme/theme";
import { font, space } from "@/theme/tokens";

/**
 * Door B — the doctors list (ADR 0085 §4; the "Ask for a day" door of 0084 §2
 * opens here). Every clinician with a day open in the next 14 days at EVERY
 * active hospital (ADR 0086), grouped by hospital with the patient's own
 * first; inside a group, the order the server sends — soonest open day first.
 * A tap opens the doctor page, where the day, the time, the reason and the
 * request live, at that doctor's hospital.
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
  // `null` = every department. By NAME: the same clinic exists at several hospitals.
  const [departmentName, setDepartmentName] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchPatientProfile()
      .then(async (p) => {
        if (!p) {
          setProfile(null);
          return;
        }
        // No hospital argument: every active hospital (ADR 0086).
        setClinicians(await fetchBookableClinicians());
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

  // One chip per department NAME present (the same clinic exists at several
  // hospitals), in the order the names first appear — the order of their
  // soonest open day.
  const departments = clinicians.filter(
    (c, i, all) => all.findIndex((x) => x.departmentName === c.departmentName) === i,
  );
  const shown = departmentName
    ? clinicians.filter((c) => c.departmentName === departmentName)
    : clinicians;

  // Grouped by hospital, the patient's own first, then in the order the
  // server sends them (a hospital's soonest open day). Rows inside a group
  // keep the server's order.
  const hospitals = shown
    .filter((c, i, all) => all.findIndex((x) => x.hospitalId === c.hospitalId) === i)
    .map((c) => ({ id: c.hospitalId, name: c.hospitalName }))
    .sort((a, b) => Number(b.id === profile.hospitalId) - Number(a.id === profile.hospitalId));

  return (
    <Screen {...chrome} title="Doctors">
      <View style={styles.stack}>
        {/* §2 and §8: the label names real availability, never the horizon. */}
        <Text style={styles.lede}>
          Every hospital on MedSync. Choose from the days the clinic has open.
        </Text>

        {/* Day one's likely reality. Nothing here promises a message when days
            open (§11) — what replaces it is the other door, open by default (§14). */}
        {clinicians.length === 0 ? (
          <Empty
            icon="people-outline"
            title="No doctors on MedSync yet."
            hint="No hospital has an active clinician on MedSync yet. You can still be seen — going to the hospital does not depend on this app."
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
                  selected={departmentName === null}
                  onPress={() => setDepartmentName(null)}
                />
                {departments.map((d) => (
                  <Chip
                    key={d.departmentName}
                    label={d.departmentName}
                    role="button"
                    selected={d.departmentName === departmentName}
                    onPress={() => setDepartmentName(d.departmentName)}
                  />
                ))}
              </ChipRow>
            ) : null}

            {hospitals.map((h) => (
              <Section key={h.id} title={h.name}>
                <View style={styles.list}>
                  {shown
                    .filter((c) => c.hospitalId === h.id)
                    .map((c) => (
                      <DoctorRow
                        // A clinician can be bookable in two departments; each pair is a row.
                        key={`${c.userId}:${c.hospitalId}:${c.departmentId}`}
                        option={c}
                        onPress={() =>
                          router.push({
                            pathname: "/(app)/doctor/[id]",
                            params: {
                              id: c.userId,
                              department: c.departmentId,
                              hospital: c.hospitalId,
                            },
                          })
                        }
                      />
                    ))}
                </View>
              </Section>
            ))}
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
