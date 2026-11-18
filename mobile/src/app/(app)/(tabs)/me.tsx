import type { HouseholdMember } from "@/lib/booking";
import type { ThemePreference } from "@/theme/theme";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { Image, Linking, Switch, Text, View } from "react-native";

import { Avatar, Button, HealthCard, Icon, Press, Screen, TextLink } from "@/components/tide";
import { useHistory } from "@/data/history";
import {
  ageWords,
  cardNumber,
  initials,
  metaName,
  sexLetter,
  useCardIdentity,
  useMePrefs,
} from "@/data/me";
import { useMedicines } from "@/data/medicines";
import { placesSummary, usePlaces } from "@/data/places";
import { detailsFromAppOn, loadDetails } from "@/data/profile-details";
import { cardLines } from "@/features/history/logic";
import { HeaderAvatar } from "@/features/v2/header-avatar";
import { MeMembershipRoute } from "@/features/v2/me-membership";
import {
  AVATAR_PICKER_OPTIONS,
  fetchHousehold,
  fetchMyAvatarUrl,
  uploadAvatar,
} from "@/lib/booking";
import { BRAND } from "@/lib/brand";
import { SMS_CONSENT_COPY } from "@/lib/consent-copy";
import { fetchSmsConsent, setSmsConsent } from "@/lib/notifications";
import { pushPermission, registerPushToken } from "@/lib/push";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/use-now";
import { useTheme, useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * Me (board TMe/DMe, §8.6, F-20; regrouped 18 Nov 2026 from the owner's approved prototype): who this is,
 * the one membership card with a line that opens the plans (`/plans`), my health with the offline health
 * card, the people I book for, privacy, notifications, this phone's settings and my details.
 *
 * All real: name (auth metadata), patient code, home facility, sex and age
 * (cached for the offline card); the conditions, allergies and family history
 * the patient reports from the clerking desk's catalogue (ADR 0414, cached
 * too), which the desk shows as patient-reported for a clinician to confirm;
 * their medicines list, the household, photo, SMS consent, push permission,
 * theme and sign out. The card's back says whether a next of kin is on file
 * (the number is encrypted server-side) and who to call if it is found. No
 * primary doctor, blood group or payment method is shown: the phone holds
 * none of them truthfully. Language is the preferred language saved on the
 * profile (Profile details edits it); the app's own words are English, and
 * text size follows the phone's setting, so neither is a switch here.
 */
export default function MeTab() {
  const t = useTide();
  const router = useRouter();
  const { session, signOut } = useSession();
  const { preference, setPreference } = useTheme();
  const [prefs, setPrefs] = useMePrefs();
  const name = metaName(session?.user.user_metadata);
  const id = useCardIdentity(session?.user.id ?? null, name);
  const now = useNow();
  const meds = useMedicines(now);
  const places = usePlaces();
  const history = useHistory();
  const [nokOnFile, setNokOnFile] = useState<boolean | null>(null);
  const [language, setLanguage] = useState<string | null>(null);

  const [household, setHousehold] = useState<HouseholdMember[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [smsOn, setSmsOn] = useState<boolean | null>(null);
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [push, setPush] = useState<"granted" | "denied" | "undetermined" | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // On focus: coming back from "Add" shows the new person. Each read is a
  // convenience; a failure leaves its row as it was and says nothing.
  useFocusEffect(
    useCallback(() => {
      void fetchHousehold().then(setHousehold, () => {});
      void fetchMyAvatarUrl().then(setAvatarUrl, () => {});
      void fetchSmsConsent().then(setSmsOn, () => {});
      if (detailsFromAppOn)
        void loadDetails().then(
          (r) => {
            if (!r.ok) return;
            setNokOnFile(r.onFile.nokOnFile);
            setLanguage(r.onFile.preferredLanguage?.trim() || null);
          },
          () => {},
        );
      // Null where push is not available (Expo Go on Android): the row hides.
      void pushPermission().then(setPush, () => {});
    }, []),
  );

  const toggleSms = async () => {
    if (smsOn === null || smsBusy) return;
    setSmsBusy(true);
    setSmsError(null);
    const res = await setSmsConsent(!smsOn);
    setSmsBusy(false);
    if (!res.ok) setSmsError(res.error);
    else setSmsOn(res.data.on);
  };

  // After a refusal only the phone's own Settings can turn push on.
  const onPush = async () => {
    if (push === "denied") {
      await Linking.openSettings();
      return;
    }
    const token = await registerPushToken();
    setPush(token ? "granted" : await pushPermission());
  };

  const onChangePhoto = async () => {
    if (uploading) return;
    setPhotoError(null);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync(AVATAR_PICKER_OPTIONS);
      const asset = picked.canceled ? null : picked.assets[0];
      if (!asset) return;
      setUploading(true);
      setAvatarUrl(await uploadAvatar(asset.uri, asset.mimeType ?? "image/jpeg"));
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "Couldn't save your photo. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      // The gate drops this screen the moment the session is gone.
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  const sex = sexLetter(id.sex);
  const card = cardLines(history, id.conditions);
  const medCount = meds.medicines.length;
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const historySub = (n: number, one: string, many: string, none: string) =>
    history.off ? "Not switched on yet" : n ? `${count(n, one, many)} · not yet confirmed` : none;
  const facilityName = id.facility ?? "any hospital";

  const holder = id.name ?? "Name not recorded";

  return (
    <Screen
      title="Me"
      underNav
      helpSource="me"
      gap={tSpace[2.5]}
      // Patient app v2 (1.3): the avatar carries the unseen count on every place.
      headerRight={<HeaderAvatar />}
    >
      {/* Who this is, and the way to their details. */}
      <Press
        onPress={() => router.push("/profile/details")}
        haptic={false}
        accessibilityRole="link"
        accessibilityLabel={`Profile details. ${holder}${id.facility ? `, ${id.facility}` : ""}`}
        style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: tSpace[3.5] }}
      >
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            accessibilityIgnoresInvertColors
            style={{ width: 56, height: 56, borderRadius: 28 }}
          />
        ) : (
          <Avatar initials={initials(name)} size={56} />
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={[tType.heading, { color: t.ink }]}>
            {holder}
          </Text>
          {id.facility ? (
            <Text numberOfLines={1} style={[tType.bodyS, { color: t.ink2 }]}>
              {id.facility}
            </Text>
          ) : null}
        </View>
        <Icon name="forward" size={18} color={t.ink3} />
      </Press>

      {/* The one card at the top, and one line that opens the plans (`/plans`). */}
      <MeMembershipRoute
        part="card"
        onSeePlans={() => router.push("/plans")}
        name={holder}
        code={id.code}
        id={{
          emergencyContact: nokOnFile ? "Next of kin on file" : "—",
          bloodGroup: null,
          allergies: card.allergies === "None listed" ? [] : [card.allergies],
          conditions: card.conditions === "None listed" ? [] : [card.conditions],
          hospitalLine: id.facility ?? "—",
        }}
      />

      <Label text="My health" />
      <Group>
        <Row
          first
          title="My conditions"
          sub={historySub(history.conditions.length, "condition", "conditions", "None added yet")}
          onPress={() => router.push("/history?section=conditions")}
        />
        <Row
          title="Allergies"
          sub={
            !history.allergies.length && history.noKnownAllergies
              ? "No known allergies"
              : historySub(history.allergies.length, "allergy", "allergies", "None added yet")
          }
          onPress={() => router.push("/history?section=allergies")}
        />
        <Row
          title="Family history"
          sub={historySub(
            history.family.length,
            "family condition",
            "family conditions",
            "Conditions that run in your family",
          )}
          onPress={() => router.push("/history?section=family")}
        />
        <Row
          title="My medicines"
          sub={
            medCount === 0
              ? "None on your list yet"
              : `${medCount} ${medCount === 1 ? "medicine" : "medicines"} on your list`
          }
          onPress={() => router.push("/care/medicines")}
        />
        <Row
          title="Visits and documents"
          sub="What your clinician shared after a visit"
          onPress={() => router.push("/records")}
        />
      </Group>

      {/*
        The health card that works with no signal: what a stranger or a medic reads if the phone is found.
        It stays whole, under My health; the card at the top is the one that carries the plan and the code.
      */}
      <HealthCard
        data={{
          holder,
          number: cardNumber(id.code),
          facility: id.facility,
          age: ageWords(id.dob, now),
          conditions: prefs.showConditionsOnCard ? card.conditions : null,
          allergies: card.allergies,
          nextOfKin:
            nokOnFile === null
              ? null
              : nokOnFile
                ? `On file${id.facility ? ` at ${id.facility}` : ""}`
                : "None given",
          ifFound:
            id.emergencyPhone && id.facility
              ? `If found, call ${id.facility} on ${id.emergencyPhone}`
              : `If found, please return it to ${facilityName}`,
        }}
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: tSpace[1],
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1.5] }}>
          <Icon name="replay" size={13} color={t.ink3} />
          <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3 }]}>
            Tap the card to turn it over · works offline
          </Text>
        </View>
        {sex ? (
          <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3 }]}>{sex}</Text>
        ) : null}
      </View>

      <Label text="People I care for" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[2] }}>
        {household.map((m) => (
          <Press
            key={m.id}
            onPress={() => router.push("/household")}
            haptic={false}
            accessibilityLabel={m.label}
            style={{
              height: 48,
              paddingLeft: tSpace[1.5],
              paddingRight: tSpace[4],
              borderRadius: tRadius.pill,
              flexDirection: "row",
              alignItems: "center",
              gap: tSpace[2],
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.lineStrong,
            }}
          >
            <Avatar initials={initials(m.label)} size={36} bg={t.place.tint} fg={t.place.text} />
            <Text numberOfLines={1} style={[tType.label, { fontSize: 15, color: t.ink }]}>
              {m.label}
            </Text>
          </Press>
        ))}
        <Press
          onPress={() => router.push("/household")}
          haptic={false}
          accessibilityLabel="Add"
          style={{
            height: 48,
            paddingLeft: tSpace[3],
            paddingRight: tSpace[4],
            borderRadius: tRadius.pill,
            flexDirection: "row",
            alignItems: "center",
            gap: tSpace[1.5],
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: t.lineStrong,
          }}
        >
          <Icon name="plus" size={18} color={t.ink2} strokeWidth={2} />
          <Text style={[tType.label, { fontSize: 15, color: t.ink2 }]}>Add</Text>
        </Press>
      </View>
      <Text
        style={[
          tType.caption,
          { fontFamily: tFont.medium, color: t.ink2, paddingHorizontal: tSpace[1] },
        ]}
      >
        Their readings, medicines and visits are kept separate.
      </Text>

      <Label text="Privacy and sharing" />
      <Group>
        <Row
          first
          title="Show conditions on my card"
          sub={
            prefs.showConditionsOnCard
              ? "Shown on the back of the card. Private ones never are."
              : "Hidden on the back of the card"
          }
          right={
            <Toggle
              label="Show conditions on my card"
              on={prefs.showConditionsOnCard}
              onChange={(v) => setPrefs({ showConditionsOnCard: v })}
            />
          }
        />
        <Row
          title="Who sees what you log"
          sub="Your care team sees your readings and what you add under My health. Your medicines and doses stay on your account only."
        />
      </Group>

      <Label text="Notifications" />
      <Group>
        <Row
          first
          title="Notifications"
          sub="App and SMS"
          onPress={() => router.push("/notifications")}
        />
        {push !== null ? (
          <Row
            title={`Notifications on this phone · ${push === "granted" ? "On" : "Off"}`}
            sub={
              push === "granted"
                ? "Your confirmations, reminders and offers arrive here first."
                : push === "denied"
                  ? `${BRAND} is not allowed to notify you. Turn it on in your phone's Settings.`
                  : "Allow notifications so your reminders and offers reach this phone."
            }
            right={
              push !== "granted" ? (
                <TextLink
                  label={push === "denied" ? "Open Settings" : "Allow"}
                  onPress={() => void onPush()}
                />
              ) : undefined
            }
          />
        ) : null}
        {smsOn !== null ? (
          <Row
            title={`${SMS_CONSENT_COPY.label} · ${smsOn ? "On" : "Off"}`}
            sub={
              smsOn
                ? SMS_CONSENT_COPY.what
                : `${SMS_CONSENT_COPY.declined} ${SMS_CONSENT_COPY.receiptException}`
            }
            note={smsError}
            right={
              <Toggle
                label={SMS_CONSENT_COPY.label}
                on={smsOn}
                busy={smsBusy}
                onChange={() => void toggleSms()}
              />
            }
          />
        ) : null}
      </Group>

      <Label text="This phone" />
      <Group>
        <View style={{ padding: tSpace[4], gap: tSpace[2.5] }}>
          <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>Theme</Text>
          <SegTrack<ThemePreference>
            label="Theme"
            value={preference}
            onChange={setPreference}
            options={[
              { key: "system", label: "System" },
              { key: "light", label: "Light" },
              { key: "dark", label: "Dark" },
            ]}
          />
        </View>
        <Row
          title="Language"
          sub={
            language
              ? `${language} · the language staff use with you`
              : "Tell staff which language you prefer"
          }
          onPress={() => router.push("/profile/details")}
        />
        <Row
          title="Text size"
          sub="Follows your phone. Make text larger in your phone's Settings, under Display."
        />
      </Group>

      <Label text="My details" />
      <Group>
        <Row
          first
          title="Profile details"
          sub="Photo, title, language, hospital, ID and next of kin"
          onPress={() => router.push("/profile/details")}
        />
        <Row
          title="Profile photo"
          sub="Shown with your name in the app"
          note={photoError}
          right={
            <TextLink
              label={uploading ? "Saving…" : "Change"}
              onPress={() => void onChangePhoto()}
            />
          }
        />
        <Row
          title="Home, work and others"
          sub={
            places.off
              ? "Saving places is not switched on yet"
              : places.loading
                ? "Loading…"
                : `${placesSummary(places.places)} · only you can see them`
          }
          onPress={() => router.push("/places")}
        />
      </Group>

      <Button
        label="Sign out"
        variant="outline"
        busy={signingOut}
        onPress={() => void onSignOut()}
        style={{ marginTop: tSpace[2] }}
      />
      <Text
        style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3, textAlign: "center" }]}
      >
        {`${BRAND} ${Constants.expoConfig?.version ?? ""}`.trim()}
      </Text>
    </Screen>
  );
}

