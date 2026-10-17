import type { PatientProfile } from "@/lib/booking";
import type { ConsentDue } from "@/lib/session";
import type { Palette } from "@/theme/tokens";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { EmergencyNotice } from "@/components/patient/emergency-notice";
import { HelpButton } from "@/components/tide";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { fetchPatientProfile } from "@/lib/booking";
import { acceptConsent, useSession } from "@/lib/session";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * Re-accept the data-processing notice (Gate H, ADR 0094) — the web's
 * /patient/consent, on the phone. The whole text is on the page, not behind
 * a disclosure: this screen exists for it to be read. One checkbox, one
 * primary action, and Sign out as the way not to agree; there is no Back,
 * because the gate has dropped everything behind it.
 *
 * This is the only screen in the navigator until the check is `clear`, so it
 * carries the gate's other two states as well — a hold while checking, and a
 * Retry when the read failed — and, first of all, the emergency block: the
 * Emergency tab is behind the gate, and a patient mid-stroke who has not yet
 * agreed to a notice is still a patient (ADR 0085 §5). The block needs no
 * data; the hospital's number joins it when the profile arrives.
 *
 * `consent` comes from the session provider, which also owns the reopen:
 * `consentAccepted()` flips the layout's guard and the tabs return.
 */
/** The red Help (law L6): the consent gate is the only screen until it is clear, so it carries Help itself. */
const HELP = <HelpButton source="consent" />;

export default function ConsentScreen() {
  const { consent, consentAccepted, recheckConsent, signOut } = useSession();
  const styles = useStyles(makeStyles);
  const [profile, setProfile] = useState<PatientProfile | null>(null);

  useEffect(() => {
    let live = true;
    fetchPatientProfile().then(
      (p) => {
        if (live) setProfile(p);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);

  const emergency = (
    <View style={styles.emergency}>
      <EmergencyNotice
        hospitalName={profile?.hospitalName}
        emergencyPhone={profile?.emergencyPhone}
      />
    </View>
  );

  if (consent.kind === "checking" || consent.kind === "clear") {
    // `clear` only for the frame in which the guard flips and the tabs replace this screen.
    return (
      <Screen trailing={HELP}>
        {emergency}
        <ActivityIndicator style={styles.loading} accessibilityLabel="Checking your account" />
      </Screen>
    );
  }

  if (consent.kind === "unknown") {
    return (
      <Screen
        trailing={HELP}
        title="We couldn't check your account"
        footer={<Button label="Try again" onPress={recheckConsent} />}
      >
        <View style={styles.column}>
          {emergency}
          <Text style={styles.lead} accessibilityLiveRegion="polite">
            MedSync could not reach its records to see whether you have accepted the current
            data-processing notice. Check your connection and try again.
          </Text>
          <Button
            variant="link"
            label="Sign out instead"
            onPress={() => void signOut()}
            style={styles.signOut}
          />
        </View>
      </Screen>
    );
  }

  return (
    <ConsentForm
      due={consent.due}
      emergency={emergency}
      onAccepted={consentAccepted}
      onSignOut={() => void signOut()}
    />
  );
}

function ConsentForm({
  due,
  emergency,
  onAccepted,
  onSignOut,
}: {
  due: ConsentDue;
  emergency: ReactNode;
  onAccepted: () => void;
  onSignOut: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onAgree = async () => {
    if (!agreed || busy) return;
    setBusy(true);
    setError(null);
    const res = await acceptConsent(due);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onAccepted();
  };

  return (
    <Screen
      trailing={HELP}
      title="Please read and accept"
      footer={
        <Button
          label="Agree and continue"
          disabled={!agreed}
          busy={busy}
          onPress={() => void onAgree()}
        />
      }
    >
      <View style={styles.column}>
        {emergency}
        <Text style={styles.lead}>
          We have no record of you accepting the current data-processing notice — your account may
          predate it. Read it below and agree to continue using MedSync.
        </Text>

        <View style={styles.card}>
          <Text style={styles.meta}>
            Data-processing notice · {due.version}, effective {due.effectiveDate}
          </Text>
          <Text style={styles.body}>{due.body}</Text>
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
          onPress={() => setAgreed((a) => !a)}
          style={({ pressed }) => [styles.check, pressed && styles.checkPressed]}
        >
          {/* The glyph is the state made visible; the role and `checked` carry it to a screen reader. */}
          <Ionicons
            name={agreed ? "checkbox" : "square-outline"}
            size={24}
            color={agreed ? colors.primary : colors.mutedForeground}
          />
          <Text style={styles.checkLabel}>I agree to MedSync&apos;s data-processing notice</Text>
        </Pressable>

        {error ? (
          <View style={styles.well}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.status.cautionFg} />
            <Text style={styles.wellText} accessibilityLiveRegion="polite">
              {error}
            </Text>
          </View>
        ) : null}

        <Button
          variant="link"
          label="Sign out instead"
          onPress={onSignOut}
          style={styles.signOut}
        />
      </View>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    column: { gap: space[5] },
    emergency: { gap: space[3] },
    loading: { marginTop: space[8] },
    lead: { fontFamily: font.body, fontSize: 15.5, lineHeight: 23, color: c.mutedForeground },

    card: {
      gap: space[3],
      padding: space[4],
      borderRadius: radius["2xl"],
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    meta: { fontFamily: font.bodyMedium, fontSize: 14.5, lineHeight: 20, color: c.foreground },
    body: { fontFamily: font.body, fontSize: 14.5, lineHeight: 22, color: c.mutedForeground },

    check: {
      flexDirection: "row",
      alignItems: "center",
      gap: space[3],
      minHeight: 44,
      paddingVertical: space[2],
    },
    checkPressed: { opacity: 0.7 },
    checkLabel: {
      flex: 1,
      fontFamily: font.bodyMedium,
      fontSize: 15.5,
      lineHeight: 22,
      color: c.foreground,
    },

    signOut: { alignSelf: "center" },

    // Amber, not red: a save that did not land is not a clinical emergency.
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
