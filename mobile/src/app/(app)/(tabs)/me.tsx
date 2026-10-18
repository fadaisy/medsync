import type { IconName } from "@/components/tide";
import type { HouseholdMember } from "@/lib/booking";
import type { ThemePreference } from "@/theme/theme";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
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
import {
  AVATAR_PICKER_OPTIONS,
  fetchHousehold,
  fetchMyAvatarUrl,
  uploadAvatar,
} from "@/lib/booking";
import { SMS_CONSENT_COPY } from "@/lib/consent-copy";
import { fetchSmsConsent, setSmsConsent } from "@/lib/notifications";
import { registerPushToken } from "@/lib/push";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/use-now";
import { useTheme, useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * Me (board TMe/DMe, §8.6, F-20): the health card, my health, the people I
 * book for, privacy, and the phone's settings.
 *
 * All real: name (auth metadata), patient code, home facility, sex and age
 * (cached for the offline card); the conditions, allergies and family history
 * the patient reports from the clerking desk's catalogue (ADR 0355, cached
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
      void Notifications.getPermissionsAsync().then(
        (p) =>
          setPush(
            p.status === "granted" ? "granted" : p.status === "denied" ? "denied" : "undetermined",
          ),
        () => {},
      );
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
    const status = token ? "granted" : (await Notifications.getPermissionsAsync()).status;
    setPush(status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined");
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

  return (
    <Screen title="Me" underNav helpSource="me" gap={tSpace[2.5]}>
      <HealthCard
        data={{
          holder: id.name ?? "Name not recorded",
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

      <Label text="My health" />
      <Group>
        <Row
          first
          icon="heart"
          color={t.area.readings}
          title="My conditions"
          sub={historySub(history.conditions.length, "condition", "conditions", "None added yet")}
          onPress={() => router.push("/history?section=conditions")}
        />
        <Row
          icon="alert"
          color={t.ink2}
          title="Allergies"
          sub={
            !history.allergies.length && history.noKnownAllergies
              ? "No known allergies"
              : historySub(history.allergies.length, "allergy", "allergies", "None added yet")
          }
          onPress={() => router.push("/history?section=allergies")}
        />
        <Row
          icon="users"
          color={t.area.team}
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
          icon="pill"
          color={t.area.medicines}
          title="My medicines"
          sub={
            medCount === 0
              ? "None on your list yet"
              : `${medCount} ${medCount === 1 ? "medicine" : "medicines"} on your list`
          }
          onPress={() => router.push("/care/medicines")}
        />
        <Row
          icon="file"
          color={t.area.team}
          title="Visits and documents"
          sub="What your clinician shared after a visit"
          onPress={() => router.push("/records")}
        />
      </Group>

      <Label text="People I care for" />
      <Group>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: tSpace[2.5],
            paddingHorizontal: tSpace[3.5],
            paddingTop: tSpace[3],
          }}
        >
          <Person label="Me" selected>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                accessibilityIgnoresInvertColors
                style={{ width: 48, height: 48, borderRadius: 24 }}
              />
            ) : (
              <Avatar initials={initials(name)} size={48} />
            )}
          </Person>
          {household.map((m) => (
            <Person key={m.id} label={m.label} onPress={() => router.push("/household")}>
              <Avatar initials={initials(m.label)} size={48} bg={t.place.tint} fg={t.place.text} />
            </Person>
          ))}
          <Person label="Add" onPress={() => router.push("/household")}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                borderWidth: 1.5,
                borderColor: t.lineStrong,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="plus" size={20} color={t.ink} />
            </View>
          </Person>
        </View>
        <Text
          style={[
            tType.caption,
            {
              fontFamily: tFont.medium,
              fontSize: 12,
              lineHeight: 17,
              color: t.ink2,
              padding: tSpace[3.5],
              paddingTop: tSpace[2],
            },
          ]}
        >
          Their readings, medicines and visits are kept separate.
        </Text>
      </Group>

      <Label text="My places" />
      <Group>
        <Row
          first
          icon="mapPin"
          color={t.ink2}
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

      <Label text="My details" />
      <Group>
        <Row
          first
          icon="user"
          color={t.ink2}
          title="Profile details"
          sub="Photo, title, language, hospital, ID and next of kin"
          onPress={() => router.push("/profile/details")}
        />
      </Group>

      <Label text="Privacy and sharing" />
      <Group>
        <Row
          first
          icon="card"
          color={t.ink2}
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
          icon="eye"
          color={t.accentText}
          title="Who sees what you log"
          sub="Your care team sees your readings and what you add under My health. Your medicines and doses stay on your account only."
        />
      </Group>

      <Label text="App" />
      <Group>
        <Row
          first
          icon="bell"
          color={t.accentText}
          title="Notifications"
          sub="App and SMS"
          onPress={() => router.push("/notifications")}
        />
        {push !== null ? (
          <Row
            icon="smartphone"
            color={t.ink2}
            title={`Notifications on this phone · ${push === "granted" ? "On" : "Off"}`}
            sub={
              push === "granted"
                ? "Your confirmations, reminders and offers arrive here first."
                : push === "denied"
                  ? "MedSync is not allowed to notify you. Turn it on in your phone's Settings."
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
            icon="message"
            color={t.ink2}
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
        <Row
          icon="globe"
          color={t.area.readings}
          title="Language"
          sub={
            language
              ? `${language} · the language staff use with you`
              : "Tell staff which language you prefer"
          }
          onPress={() => router.push("/profile/details")}
        />
        <Row
          icon="type"
          color={t.ink2}
          title="Text size"
          sub="Follows your phone. Make text larger in your phone's Settings, under Display."
        />
        <Row
          icon={t.scheme === "dark" ? "moon" : "sun"}
          color={t.ink2}
          title="Theme"
          sub={preference === "system" ? "Same as phone" : preference === "dark" ? "Dark" : "Light"}
          right={
            <MiniSeg<ThemePreference>
              label="Theme"
              value={preference}
              onChange={setPreference}
              options={[
                { key: "system", label: "System" },
                { key: "light", label: "Light" },
                { key: "dark", label: "Dark" },
              ]}
            />
          }
        />
        <Row
          icon="camera"
          color={t.ink2}
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
        {`MedSync ${Constants.expoConfig?.version ?? ""}`.trim()}
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
        tType.labelS,
        {
          fontSize: 13,
          lineHeight: 18,
          color: t.ink3,
          paddingTop: tSpace[1.5],
          paddingHorizontal: tSpace[1],
        },
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

/** One settings row: a square icon, a title over a line, and a control or a chevron. */
function Row({
  icon,
  color,
  title,
  sub,
  note,
  onPress,
  right,
  first = false,
}: {
  icon: IconName;
  color: string;
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
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: tRadius.sm,
          backgroundColor: t.surface2,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[tType.labelS, { fontSize: 14, lineHeight: 19, color: t.ink }]}>{title}</Text>
        <Text
          style={[
            tType.caption,
            { fontFamily: tFont.medium, fontSize: 12, lineHeight: 17, color: t.ink2 },
          ]}
        >
          {sub}
        </Text>
        {note ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[tType.caption, { fontSize: 12, lineHeight: 17, color: t.ink }]}
          >
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
    minHeight: 56,
    paddingVertical: 11,
    paddingHorizontal: tSpace[3.5],
    borderTopWidth: first ? 0 : 1,
    borderTopColor: t.surface3,
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

/** A small pill segment inside a row: English / Luganda, A / A+, System / Light / Dark. */
function MiniSeg<K extends string>({
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
        padding: 3,
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
            hitSlop={{ top: 8, bottom: 8 }}
            style={{
              height: 30,
              paddingHorizontal: tSpace[2.5],
              borderRadius: tRadius.pill,
              justifyContent: "center",
              backgroundColor: on ? t.surface : "transparent",
              boxShadow: on ? t.shadow.card : undefined,
            }}
          >
            <Text style={[tType.caption, { color: on ? t.ink : t.ink2 }]}>{o.label}</Text>
          </Press>
        );
      })}
    </View>
  );
}

/** One person in "People I care for": avatar over a name. */
function Person({
  label,
  children,
  selected = false,
  onPress,
}: {
  label: string;
  children: ReactNode;
  selected?: boolean;
  onPress?: () => void;
}) {
  const t = useTide();
  return (
    <Press
      onPress={onPress}
      disabled={!onPress}
      accessibilityLabel={selected ? `${label}, selected` : label}
      accessibilityState={{ selected }}
      haptic={false}
      style={{ width: 64, alignItems: "center", gap: tSpace[1] }}
    >
      <View
        style={{
          borderRadius: 28,
          padding: 2,
          borderWidth: 2,
          borderColor: selected ? t.accent : "transparent",
        }}
      >
        {children}
      </View>
      <Text numberOfLines={1} style={[tType.caption, { color: label === "Add" ? t.ink2 : t.ink }]}>
        {label}
      </Text>
    </Press>
  );
}
