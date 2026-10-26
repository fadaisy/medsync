import type { PatientProfile } from "@/lib/booking";
import type { ConsentDue } from "@/lib/session";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { EmergencyNotice } from "@/components/patient/emergency-notice";
import { Button, Card, Note, Screen, TextLink } from "@/components/tide";
import { CheckRow } from "@/features/auth/steps";
import { fetchPatientProfile } from "@/lib/booking";
import { acceptConsent, useSession } from "@/lib/session";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

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
 *
 * The red Help (law L6) is the Tide `<Screen>`'s own: the consent gate is the
 * only screen until it is clear, so it carries Help itself. No back link.
 */

export default function ConsentScreen() {
  const t = useTide();
  const { consent, consentAccepted, recheckConsent, signOut } = useSession();
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
    <EmergencyNotice
      hospitalName={profile?.hospitalName}
      emergencyPhone={profile?.emergencyPhone}
    />
  );

  if (consent.kind === "checking" || consent.kind === "clear") {
    // `clear` only for the frame in which the guard flips and the tabs replace this screen.
    return (
      <Screen helpSource="consent">
        {emergency}
        <ActivityIndicator
          color={t.ink}
          style={{ marginTop: tSpace[8] }}
          accessibilityLabel="Checking your account"
        />
      </Screen>
    );
  }

  if (consent.kind === "unknown") {
    return (
      <Screen
        helpSource="consent"
        title="We couldn't check your account"
        footer={<Button label="Try again" onPress={recheckConsent} />}
      >
        {emergency}
        <Text style={[tType.bodyM, { color: t.ink2 }]} accessibilityLiveRegion="polite">
          MedSync could not reach its records to see whether you have accepted the current
          data-processing notice. Check your connection and try again.
        </Text>
        <SignOutLink onPress={() => void signOut()} />
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
  const t = useTide();
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
      helpSource="consent"
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
      {emergency}
      <Text style={[tType.bodyM, { color: t.ink2 }]}>
        We have no record of you accepting the current data-processing notice — your account may
        predate it. Read it below and agree to continue using MedSync.
      </Text>

      <Card padding={tSpace[4]} style={{ gap: tSpace[3] }}>
        <Text style={[tType.labelS, { color: t.ink }]}>
          Data-processing notice · {due.version}, effective {due.effectiveDate}
        </Text>
        <Text style={[tType.bodyM, { color: t.ink2 }]}>{due.body}</Text>
      </Card>

      {/* The tick is the state made visible; the role and `checked` carry it to a screen reader. */}
      <CheckRow
        checked={agreed}
        onToggle={() => setAgreed((a) => !a)}
        title="I agree to MedSync's data-processing notice"
      />

      {/* Amber, not red: a save that did not land is not a clinical emergency. */}
      {error ? (
        <View accessibilityLiveRegion="polite">
          <Note tone="caution" icon="alert">
            {error}
          </Note>
        </View>
      ) : null}

      <SignOutLink onPress={onSignOut} />
    </Screen>
  );
}

/** "Sign out instead": the way not to agree, centred under the form. */
function SignOutLink({ onPress }: { onPress: () => void }) {
  return (
    <View style={{ alignItems: "center" }}>
      <TextLink label="Sign out instead" onPress={onPress} />
    </View>
  );
}
