import type { GeoWords } from "@/data/places";
import type { PlaceOption, SignupNotice } from "@/data/signup";
import type { ReviewRow, SignupDraft, Step } from "@/features/auth/rules";
import { useEffect, useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { Card, FieldLabel, findMe, Icon, Note, PlaceMap, Press, wordsFor } from "@/components/tide";
import { PLACE_CONSENT } from "@/data/places";
import { searchPlaces, signupFromAppOn } from "@/data/signup";
import {
  ChoiceTiles,
  FieldProblem,
  Mark,
  QuietLink,
  STATE_WORDS,
  StatusField,
  StatusPhoneField,
} from "@/features/auth/marks";
import {
  autoPick,
  checkDob,
  isEmail,
  MINOR_NOTE,
  NAME_MAX,
  PASSWORD_MIN,
  passwordOk,
  passwordStrength,
  phoneProblem,
  SEX_OPTIONS,
  VILLAGE_MAX,
} from "@/features/auth/rules";
import { BRAND } from "@/lib/brand";
import { motion } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/** Patch the draft. Steps never own state; the screen does. */
export type Patch = (next: Partial<SignupDraft>) => void;

/** A step's large heading with one grey line under it. Sign-in uses it too. */
export function StepHeading({ title, sub }: { title: string; sub: string }) {
  const t = useTide();
  return (
    <View style={{ gap: tSpace[1.5] }}>
      <Text
        accessibilityRole="header"
        style={[tType.display, { fontSize: 30, lineHeight: 34, color: t.ink }]}
      >
        {title}
      </Text>
      <Text style={[tType.bodyM, { fontFamily: tFont.regular, color: t.ink3 }]}>{sub}</Text>
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
  const dobState = dob.ok ? "good" : dobFilled ? "bad" : "idle";
  const name = (v: string) => (v.trim() ? "good" : "idle");
  return (
    <View style={{ gap: tSpace[3.5] }}>
      <StepHeading title="About you" sub="We use this to find and keep your records." />
      <StatusField
        label="First name"
        value={draft.firstName}
        onChangeText={(v) => patch({ firstName: v })}
        state={name(draft.firstName)}
        icon="user"
        placeholder="e.g. Sarah"
        autoComplete="given-name"
        maxLength={NAME_MAX}
        inputProps={{ autoCapitalize: "words", textContentType: "givenName" }}
      />
      <StatusField
        label="Surname"
        value={draft.surname}
        onChangeText={(v) => patch({ surname: v })}
        state={name(draft.surname)}
        icon="user"
        placeholder="e.g. Nakato"
        autoComplete="family-name"
        maxLength={NAME_MAX}
        inputProps={{ autoCapitalize: "words", textContentType: "familyName" }}
      />
      <ChoiceTiles
        label="Sex at birth"
        options={SEX_OPTIONS}
        value={draft.sex}
        onChange={(sex) => patch({ sex })}
      />
      <View style={{ gap: tSpace[1.5] }}>
        <FieldLabel>Date of birth</FieldLabel>
        <View style={{ flexDirection: "row", gap: tSpace[2] }}>
          {(
            [
              ["dobDay", "Day", "DD", 2, 1],
              ["dobMonth", "Month", "MM", 2, 1],
              ["dobYear", "Year", "YYYY", 4, 2],
            ] as const
          ).map(([part, a11y, ph, max, grow]) => (
            <View key={part} style={{ flex: grow }}>
              <StatusField
                value={draft[part]}
                onChangeText={(v) => onDob(part, v)}
                state={dobState}
                icon="calendar"
                // One mark for the whole date, at the right end of the year.
                mark={part === "dobYear"}
                placeholder={ph}
                keyboardType="number-pad"
                maxLength={max}
                textAlign="center"
                accessibilityLabel={`Date of birth, ${a11y}`}
              />
            </View>
          ))}
        </View>
        {!dob.ok && dob.message ? <FieldProblem>{dob.message}</FieldProblem> : null}
        {draft.refusedMinor ? (
          <Note tone="plain" icon={null}>
            {"You must be 18 or older to create an account. "}
            {MINOR_NOTE}
          </Note>
        ) : null}
      </View>
      <StatusPhoneField
        label="Mobile number"
        value={draft.phone}
        onChangeText={(v) => patch({ phone: v })}
        error={phoneProblem(draft.phone)}
      />
    </View>
  );
}

/* ─── Step 2 · Where you live ────────────────────────────────────────── */

/**
 * "Use my location" or "Pin it on a map" (ADR 0402): the phone geocoder's
 * area name pre-fills the place search, so the patient still picks the
 * official UBOS entry, and its street words pre-fill "Village or address"
 * unless the patient typed their own. The pin itself is saved as the home
 * place after sign-in, and only with the PLACE_CONSENT yes.
 */
export function PlaceStep({
  draft,
  patch,
  on = signupFromAppOn,
}: {
  draft: SignupDraft;
  patch: Patch;
  /** Whether sign-up from the app is switched on (the build names the web origin). */
  on?: boolean;
}) {
  const t = useTide();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; places: PlaceOption[] } | null>(null);
  const [mapOpen, setMapOpen] = useState(draft.pin !== null);
  const [finding, setFinding] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);
  // The village words we filled in: a later pin may replace them, never what the patient typed.
  const [autoVillage, setAutoVillage] = useState<string | null>(null);
  // The search words the phone's geocoder filled in; their single best match is picked for the patient.
  const [autoQuery, setAutoQuery] = useState<string | null>(null);

  const fill = (geo: GeoWords) => {
    if (!draft.place && geo.query) {
      setQ(geo.query);
      setAutoQuery(geo.query);
    }
    if (geo.village && (draft.village === "" || draft.village === autoVillage)) {
      const village = geo.village.slice(0, VILLAGE_MAX);
      patch({ village });
      setAutoVillage(village);
    }
  };

  const locateMe = async () => {
    setFinding(true);
    setLocNote(null);
    const at = await findMe();
    setFinding(false);
    if ("problem" in at) {
      setLocNote(at.problem);
      return;
    }
    setMapOpen(true);
    patch({ pin: { ...at, address: null } });
    const geo = await wordsFor(at.lat, at.lng);
    if (!geo) return;
    patch({ pin: { ...at, address: geo.address } });
    fill(geo);
  };

  // Ask the web's place search a moment after typing stops. The answer is
  // keyed by its query so a slow reply for "ka" cannot overwrite "kawe".
  useEffect(() => {
    if (q.trim().length < 2) return;
    let live = true;
    const id = setTimeout(() => {
      void searchPlaces(q).then((places) => {
        if (!live) return;
        setFound({ q, places });
        // Filled from the patient's own location: take the official entry that
        // names it. It shows as chosen with "Change", so the patient still decides.
        const best = q === autoQuery ? autoPick(q, places) : null;
        if (best) {
          patch({ place: { code: best.code, label: best.label } });
          setQ("");
          setAutoQuery(null);
        }
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [q, autoQuery, patch]);

  const results = found && found.q === q && q.trim().length >= 2 ? found.places : null;

  return (
    <View style={{ gap: tSpace[3.5] }}>
      <StepHeading title="Where you live" sub="So we can show clinics near you." />

      <View style={{ gap: tSpace[1.5] }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: 48,
          }}
        >
          <FieldLabel>District or subcounty</FieldLabel>
          {!draft.place ? (
            <Press
              onPress={() => void locateMe()}
              disabled={finding}
              accessibilityLabel="Use my location to fill this in"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: tSpace[1.5],
                minHeight: 48,
              }}
            >
              <Icon name="locate" size={16} color={t.accentText} />
              <Text style={[tType.labelS, { fontSize: 15, color: t.accentText }]}>
                {finding ? "Finding you…" : "Use my location"}
              </Text>
            </Press>
          ) : null}
        </View>
        {draft.place ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: tSpace[2.5],
              minHeight: 52,
              paddingLeft: tSpace[4],
              paddingRight: tSpace[1.5],
              borderRadius: tRadius.field,
              backgroundColor: t.surface,
              boxShadow: `inset 0px 0px 0px 1px ${t.line}`,
            }}
          >
            <View accessible accessibilityRole="image" accessibilityLabel={STATE_WORDS.good}>
              <Mark kind="tick" />
            </View>
            <Text style={[tType.label, { flex: 1, lineHeight: 22, color: t.ink }]}>
              {draft.place.label}
            </Text>
            <Press
              onPress={() => patch({ place: null })}
              accessibilityLabel="Change where you live"
              style={{ minHeight: 48, paddingHorizontal: tSpace[2.5], justifyContent: "center" }}
            >
              <Text style={[tType.labelS, { fontSize: 15, color: t.accentText }]}>Change</Text>
            </Press>
          </View>
        ) : (
          <>
            <StatusField
              value={q}
              onChangeText={(v) => {
                setQ(v);
                setAutoQuery(null);
              }}
              icon="search"
              placeholder="Search, e.g. Kawempe"
              accessibilityLabel="Search your district or subcounty"
              inputProps={{ autoCorrect: false, returnKeyType: "search" }}
            />
            {locNote ? (
              <Text accessibilityLiveRegion="polite" style={[tType.bodyS, { color: t.ink2 }]}>
                {locNote}
              </Text>
            ) : null}
            {!on ? (
              <Note tone="plain">
                Sign-up from the app is not switched on yet, so the place search is off.
              </Note>
            ) : results === null ? (
              <Text style={[tType.bodyS, { color: t.ink3 }]}>
                Type at least 2 letters, or use your location.
              </Text>
            ) : results.length === 0 ? (
              <Text style={[tType.bodyS, { color: t.ink3 }]}>No match. Try the district name.</Text>
            ) : (
              <View style={{ gap: tSpace[1.5] }}>
                <Text style={[tType.bodyS, { color: t.ink3 }]}>Tap your area to choose it.</Text>
                {results.map((p) => (
                  <Press
                    key={p.code}
                    onPress={() => {
                      patch({ place: { code: p.code, label: p.label } });
                      setQ("");
                    }}
                    accessibilityLabel={`${p.label}, ${p.path}`}
                    style={{
                      minHeight: 56,
                      paddingHorizontal: tSpace[3.5],
                      paddingVertical: tSpace[2],
                      borderRadius: tRadius.field,
                      backgroundColor: t.surface,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: tSpace[2.5],
                      boxShadow: t.shadow.card,
                    }}
                  >
                    <Icon name="mapPin" size={18} color={t.ink2} />
                    <View style={{ flex: 1 }}>
                      <Text style={[tType.labelS, { fontSize: 15, lineHeight: 20, color: t.ink }]}>
                        {p.label}
                      </Text>
                      <Text style={[tType.micro, { fontSize: 12, lineHeight: 16, color: t.ink3 }]}>
                        {p.path}
                      </Text>
                    </View>
                    <Mark kind="ring" />
                  </Press>
                ))}
              </View>
            )}
          </>
        )}
      </View>

      <StatusField
        label="Village or address"
        value={draft.village}
        onChangeText={(v) => patch({ village: v })}
        state={draft.village.trim() ? "good" : "opt"}
        icon="home"
        placeholder="e.g. Bwaise II, near the market"
        maxLength={VILLAGE_MAX}
      />

      <View style={{ gap: tSpace[1.5] }}>
        <FieldLabel>Pin your home</FieldLabel>
        {mapOpen ? (
          <>
            <PlaceMap
              value={draft.pin}
              height={180}
              onPick={(pick) => {
                patch({
                  pin: { lat: pick.lat, lng: pick.lng, address: pick.geo?.address ?? null },
                });
                if (pick.geo) fill(pick.geo);
              }}
            />
            {draft.pin ? (
              <Press
                onPress={() => patch({ pinConsent: !draft.pinConsent })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: draft.pinConsent }}
                accessibilityLabel={`Save as my home place. ${PLACE_CONSENT.words}`}
                haptic={false}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: tSpace[3],
                  minHeight: 48,
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    marginTop: 1,
                    borderRadius: 7,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: draft.pinConsent ? t.primary : t.surface,
                    borderWidth: draft.pinConsent ? 0 : 2,
                    borderColor: t.lineStrong,
                  }}
                >
                  {draft.pinConsent ? (
                    <Icon name="check" size={15} color={t.onPrimary} strokeWidth={3} />
                  ) : null}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[tType.labelS, { fontSize: 15, lineHeight: 20, color: t.ink }]}>
                    Save as my home place
                  </Text>
                  <Text style={[tType.bodyS, { color: t.ink2 }]}>{PLACE_CONSENT.words}</Text>
                </View>
              </Press>
            ) : null}
          </>
        ) : (
          <Press
            onPress={() => setMapOpen(true)}
            accessibilityLabel="Pin your home on a map. Optional."
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: tSpace[3],
              minHeight: 60,
              paddingLeft: tSpace[4],
              paddingRight: tSpace[3.5],
              paddingVertical: tSpace[2],
              borderRadius: tRadius.field,
              backgroundColor: t.surface,
              boxShadow: `inset 0px 0px 0px 1px ${t.line}`,
            }}
          >
            <Icon name="mapPin" size={20} color={t.ink3} />
            <View style={{ flex: 1 }}>
              <Text style={[tType.labelS, { fontSize: 15, lineHeight: 20, color: t.ink }]}>
                Pin it on a map
              </Text>
              <Text style={[tType.bodyS, { lineHeight: 17, color: t.ink2 }]}>
                Helps a health worker find you
              </Text>
            </View>
            <Text style={[tType.bodyS, { lineHeight: 17, color: t.ink3 }]}>Optional</Text>
          </Press>
        )}
      </View>
    </View>
  );
}