function Label({ text }: { text: string }) {
  const t = useTide();
  return (
    <Text
      accessibilityRole="header"
      style={[
        tType.overline,
        { color: t.ink3, paddingTop: tSpace[3], paddingHorizontal: tSpace[1] },
      ]}
    >
      {text}
    </Text>
  );
}

function Group({ children }: { children: ReactNode }) {
  const t = useTide();
  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderRadius: tRadius.cardLg,
        overflow: "hidden",
        boxShadow: t.shadow.card,
      }}
    >
      {children}
    </View>
  );
}

/** One settings row: a title over a line, and a control or a chevron. */
function Row({
  title,
  sub,
  note,
  onPress,
  right,
  first = false,
}: {
  title: string;
  sub: string;
  note?: string | null;
  onPress?: () => void;
  right?: ReactNode;
  first?: boolean;
}) {
  const t = useTide();
  const body = (
    <>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>{title}</Text>
        <Text style={[tType.bodyS, { color: t.ink2 }]}>{sub}</Text>
        {note ? (
          <Text accessibilityLiveRegion="polite" style={[tType.bodyS, { color: t.ink }]}>
            {note}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="forward" size={18} color={t.ink3} /> : null)}
    </>
  );
  const style = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: tSpace[3],
    minHeight: 60,
    paddingVertical: tSpace[2.5],
    paddingHorizontal: tSpace[4],
    borderTopWidth: first ? 0 : 1,
    borderTopColor: t.line,
  };
  if (onPress)
    return (
      <Press onPress={onPress} accessibilityLabel={`${title}. ${sub}`} haptic={false} style={style}>
        {body}
      </Press>
    );
  return <View style={style}>{body}</View>;
}

