import type { PlaceOption, SignupNotice } from "@/data/signup";
import type { PinAnchor } from "@/features/auth/map-pin";
import type { SignupDraft, Step } from "@/features/auth/rules";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import {
  Card,
  Chip,
  ChipRow,
  FieldError,
  FieldLabel,
  Icon,
  IconDisc,
  Note,
  PhoneField,
  Press,
  TextField,
  TextLink,
} from "@/components/tide";
import { searchPlaces, signupFromAppOn } from "@/data/signup";
import { MapPin } from "@/features/auth/map-pin";
import {
  checkDob,
  isEmail,
  MINOR_NOTE,
  NAME_MAX,
  passwordOk,
  passwordStrength,
  phoneProblem,
  SEX_OPTIONS,
  STEP_NAMES,
  VILLAGE_MAX,
} from "@/features/auth/rules";
import { flag } from "@/lib/flags";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/** Patch the draft. Steps never own state; the screen does. */
export type Patch = (next: Partial<SignupDraft>) => void;

/** "Step 2 of 4 · Where you live" over four segments: done lagoon, current ink. */
export function StepProgress({ step }: { step: Step }) {
  const t = useTide();
  return (
    <View
      style={{ gap: tSpace[2] }}
      accessible
      accessibilityLabel={`Step ${step} of 4, ${STEP_NAMES[step]}`}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[tType.caption, { color: t.ink3 }]}>Step {step} of 4</Text>
        <Text style={[tType.caption, { color: t.ink3 }]}>{STEP_NAMES[step]}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              backgroundColor: i < step ? t.accentPressed : i === step ? t.ink : t.line,
            }}
          />
        ))}
      </View>
    </View>
  );
}

export function StepHeading({ title, sub }: { title: string; sub: string }) {
  const t = useTide();
  return (
    <View style={{ gap: tSpace[1] }}>
      <Text
        accessibilityRole="header"
        style={[tType.display, { fontSize: 30, lineHeight: 34, color: t.ink }]}
      >
        {title}
      </Text>
      <Text style={[tType.bodyM, { fontSize: 14, lineHeight: 20, color: t.ink2 }]}>{sub}</Text>
    </View>
  );
}

/* ─── Step 1 · About you ─────────────────────────────────────────────── */

export function AboutStep({
  draft,
  patch,
  today,
  onDob,
}: {
  draft: SignupDraft;
  patch: Patch;
  today: Date;
  onDob: (part: "dobDay" | "dobMonth" | "dobYear", raw: string) => void;
}) {
  const dob = checkDob(draft.dobDay, draft.dobMonth, draft.dobYear, today);
  const dobFilled = dob.ok || dob.reason !== "incomplete";
  const dobState = dob.ok ? "good" : dobFilled ? "error" : "idle";
  const name = (v: string) => (v.trim() ? "good" : "idle");
  return (
    <View style={{ gap: tSpace[4] }}>
      <StepHeading title="About you" sub="We use this to find and keep your records." />
      <TextField
        label="First name"
        value={draft.firstName}
        onChangeText={(v) => patch({ firstName: v })}
        state={name(draft.firstName)}
        placeholder="e.g. Sarah"
        autoComplete="given-name"
        maxLength={NAME_MAX}
        inputProps={{ autoCapitalize: "words", textContentType: "givenName" }}
      />
      <TextField
        label="Surname"
        value={draft.surname}
        onChangeText={(v) => patch({ surname: v })}
        state={name(draft.surname)}
        placeholder="e.g. Nakato"
        autoComplete="family-name"
        maxLength={NAME_MAX}
        inputProps={{ autoCapitalize: "words", textContentType: "familyName" }}
      />
      <View style={{ gap: tSpace[1.5] }}>
        <FieldLabel>Sex at birth</FieldLabel>
        <ChipRow>
          {SEX_OPTIONS.map((o) => (
            <Chip
              key={o.key}
              label={o.label}
              selected={draft.sex === o.key}
              onPress={() => patch({ sex: o.key })}
            />
          ))}
        </ChipRow>
      </View>
      <View style={{ gap: tSpace[1.5] }}>
        <FieldLabel>Date of birth</FieldLabel>
        <View style={{ flexDirection: "row", gap: tSpace[2] }}>
          {(
            [
              ["dobDay", "Day", "DD", 2, 1],
              ["dobMonth", "Month", "MM", 2, 1],
              ["dobYear", "Year", "YYYY", 4, 1.5],
            ] as const
          ).map(([part, a11y, ph, max, grow]) => (
            <View key={part} style={{ flex: grow }}>
              <TextField
                value={draft[part]}
                onChangeText={(v) => onDob(part, v)}
                state={dobState}
                placeholder={ph}
                keyboardType="number-pad"
                maxLength={max}
                textAlign="center"
                accessibilityLabel={`Date of birth, ${a11y}`}
              />
            </View>
          ))}
        </View>
        {!dob.ok && dob.message ? <FieldError>{dob.message}</FieldError> : null}
        {draft.refusedMinor ? (
          <Note tone="info">
            {"You must be 18 or older to create an account. "}
            {MINOR_NOTE}
          </Note>
        ) : null}
      </View>
      <PhoneField
        label="Mobile number"
        value={draft.phone}
        onChangeText={(v) => patch({ phone: v })}
        error={phoneProblem(draft.phone)}
      />
    </View>
  );
}