/* ─── Step 3 · Your sign-in ──────────────────────────────────────────── */

export function SignInStep({ draft, patch }: { draft: SignupDraft; patch: Patch }) {
  const t = useTide();
  const [show, setShow] = useState(false);
  const strength = passwordStrength(draft.password);
  const typed = draft.password.length > 0;
  const good = passwordOk(draft.password);
  // Long enough and still refused: only a password over the server's byte limit lands here.
  const tooLong = typed && !good && draft.password.length >= PASSWORD_MIN;
  return (
    <View style={{ gap: tSpace[3.5] }}>
      <StepHeading
        title="Your sign-in"
        sub="You can also sign in later with a code sent to your phone."
      />
      <StatusField
        label="Email"
        value={draft.email}
        onChangeText={(v) => patch({ email: v })}
        state={isEmail(draft.email) ? "good" : draft.email ? "bad" : "idle"}
        icon="mail"
        error={isEmail(draft.email) ? null : "Enter a valid email, like name@example.com"}
        placeholder="name@example.com"
        keyboardType="email-address"
        autoComplete="email"
        maxLength={120}
        inputProps={{ autoCapitalize: "none", autoCorrect: false, textContentType: "emailAddress" }}
      />
      <View style={{ gap: tSpace[1.5] }}>
        <StatusField
          label="Password"
          value={draft.password}
          onChangeText={(v) => patch({ password: v })}
          state={good ? "good" : tooLong ? "bad" : "idle"}
          icon="lock"
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
        {/* The app's own strength words carry it; the mark only repeats them (never colour alone). */}
        <View
          accessibilityLiveRegion="polite"
          style={{ flexDirection: "row", alignItems: "flex-start", gap: tSpace[1.5] }}
        >
          {good ? (
            <Mark kind="tick" size={16} />
          ) : tooLong ? (
            <Mark kind="triangle" size={16} />
          ) : typed ? (
            <Mark kind="ring" size={16} color={t.ink3} />
          ) : null}
          <Text
            style={[
              tType.bodyS,
              {
                flexShrink: 1,
                lineHeight: 17,
                fontFamily: typed ? tFont.semibold : tFont.medium,
                color: typed ? t.ink : t.ink3,
              },
            ]}
          >
            {strength.hint}
          </Text>
        </View>
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
  review,
  onChange,
  on = signupFromAppOn,
}: {
  draft: SignupDraft;
  patch: Patch;
  notice: SignupNotice | null;
  loading: boolean;
  onRetry: () => void;
  /** "Your details": the three finished steps (`reviewRows`). */
  review: readonly ReviewRow[];
  /** Go back to a finished step to change it. */
  onChange: (step: Step) => void;
  /** Whether sign-up from the app is switched on (the build names the web origin). */
  on?: boolean;
}) {
  const t = useTide();
  const [full, setFull] = useState(false);
  const live = notice?.notice ?? null;
  return (
    <View style={{ gap: tSpace[3.5] }}>
      <StepHeading title="Your consent" sub="Please read this before we create your account." />
      {!on ? (
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
          <View style={{ alignItems: "flex-start" }}>
            <QuietLink label="Try again" onPress={onRetry} />
          </View>
        </View>
      ) : !notice.open ? (
        <Note tone="plain">Sign-up is not open yet. Please try again later.</Note>
      ) : (
        <>
          <Card padding={tSpace[4]}>
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
            <View style={{ alignItems: "flex-start" }}>
              <QuietLink
                label={
                  full
                    ? "Hide the full notice"
                    : `Read the full notice (${live.version}, effective ${live.effective})`
                }
                onPress={() => setFull((f) => !f)}
              />
            </View>
          </Card>
          <CheckRow
            tone="ink"
            checked={draft.consent}
            onToggle={() => patch({ consent: !draft.consent })}
            title={notice.agree}
            sub="Required to create your account"
          />
          {notice.sms ? (
            <CheckRow
              tone="ink"
              checked={draft.sms}
              onToggle={() => patch({ sms: !draft.sms })}
              title={notice.sms.label}
              sub={`${notice.sms.body} ${notice.sms.declined} ${notice.sms.receipt}`}
            />
          ) : null}
        </>
      )}
      <ReviewCard rows={review} onChange={onChange} />
    </View>
  );
}

