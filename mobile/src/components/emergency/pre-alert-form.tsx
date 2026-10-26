import type { EmergencySheet, PreArrivalInput, PreArrivalReceipt } from "@/lib/emergency";
import type { LatLng } from "@/lib/nearest";
import type { EtaBand, TransportMode } from "@shared/pre-arrival";
import type { SubmissionAudience } from "@shared/symptom-catalog/types";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  composeFacilitySms,
  ETA_BAND_LABEL,
  ETA_BANDS,
  TRANSPORT_MODES,
} from "@shared/pre-arrival";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { t } from "@shared/symptom-catalog/classify";
import * as Location from "expo-location";
import { Linking, Switch, Text, View } from "react-native";

import { Button, Chip, ChipRow, Icon, Press, Screen, TextField, TextLink } from "@/components/tide";
import { createPreArrival, e1Tiles, smsUrl, telUrl, writePendingPreArrival } from "@/lib/emergency";
import { orderFacilities } from "@/lib/nearest";
import { ForcedScheme, useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

/**
 * E2 — the pre-alert (PRD MS-PRD-SYM-001 §8.3, §8.6, §8.7). Every field is
 * pre-filled so Send is the second tap after "Tell a hospital I'm coming":
 * the nearest pre-alert-enabled facility (own first), "Me" when signed in,
 * the tiles picked on E1 or the catalog's picks, "Just now", boda, "15–30
 * min", the account's number. Nearest is computed ON DEVICE from the cached
 * facility list; the phone's location is asked for once, here and nowhere
 * else, and leaves the phone only on the explicit per-alert switch, which
 * exists only for a facility that runs its own ambulance (ruling 9).
 *
 * A refused send (`call_only`, `rate_limited`, anything) keeps the call
 * button up — calling is never blocked. An offline send is QUEUED (retried
 * while this screen is open) and the SMS fallback is offered when the
 * facility registered an SMS number: the patient's own SIM, no data.
 */
const AUDIENCES: SubmissionAudience[] = [
  "adult",
  "child_u2m",
  "child_2m_5y",
  "child_5_12",
  "pregnant",
];
const ONSET = [
  { key: "now", label: "Just now", minutesAgo: 0 },
  { key: "hour", label: "Within the hour", minutesAgo: 30 },
  { key: "today", label: "Earlier today", minutesAgo: 4 * 60 },
  { key: "longer", label: "Longer ago", minutesAgo: null },
] as const;
const LAST_WELL = [
  { key: "now", label: "Just now", minutesAgo: 0 },
  { key: "30", label: "30 min ago", minutesAgo: 30 },
  { key: "60", label: "1 h ago", minutesAgo: 60 },
  { key: "longer", label: "Longer", minutesAgo: null },
] as const;
const TRANSPORT_WORD: Record<TransportMode, string> = {
  boda: "Boda",
  car: "Car",
  taxi: "Taxi",
  ambulance: "Ambulance",
  walking: "Walking",
};
const RETRY_MS = 15_000;

/** Bands, not a clock (§8.3): a band's midpoint as an instant, or nothing for "longer". */
const agoIso = (minutes: number | null): string | undefined =>
  minutes === null ? undefined : new Date(Date.now() - minutes * 60_000).toISOString();

export function PreAlertForm(props: {
  sheet: EmergencySheet | null;
  hospitalId: string | null;
  /** Catalog item keys — E1's tiles or the pending catalog draft. */
  initialPicks: string[];
  submissionId?: string | null;
  signedIn: boolean;
  onSent: (receipt: PreArrivalReceipt) => void;
  onBack: () => void;
}) {
  return (
    <ForcedScheme scheme="light">
      <FormBody {...props} />
    </ForcedScheme>
  );
}

function FormBody({
  sheet,
  hospitalId,
  initialPicks,
  submissionId,
  signedIn,
  onSent,
  onBack,
}: Parameters<typeof PreAlertForm>[0]) {
  const tide = useTide();

  const [here, setHere] = useState<LatLng | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const ordered = orderFacilities(sheet?.facilities ?? [], here, hospitalId);
  const enabled = ordered.filter((o) => o.facility.preAlertEnabled).slice(0, 3);
  const callOnly = ordered.filter((o) => !o.facility.preAlertEnabled);

  const [facilityId, setFacilityId] = useState<string | null>(null);
  const facility =
    enabled.find((o) => o.facility.id === facilityId)?.facility ?? enabled[0]?.facility ?? null;

  const [who, setWho] = useState<"me" | SubmissionAudience>(signedIn ? "me" : "adult");
  const [picks, setPicks] = useState<string[]>(initialPicks);
  const [onset, setOnset] = useState<(typeof ONSET)[number]["key"]>("now");
  const [lastWell, setLastWell] = useState<(typeof LAST_WELL)[number]["key"]>("now");
  const [transport, setTransport] = useState<TransportMode>("boda");
  const [eta, setEta] = useState<EtaBand>("15_30");
  const [callback, setCallback] = useState("");
  const [share, setShare] = useState<LatLng | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  const items = new Map(CATALOG.items.map((i) => [i.key, i]));
  const choices = [...new Set([...initialPicks, ...e1Tiles().map((i) => i.key)])]
    .map((k) => items.get(k))
    .filter((i) => i !== undefined);
  const flags = new Set(picks.flatMap((k) => items.get(k)?.flags ?? []));
  const strokeFlag = flags.has("stroke_time");

  const togglePick = (key: string) =>
    setPicks((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  // Asked ONCE, from here only, and only when the patient asks for it.
  const locate = async (): Promise<LatLng | null> => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return null;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      return null;
    }
  };
  const sortByLocation = async () => {
    const at = await locate();
    setHere(at);
    setLocationNote(at ? "Sorted by distance." : "Location not available — sorted by name.");
  };
  const toggleShare = async (on: boolean) => {
    if (!on) return setShare(null);
    const at = here ?? (await locate());
    setShare(at);
    if (!at) setLocationNote("Location not available, so it will not be shared.");
  };

  const send = async () => {
    if (!facility || busy) return;
    const phone = callback.trim();
    if (!signedIn && !phone) {
      setError("A callback number is needed so the hospital can reach you.");
      return;
    }
    setBusy(true);
    setError(null);
    const input: PreArrivalInput = {
      facility_id: facility.id,
      submission_id: submissionId ?? undefined,
      subject:
        who === "me"
          ? { audience: "adult" }
          : { audience: who, age_band: who === "adult" ? "adult" : undefined },
      red_flags: picks,
      tier: "E",
      isolation_flag: flags.has("isolation"),
      onset_at: agoIso(ONSET.find((o) => o.key === onset)?.minutesAgo ?? 0),
      last_known_well_at: strokeFlag
        ? agoIso(LAST_WELL.find((o) => o.key === lastWell)?.minutesAgo ?? 0)
        : undefined,
      transport_mode: transport,
      eta_band: eta,
      callback_phone: phone || undefined,
      // Only for a facility that runs its own ambulance, and only on the switch.
      share_location:
        share && facility.ambulanceNumber
          ? { lat: share.latitude, lng: share.longitude }
          : undefined,
    };
    const res = await createPreArrival(input);
    setBusy(false);
    if (res.ok) {
      setQueued(false);
      writePendingPreArrival({
        id: res.data.pre_arrival_id,
        token: res.data.token,
        sentAt: new Date().toISOString(),
        smsBody: res.data.sms_fallback_body,
      });
      onSent(res.data);
      return;
    }
    if (res.code === "offline") {
      setQueued(true);
      return;
    }
    // `call_only` (403), `rate_limited` (429) and the rest: the server's
    // sentence, and the Call button below stays exactly where it is.
    setQueued(false);
    setError(res.error);
  };

  // The retry tick calls the LATEST send (the ref is refreshed every render),
  // so a field edited while queued goes out as edited, and `busy` inside it
  // stops two ticks overlapping.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  useEffect(() => {
    if (!queued) return;
    const id = setInterval(() => void sendRef.current(), RETRY_MS);
    return () => clearInterval(id);
  }, [queued]);

  const smsBody = facility?.emergencySmsNumber
    ? composeFacilitySms({
        tier: "E",
        dangerSign: picks[0] ? t(CATALOG, items.get(picks[0])?.labelKey ?? "") : null,
        etaBand: eta,
        transport,
        callback: callback.trim() || "see MedSync",
      })
    : null;

  // The Tide <Screen> rises with the keyboard itself, so Send stays above it.
  return (
    <Screen
      title="Tell a hospital"
      subtitle="They prepare before you arrive. Calling still comes first."
      back={{ onPress: onBack }}
      helpSource="emergency-tell"
      stagger={false}
      gap={tSpace[6]}
      footer={
        <>
          {error ? (
            <Text accessibilityRole="alert" style={[tType.bodyM, { color: tide.ink }]}>
              {error}
            </Text>
          ) : null}
          {queued ? (
            <View
              accessibilityRole="alert"
              style={{
                gap: tSpace[2],
                padding: tSpace[3],
                borderRadius: tRadius.md,
                backgroundColor: tide.surface2,
              }}
            >
              <Text style={[tType.labelS, { color: tide.ink }]}>Queued — no connection</Text>
              <Text style={[tType.bodyS, { color: tide.ink }]}>
                We&rsquo;ll keep trying while this screen is open.
                {smsBody ? " You can also send it by SMS from your own SIM." : ""}
              </Text>
              {smsBody && facility?.emergencySmsNumber ? (
                <Button
                  variant="outline"
                  label="Send by SMS instead"
                  onPress={() => {
                    Linking.openURL(smsUrl(facility.emergencySmsNumber ?? "", smsBody)).catch(
                      () => {},
                    );
                  }}
                />
              ) : null}
            </View>
          ) : null}
          {/* The pre-alert's Send: the one red fill on this screen (PRD §7.1). */}
          <Press
            accessibilityState={{ busy }}
            disabled={!facility || busy}
            onPress={() => void send()}
            style={{
              minHeight: 52,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: tSpace[6],
              borderRadius: tRadius.pill,
              backgroundColor: facility ? tide.emergency : tide.primaryOff,
              boxShadow: facility ? tide.shadow.emergency : undefined,
            }}
          >
            <Text style={[tType.label, { color: facility ? tide.onEmergency : tide.onPrimaryOff }]}>
              {busy ? "Sending…" : "Send"}
            </Text>
          </Press>
          {facility?.emergencyPhone ? (
            <Button
              variant="outline"
              icon="phone"
              label={`Call ${facility.name}`}
              accessibilityLabel={`Call ${facility.name}, ${facility.emergencyPhone}`}
              onPress={() => {
                Linking.openURL(telUrl(facility.emergencyPhone ?? "")).catch(() => {});
              }}
            />
          ) : null}
        </>
      }
    >
      <Field label="Hospital">
        {enabled.length ? (
          <View accessibilityRole="radiogroup" style={{ gap: tSpace[2] }}>
            {enabled.map((o) => (
              <FacilityTile
                key={o.facility.id}
                label={o.facility.name}
                hint={[
                  o.isOwn ? "Your hospital" : null,
                  o.distanceKm !== null ? `${o.distanceKm} km` : null,
                  o.facility.emergencyCapability === "24h" ? "Open 24 h" : o.facility.level,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                selected={facility?.id === o.facility.id}
                onPress={() => setFacilityId(o.facility.id)}
              />
            ))}
          </View>
        ) : (
          <Text style={[tType.bodyS, { color: tide.ink2 }]}>
            {sheet
              ? "No hospital near you takes pre-alerts yet. Please call."
              : "Loading hospitals…"}
          </Text>
        )}
        {callOnly.map((o) => (
          <View
            key={o.facility.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: tSpace[3],
              paddingHorizontal: tSpace[4],
              paddingVertical: tSpace[2],
              borderRadius: tRadius.row,
              backgroundColor: tide.surface2,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[tType.labelS, { color: tide.ink }]}>{o.facility.name}</Text>
              <Text style={[tType.bodyS, { color: tide.ink2 }]}>
                Call only — does not take pre-alerts yet
              </Text>
            </View>
            {o.facility.emergencyPhone ? (
              <Button
                variant="outline"
                size="sm"
                label="Call"
                accessibilityLabel={`Call ${o.facility.name}, ${o.facility.emergencyPhone}`}
                onPress={() => {
                  Linking.openURL(telUrl(o.facility.emergencyPhone ?? "")).catch(() => {});
                }}
              />
            ) : null}
          </View>
        ))}
        <View style={{ alignItems: "flex-start", paddingVertical: tSpace[1] }}>
          <TextLink
            label="Use my location to sort hospitals"
            onPress={() => void sortByLocation()}
          />
        </View>
        {locationNote ? (
          <Text style={[tType.bodyS, { color: tide.ink2 }]}>{locationNote}</Text>
        ) : null}
      </Field>

      <Field label="Who is this for?">
        <ChipRow>
          {signedIn ? (
            <Chip label="Me" selected={who === "me"} onPress={() => setWho("me")} />
          ) : null}
          {AUDIENCES.map((a) => (
            <Chip
              key={a}
              label={t(CATALOG, `audience.${a}`)}
              selected={who === a}
              onPress={() => setWho(a)}
            />
          ))}
        </ChipRow>
      </Field>

      <Field label="What is happening?" hint={picks.length ? undefined : "Not sure is fine."}>
        <ChipRow>
          {choices.map((item) => (
            <Chip
              key={item.key}
              label={t(CATALOG, item.labelKey)}
              selected={picks.includes(item.key)}
              onPress={() => togglePick(item.key)}
            />
          ))}
        </ChipRow>
      </Field>

      <Field label="When did it start?">
        <ChipRow>
          {ONSET.map((o) => (
            <Chip
              key={o.key}
              label={o.label}
              selected={onset === o.key}
              onPress={() => setOnset(o.key)}
            />
          ))}
        </ChipRow>
      </Field>

      {strokeFlag ? (
        <Field label="When were they last normal?">
          <ChipRow>
            {LAST_WELL.map((o) => (
              <Chip
                key={o.key}
                label={o.label}
                selected={lastWell === o.key}
                onPress={() => setLastWell(o.key)}
              />
            ))}
          </ChipRow>
        </Field>
      ) : null}

      <Field label="Getting there by">
        <ChipRow>
          {TRANSPORT_MODES.map((m) => (
            <Chip
              key={m}
              label={TRANSPORT_WORD[m]}
              selected={transport === m}
              onPress={() => setTransport(m)}
            />
          ))}
        </ChipRow>
      </Field>

      <Field label="Arriving in">
        <ChipRow>
          {ETA_BANDS.map((b) => (
            <Chip
              key={b}
              label={ETA_BAND_LABEL[b]}
              selected={eta === b}
              onPress={() => setEta(b)}
            />
          ))}
        </ChipRow>
      </Field>

      <Field
        label="Callback number"
        hint={
          signedIn
            ? "Leave blank to use the number on your account."
            : "So the hospital can reach you."
        }
      >
        <TextField
          accessibilityLabel="Callback number"
          value={callback}
          onChangeText={setCallback}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="07XXXXXXXX"
        />
      </Field>

      {facility?.ambulanceNumber ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[tType.label, { color: tide.ink }]}>
              Share my location with this hospital
            </Text>
            <Text style={[tType.bodyS, { color: tide.ink2 }]}>
              {facility.name} runs its own ambulance. Sent once, with this alert only.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Share my location with this hospital"
            value={share !== null}
            onValueChange={(on) => void toggleShare(on)}
            trackColor={{ true: tide.accentPressed, false: tide.primaryOff }}
            thumbColor={tide.onBand}
            ios_backgroundColor={tide.primaryOff}
          />
        </View>
      ) : null}
    </Screen>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const tide = useTide();
  return (
    <View style={{ gap: tSpace[2] }}>
      <Text accessibilityRole="header" style={[tType.label, { color: tide.ink }]}>
        {label}
      </Text>
      {children}
      {hint ? <Text style={[tType.bodyS, { color: tide.ink2 }]}>{hint}</Text> : null}
    </View>
  );
}

/**
 * One hospital to send to: its name and hint on the left, a tick on the right
 * once chosen, so the choice is a mark as well as a tint (the Tide pick).
 */
function FacilityTile({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const tide = useTide();
  return (
    <Press
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: tSpace[3],
        minHeight: 56,
        paddingHorizontal: tSpace[4],
        paddingVertical: tSpace[2.5],
        borderRadius: tRadius.row,
        backgroundColor: selected ? tide.accentTint : tide.surface,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? tide.accent : tide.line,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[tType.labelS, { color: tide.ink }]}>{label}</Text>
        {hint ? <Text style={[tType.bodyS, { color: tide.ink2 }]}>{hint}</Text> : null}
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: selected ? tide.primary : tide.surface,
          borderWidth: selected ? 0 : 1.5,
          borderColor: tide.lineStrong,
        }}
      >
        {selected ? <Icon name="check" size={14} color={tide.onPrimary} strokeWidth={2.6} /> : null}
      </View>
    </Press>
  );
}