/* ─── Step 2 · Where you live ────────────────────────────────────────── */

export function PlaceStep({
  draft,
  patch,
  anchor,
  onAnchor,
}: {
  draft: SignupDraft;
  patch: Patch;
  anchor: PinAnchor | null;
  onAnchor: (a: PinAnchor) => void;
}) {
  const t = useTide();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; places: PlaceOption[] } | null>(null);

  // Ask the web's place search a moment after typing stops. The answer is
  // keyed by its query so a slow reply for "ka" cannot overwrite "kawe".
  useEffect(() => {
    if (q.trim().length < 2) return;
    let live = true;
    const id = setTimeout(() => {
      void searchPlaces(q).then((places) => {
        if (live) setFound({ q, places });
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [q]);

  const results = found && found.q === q && q.trim().length >= 2 ? found.places : null;
  const showPin = flag("mobileMapPin");

  return (
    <View style={{ gap: tSpace[4] }}>
      <StepHeading title="Where you live" sub="So we can show clinics near you." />
      <View style={{ gap: tSpace[1.5] }}>
        <FieldLabel>District or subcounty</FieldLabel>
        {draft.place ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: tSpace[2],
              minHeight: 54,
              paddingLeft: tSpace[3.5],
              paddingRight: tSpace[2],
              borderRadius: tRadius.field,
              backgroundColor: t.surface,
              boxShadow: `inset 0px 0px 0px 2px ${t.accentPressed}`,
            }}
          >
            <Icon name="mapPin" size={18} color={t.ink} />
            <Text style={[tType.label, { flex: 1, color: t.ink }]}>{draft.place.label}</Text>
            <Press
              onPress={() => patch({ place: null })}
              accessibilityLabel="Change where you live"
              style={{ minHeight: 44, paddingHorizontal: tSpace[2.5], justifyContent: "center" }}
            >
              <Text style={[tType.labelS, { color: t.accentText }]}>Change</Text>
            </Press>
          </View>
        ) : (
          <>
            <TextField
              value={q}
              onChangeText={setQ}
              placeholder="Search, e.g. Kawempe"
              accessibilityLabel="Search your district or subcounty"
              inputProps={{ autoCorrect: false, returnKeyType: "search" }}
            />
            {!signupFromAppOn ? (
              <Note tone="plain">
                Sign-up from the app is not switched on yet, so the place search is off.
              </Note>
            ) : results === null ? (
              <Text style={[tType.bodyS, { color: t.ink3 }]}>
                Type at least 2 letters of your district or subcounty.
              </Text>
            ) : results.length === 0 ? (
              <Text style={[tType.bodyS, { color: t.ink3 }]}>No match. Try the district name.</Text>
            ) : (
              <View style={{ gap: tSpace[1.5] }}>
                {results.map((p) => (
                  <Press
                    key={p.code}
                    onPress={() => {
                      patch({ place: { code: p.code, label: p.label } });
                      setQ("");
                    }}
                    accessibilityLabel={`${p.label}, ${p.path}`}
                    style={{
                      minHeight: 48,
                      paddingHorizontal: tSpace[3],
                      paddingVertical: tSpace[2],
                      borderRadius: tRadius.md,
                      backgroundColor: t.surface,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: tSpace[2],
                      boxShadow: t.shadow.card,
                    }}
                  >
                    <Icon name="mapPin" size={16} color={t.ink2} />
                    <View style={{ flex: 1 }}>
                      <Text style={[tType.labelS, { color: t.ink }]}>{p.label}</Text>
                      <Text style={[tType.micro, { color: t.ink3 }]}>{p.path}</Text>
                    </View>
                  </Press>
                ))}
              </View>
            )}
          </>
        )}
      </View>
      <View style={{ gap: tSpace[1] }}>
        <TextField
          label="Village or address"
          optional
          value={draft.village}
          onChangeText={(v) => patch({ village: v })}
          placeholder="e.g. Bwaise II, near the market"
          maxLength={VILLAGE_MAX}
          multiline
        />
        <Text style={[tType.micro, { color: t.ink3, alignSelf: "flex-end" }]}>
          {draft.village.length}/{VILLAGE_MAX}
        </Text>
      </View>
      {showPin ? (
        <View style={{ gap: tSpace[2] }}>
          <FieldLabel optional>Pin your home</FieldLabel>
          <CheckRow
            checked={draft.pinConsent}
            onToggle={() =>
              // Declining takes the pin away with it: nothing is kept without the yes.
              patch(draft.pinConsent ? { pinConsent: false, pin: null } : { pinConsent: true })
            }
            title="Keep a pin of my home"
            sub="Used only to help an ambulance or health worker find you. Only your care team sees it. You can say no."
          />
          {draft.pinConsent ? (
            <>
              <MapPin
                pin={draft.pin}
                onPin={(pin) => patch({ pin })}
                anchor={anchor}
                onAnchor={onAnchor}
              />
              <Text style={[tType.bodyS, { fontSize: 12, lineHeight: 16, color: t.ink3 }]}>
                Tap the map to move the pin. It helps an ambulance or health worker find you. Only
                your care team sees it.
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/* ─── Step 3 · Your sign-in ──────────────────────────────────────────── */

export function SignInStep({ draft, patch }: { draft: SignupDraft; patch: Patch }) {
  const t = useTide();
  const [show, setShow] = useState(false);
  const strength = passwordStrength(draft.password);
  // Neutral to lagoon: red and amber belong to emergencies and clinical signals (laws L3, L4).
  const bar = [t.line, t.ink4, t.ink3, t.accent, t.accentPressed][strength.score];
  return (
    <View style={{ gap: tSpace[4] }}>
      <StepHeading
        title="Your sign-in"
        sub="You can also sign in later with a code sent to your phone."
      />
      <TextField
        label="Email"
        value={draft.email}
        onChangeText={(v) => patch({ email: v })}
        state={isEmail(draft.email) ? "good" : draft.email ? "error" : "idle"}
        error={isEmail(draft.email) ? null : "Enter a valid email, like name@example.com"}
        placeholder="name@example.com"
        keyboardType="email-address"
        autoComplete="email"
        maxLength={120}
        inputProps={{ autoCapitalize: "none", autoCorrect: false, textContentType: "emailAddress" }}
      />
      <View style={{ gap: tSpace[1.5] }}>
        <TextField
          label="Password"
          value={draft.password}
          onChangeText={(v) => patch({ password: v })}
          state={passwordOk(draft.password) ? "good" : "idle"}
          placeholder="12 or more characters"
          secure={!show}
          onToggleSecure={() => setShow((s) => !s)}
          autoComplete="new-password"
          inputProps={{
            autoCapitalize: "none",
            autoCorrect: false,
            textContentType: "newPassword",
          }}
        />
        <View style={{ flexDirection: "row", gap: 4 }} accessible={false}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: i <= strength.score ? bar : t.line,
              }}
            />
          ))}
        </View>
        {/* The words carry the strength; the bar only repeats them (never colour alone). */}
        <Text
          accessibilityLiveRegion="polite"
          style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]}
        >
          {strength.hint}
        </Text>
      </View>
    </View>
  );
}