/**
 * A tick box as a whole card: the hit area is the sentence, not the 24pt square. `ink` is sign-up's, where
 * the ticked box is navy so the page keeps one lagoon fill; `accent` is the look every other screen has.
 */
export function CheckRow({
  checked,
  onToggle,
  title,
  sub,
  tone = "accent",
}: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  sub?: string;
  tone?: "accent" | "ink";
}) {
  const t = useTide();
  const fill = tone === "ink" ? t.primary : t.accentPressed;
  const tick = tone === "ink" ? t.onPrimary : t.onAccent;
  const edge = checked ? `2px ${fill}` : tone === "ink" ? `1px ${t.line}` : `2px ${t.line}`;
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
        boxShadow: `inset 0px 0px 0px ${edge}`,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          backgroundColor: checked ? fill : t.surface,
          boxShadow: `inset 0px 0px 0px 2px ${checked ? fill : t.lineStrong}`,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <Icon name="check" size={16} color={tick} strokeWidth={3} /> : null}
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

/**
 * "Your details": what the three finished steps hold, each with a way back to change it. It is given rows
 * (`reviewRows`), never the draft, so the password cannot reach it.
 */
export function ReviewCard({
  rows,
  onChange,
}: {
  rows: readonly ReviewRow[];
  onChange: (step: Step) => void;
}) {
  const t = useTide();
  return (
    <View
      style={{
        borderRadius: tRadius.cardLg,
        backgroundColor: t.surface,
        boxShadow: t.shadow.card,
      }}
    >
      <Text
        accessibilityRole="header"
        style={[
          tType.label,
          {
            paddingHorizontal: tSpace[4],
            paddingTop: tSpace[3.5],
            paddingBottom: tSpace[1.5],
            fontFamily: tFont.bold,
            fontSize: 15,
            color: t.ink,
          },
        ]}
      >
        Your details
      </Text>
      {rows.map((r) => (
        <View
          key={r.step}
          style={{
            minHeight: 60,
            paddingVertical: tSpace[1],
            paddingLeft: tSpace[4],
            paddingRight: tSpace[1.5],
            flexDirection: "row",
            alignItems: "center",
            gap: tSpace[3],
            borderTopWidth: 1,
            borderTopColor: t.line,
          }}
        >
          <Mark kind="tick" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[tType.bodyS, { lineHeight: 17, color: t.ink2 }]}>{r.name}</Text>
            {r.value ? (
              <Text numberOfLines={1} style={[tType.label, { fontSize: 15, color: t.ink }]}>
                {r.value}
              </Text>
            ) : null}
          </View>
          <Press
            onPress={() => onChange(r.step)}
            accessibilityRole="link"
            accessibilityLabel={`Change ${r.name}`}
            style={{ minHeight: 48, paddingHorizontal: tSpace[2.5], justifyContent: "center" }}
          >
            <Text style={[tType.labelS, { fontSize: 15, color: t.accentText }]}>Change</Text>
          </Press>
        </View>
      ))}
    </View>
  );
}