/** The phone's own switch, in Tide colours. The row's words carry the state too. */
function Toggle({
  label,
  on,
  onChange,
  busy = false,
}: {
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
  busy?: boolean;
}) {
  const t = useTide();
  return (
    <Switch
      accessibilityLabel={label}
      value={on}
      disabled={busy}
      onValueChange={onChange}
      trackColor={{ true: t.accentPressed, false: t.primaryOff }}
      thumbColor={t.onBand}
      ios_backgroundColor={t.primaryOff}
    />
  );
}

/** A full-width choice of a few: a sunken track, and the chosen one raised on it. System / Light / Dark. */
function SegTrack<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  const t = useTide();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        padding: 4,
        borderRadius: tRadius.pill,
        backgroundColor: t.surface3,
      }}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Press
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${label}: ${o.label}`}
            style={{
              flex: 1,
              height: 44,
              borderRadius: tRadius.pill,
              alignItems: "center",
              justifyContent: "center",
              // Raised, so the chosen one is lighter than the track in the dark scheme too.
              backgroundColor: on ? t.surfaceRaised : "transparent",
              boxShadow: on ? t.shadow.card : undefined,
            }}
          >
            <Text style={[tType.label, { fontSize: 15, color: on ? t.ink : t.ink2 }]}>
              {o.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}