/* ─── Step 4 · Consent ───────────────────────────────────────────────── */

export function ConsentStep({
  draft,
  patch,
  notice,
  loading,
  onRetry,
}: {
  draft: SignupDraft;
  patch: Patch;
  notice: SignupNotice | null;
  loading: boolean;
  onRetry: () => void;
}) {
  const t = useTide();
  const [full, setFull] = useState(false);
  const live = notice?.notice ?? null;
  return (
    <View style={{ gap: tSpace[4] }}>
      <StepHeading title="Your consent" sub="Please read this before we create your account." />
      {!signupFromAppOn ? (
        <Note tone="plain">Sign-up from the app is not switched on yet.</Note>
      ) : loading ? (
        <Note tone="plain" icon="clock">
          Loading the data notice…
        </Note>
      ) : !notice || !live ? (
        <View style={{ gap: tSpace[2] }}>
          <Note tone="plain" icon="alert">
            We couldn&apos;t load the data notice. Check your connection and try again.
          </Note>
          <TextLink label="Try again" onPress={onRetry} />
        </View>
      ) : !notice.open ? (
        <Note tone="plain">Sign-up is not open yet. Please try again later.</Note>
      ) : (
        <>
          <Card>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: tSpace[2],
              }}
            >
              <Text
                accessibilityRole="header"
                style={[tType.label, { fontFamily: tFont.bold, fontSize: 15, color: t.ink }]}
              >
                How we use your data
              </Text>
              <View
                style={{
                  minHeight: 22,
                  paddingHorizontal: 8,
                  borderRadius: tRadius.pill,
                  backgroundColor: t.surface2,
                  justifyContent: "center",
                }}
              >
                <Text style={[tType.micro, { fontFamily: tFont.semibold, color: t.ink2 }]}>
                  Notice {live.version}
                </Text>
              </View>
            </View>
            {notice.summary.map((line) => (
              <Text key={line} style={[tType.bodyS, { lineHeight: 19, color: t.ink2 }]}>
                {line}
              </Text>
            ))}
            {full ? (
              <Text style={[tType.bodyS, { lineHeight: 19, color: t.ink2 }]}>{live.body}</Text>
            ) : null}
            <TextLink
              label={
                full
                  ? "Hide the full notice"
                  : `Read the full notice (${live.version}, effective ${live.effective})`
              }
              onPress={() => setFull((f) => !f)}
            />
          </Card>
          <CheckRow
            checked={draft.consent}
            onToggle={() => patch({ consent: !draft.consent })}
            title={notice.agree}
            sub="Required to create your account"
          />
          {notice.sms ? (
            <CheckRow
              checked={draft.sms}
              onToggle={() => patch({ sms: !draft.sms })}
              title={notice.sms.label}
              sub={`${notice.sms.body} ${notice.sms.declined} ${notice.sms.receipt}`}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

/** A tick box as a whole card: the hit area is the sentence, not the 24pt square. */
export function CheckRow({
  checked,
  onToggle,
  title,
  sub,
}: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  sub?: string;
}) {
  const t = useTide();
  return (
    <Press
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      style={{
        flexDirection: "row",
        gap: tSpace[3],
        alignItems: "flex-start",
        padding: tSpace[3.5],
        borderRadius: tRadius.row,
        backgroundColor: t.surface,
        boxShadow: `inset 0px 0px 0px 2px ${checked ? t.accentPressed : t.line}`,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          backgroundColor: checked ? t.accentPressed : t.surface,
          boxShadow: `inset 0px 0px 0px 2px ${checked ? t.accentPressed : t.lineStrong}`,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <Icon name="check" size={16} color={t.onAccent} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[tType.labelS, { lineHeight: 19, color: t.ink }]}>{title}</Text>
        {sub ? (
          <Text style={[tType.bodyS, { fontSize: 12, lineHeight: 17, color: t.ink2 }]}>{sub}</Text>
        ) : null}
      </View>
    </Press>
  );
}

/* ─── Done ───────────────────────────────────────────────────────────── */

const LATER = [
  "National ID",
  "Next of kin",
  "Usual hospital",
  "Photo",
  "Title",
  "Preferred language",
];

export function DoneStep({ firstName }: { firstName: string }) {
  const t = useTide();
  return (
    <View style={{ gap: tSpace[4] }}>
      <View style={{ alignItems: "center", gap: tSpace[3], paddingTop: tSpace[6] }}>
        <IconDisc name="check" size={84} color={t.onAccent} bg={t.accent} />
        <Text
          accessibilityRole="header"
          style={[
            tType.display,
            { fontSize: 30, lineHeight: 34, color: t.ink, textAlign: "center" },
          ]}
        >
          Welcome, {firstName}
        </Text>
        <Text style={[tType.bodyM, { color: t.ink2, textAlign: "center" }]}>
          Your account is ready. Your MedSync number is given at your first visit.
        </Text>
      </View>
      <Card>
        <Text
          accessibilityRole="header"
          style={[tType.labelS, { fontFamily: tFont.bold, color: t.ink }]}
        >
          Later, in your profile
        </Text>
        <Text style={[tType.bodyS, { lineHeight: 19, color: t.ink2 }]}>
          We will ask for these when you need them. No rush.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {LATER.map((w) => (
            <View
              key={w}
              style={{
                minHeight: 30,
                paddingHorizontal: 10,
                borderRadius: tRadius.pill,
                backgroundColor: t.surface2,
                justifyContent: "center",
              }}
            >
              <Text style={[tType.caption, { color: t.ink }]}>{w}</Text>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}