/* ─── Creating, and done ─────────────────────────────────────────────── */

const DISC = 84;

/**
 * The line that runs in from the left edge to the middle of the page. While the account is being made it
 * ends at an empty ring and a small mark keeps moving along it; when it is made the line is drawn in ink
 * and ends at the tick. No percent and no countdown: the app does not know how long the answer takes.
 */
export function FinishMark({ state }: { state: "creating" | "done" }) {
  const t = useTide();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const half = width / 2;
  const line = {
    position: "absolute",
    left: 0,
    top: DISC / 2 - 2,
    width: half,
    height: 3,
  } as const;
  const disc = {
    position: "absolute",
    left: half - DISC / 2,
    top: 0,
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
  } as const;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: DISC, marginTop: tSpace[6], marginHorizontal: -tSpace[5] }}
    >
      {state === "creating" ? (
        <>
          <View style={[line, { backgroundColor: t.lineStrong, overflow: "hidden" }]}>
            {reduced ? null : (
              <Animated.View
                style={[
                  { width: half * 0.4, height: 3, borderRadius: 2, backgroundColor: t.ink },
                  motion.glint(half, reduced),
                ]}
              />
            )}
          </View>
          <View
            style={[disc, { borderWidth: 3, borderColor: t.lineStrong, backgroundColor: t.bg }]}
          />
        </>
      ) : (
        <>
          <Animated.View
            style={[
              line,
              { backgroundColor: t.ink, transformOrigin: "0% 50%" },
              motion.lineDraw(100, reduced),
            ]}
          />
          <Animated.View
            style={[
              disc,
              { backgroundColor: t.primary, alignItems: "center", justifyContent: "center" },
              motion.discIn(400, reduced),
            ]}
          >
            <Icon name="check" size={40} color={t.onPrimary} strokeWidth={2.4} />
          </Animated.View>
        </>
      )}
    </View>
  );
}

