import type { PatientProfile } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { EmergencyNotice } from "@/components/patient/emergency-notice";
import { Screen } from "@/components/ui/screen";
import { fetchPatientProfile } from "@/lib/booking";
import { useStyles } from "@/theme/theme";
import { font, space } from "@/theme/tokens";

/**
 * The Emergency tab — ADR 0085 §5. The emergency block of ADR 0084 §3, byte
 * for byte, on its own screen behind the one red tab in the app; this is the
 * only screen that renders it.
 *
 * The block is drawn before anything is fetched: the instruction needs no
 * data, and a patient mid-stroke on a 2G connection should not wait for
 * PostgREST to be told where to go. The profile arrives on focus and adds the
 * hospital's name and its verified number — or nothing, which is the block's
 * own no-number state. A failed read is the same as no profile: the words
 * still stand, and no number is ever invented in their place.
 */
export default function EmergencyScreen() {
  const styles = useStyles(makeStyles);
  const [profile, setProfile] = useState<PatientProfile | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchPatientProfile().then(setProfile, () => {});
    }, []),
  );

  return (
    <Screen title="Emergency">
      <View style={styles.column}>
        {profile?.hospitalName ? <Text style={styles.eyebrow}>{profile.hospitalName}</Text> : null}
        <EmergencyNotice
          hospitalName={profile?.hospitalName}
          emergencyPhone={profile?.emergencyPhone}
        />
      </View>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    column: { gap: space[3] },
    eyebrow: {
      fontFamily: font.body,
      fontSize: 12.5,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: c.mutedForeground,
    },
  });
