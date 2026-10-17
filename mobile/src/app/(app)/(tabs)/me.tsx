import type { IconName } from "@/components/tide";
import type { HouseholdMember } from "@/lib/booking";
import type { ThemePreference } from "@/theme/theme";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import { useFocusEffect, useRouter } from "expo-router";
import { Image, Linking, Switch, Text, View } from "react-native";

import { Avatar, Button, HealthCard, Icon, Press, Screen, TextLink } from "@/components/tide";
import {
  cardNumber,
  initials,
  meDemo,
  metaName,
  sexLetter,
  useCardIdentity,
  useMePrefs,
} from "@/data/me";
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
import { useTheme, useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * Me (board TMe/DMe, §8.6, F-20): the health card, my health, the people I
 * book for, privacy, and the phone's settings.
 *
 * Real: name (auth metadata), patient code, home facility and sex (profile,
 * cached for the offline card), the household, photo, SMS consent, push
 * permission, theme and sign out (everything the old Settings tab did).
 * Demo until Gate CG (law L2): conditions, allergies, medicines, primary
 * doctor, emergency contact, record openings, payments, the share switch.
 * Language and text size are stored on this phone only.
 */
export default function MeTab() {
  const t = useTide();
  const router = useRouter();
  const { session, signOut } = useSession();
  const { preference, setPreference } = useTheme();
  const [prefs, setPrefs] = useMePrefs();
  const name = metaName(session?.user.user_metadata);
  const id = useCardIdentity(session?.user.id ?? null, name);
  // A+ applies to this screen's rows (board: zoom 1.12).
  const z = (n: number) => Math.round(n * (prefs.big ? 1.12 : 1));

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

  return (
    <Screen title="Me" underNav demo={meDemo.demo} helpSource="me" gap={tSpace[2.5]}>
      <HealthCard
        data={{
          holder: id.name ?? "Name not recorded",
          number: cardNumber(id.code),
          facility: id.facility ?? "No home facility yet",
          doctor: meDemo.primaryDoctor,
          conditions: prefs.showConditionsOnCard ? meDemo.conditionsShort : null,
          allergies: meDemo.allergies,
          bloodGroup: meDemo.bloodGroup,
          contact: meDemo.contact,
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
            Tap the card to flip · works offline
          </Text>
        </View>
        {sex ? (
          <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3 }]}>{sex}</Text>
        ) : null}
      </View>

      <Label text="My health" z={z} />
      <Group>
        <Row
          z={z}
          first
          icon="heart"
          color={t.area.readings}
          title="My conditions"
          sub={meDemo.conditions.join(" · ")}
        />
        <Row
          z={z}
          icon="alert"
          color={t.ink2}
          title="Allergies"
          sub={`${meDemo.allergies} · tell your nurse if this is wrong`}
        />
        <Row
          z={z}
          icon="pill"
          color={t.area.medicines}
          title="My medicines"
          sub={meDemo.medicinesLine}
          onPress={() => router.push("/care/medicines")}
        />
        <Row
          z={z}
          icon="file"
          color={t.area.team}
          title="Visits and documents"
          sub="Lab results, letters, receipts"
          onPress={() => router.push("/care/labs")}
        />
      </Group>

      <Label text="People I care for" z={z} />
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
              fontSize: z(12),
              lineHeight: z(17),
              color: t.ink2,
              padding: tSpace[3.5],
              paddingTop: tSpace[2],
            },
          ]}
        >
          Their readings, medicines and visits are kept separate.
        </Text>
      </Group>

      <Label text="Privacy and sharing" z={z} />
      <Group>
        <Row
          z={z}
          first
          icon="shield"
          color={t.accentText}
          title="Share my readings with my care team"
          sub="They see them between visits"
          right={
            <Toggle
              label="Share my readings"
              on={prefs.shareReadings}
              onChange={(v) => setPrefs({ shareReadings: v })}
            />
          }
        />
        <Row
          z={z}
          icon="card"
          color={t.ink2}
          title="Show conditions on my card"
          sub={
            prefs.showConditionsOnCard
              ? "Shown on the back of the card"
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
          z={z}
          icon="eye"
          color={t.area.team}
          title="Who has opened my records"
          sub={meDemo.lastOpened}
        />
        <Row z={z} icon="user" color={t.ink} title="Emergency contact" sub={meDemo.contactLong} />
      </Group>

      <Label text="App" z={z} />
      <Group>
        <Row
          z={z}
          first
          icon="bell"
          color={t.accentText}
          title="Notifications"
          sub="App and SMS"
          onPress={() => router.push("/notifications")}
        />
        {push !== null ? (
          <Row
            z={z}
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
            z={z}
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
          z={z}
          icon="globe"
          color={t.area.readings}
          title="Language"
          sub={prefs.lang === "en" ? "English · voice calls too" : "Luganda · voice calls too"}
          right={
            <MiniSeg
              label="Language"
              value={prefs.lang}
              onChange={(lang) => setPrefs({ lang })}
              options={[
                { key: "en", label: "English" },
                { key: "lg", label: "Luganda" },
              ]}
            />
          }
        />
        <Row
          z={z}
          icon="type"
          color={t.ink2}
          title="Text size"
          sub={prefs.big ? "Larger · easier to read" : "Standard"}
          right={
            <MiniSeg
              label="Text size"
              value={prefs.big ? "big" : "std"}
              onChange={(k) => setPrefs({ big: k === "big" })}
              options={[
                { key: "std", label: "A" },
                { key: "big", label: "A+" },
              ]}
            />
          }
        />
        <Row
          z={z}
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
          z={z}
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
        <Row z={z} icon="wallet" color={t.ink2} title="Payments" sub={meDemo.payments} />
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
        MedSync 3.0
      </Text>
    </Screen>
  );
}

function Label({ text, z }: { text: string; z: (n: number) => number }) {
  const t = useTide();
  return (
    <Text
      accessibilityRole="header"
      style={[
        tType.labelS,
        {
          fontSize: z(13),
          lineHeight: z(18),
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
  z,
}: {
  icon: IconName;
  color: string;
  title: string;
  sub: string;
  note?: string | null;
  onPress?: () => void;
  right?: ReactNode;
  first?: boolean;
  z: (n: number) => number;
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
        <Text style={[tType.labelS, { fontSize: z(14), lineHeight: z(19), color: t.ink }]}>
          {title}
        </Text>
        <Text
          style={[
            tType.caption,
            { fontFamily: tFont.medium, fontSize: z(12), lineHeight: z(17), color: t.ink2 },
          ]}
        >
          {sub}
        </Text>
        {note ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[tType.caption, { fontSize: z(12), lineHeight: z(17), color: t.ink }]}
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