/** Shown while the account is being made: from "Create my account" until the server answers. */
export function CreatingStep() {
  const t = useTide();
  return (
    <View style={{ gap: tSpace[3.5] }}>
      <FinishMark state="creating" />
      <Text
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        style={[tType.display, { fontSize: 30, lineHeight: 34, color: t.ink, textAlign: "center" }]}
      >
        Creating your account
      </Text>
    </View>
  );
}

/** A preview only: "Continue" signs in and Home opens the details screen with these inputs. */
const LATER = [
  "Photo",
  "Title",
  "Preferred language",
  "Usual hospital",
  "National ID",
  "Next of kin",
];

export function DoneStep({ firstName }: { firstName: string }) {
  const t = useTide();
  return (
    <View style={{ gap: tSpace[3.5] }}>
      <FinishMark state="done" />
      <View style={{ alignItems: "center", gap: tSpace[3] }}>
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
          Your account is ready. Your {BRAND} number is given at your first visit.
        </Text>
      </View>
      <Card padding={tSpace[4]}>
        <Text
          accessibilityRole="header"
          style={[tType.labelS, { fontFamily: tFont.bold, fontSize: 15, color: t.ink }]}
        >
          Next, a few details
        </Text>
        <Text style={[tType.bodyS, { lineHeight: 19, color: t.ink2 }]}>
          About 2 minutes · all optional
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
              <Text style={[tType.caption, { fontSize: 13, color: t.ink }]}>{w}</Text>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}
