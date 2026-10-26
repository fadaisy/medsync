import type { IconName } from "@/components/tide";
import type { SymptomKey } from "@/features/safety/config";
import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Linking, Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Band,
  Card,
  Chip,
  ChipRow,
  Icon,
  IconDisc,
  Note,
  Pill,
  Press,
  Ring,
  Screen,
} from "@/components/tide";
import { useHistory } from "@/data/history";
import { cardNumber, metaName, sexLetter, useCardIdentity } from "@/data/me";
import { useMedicines } from "@/data/medicines";
import { useSavedReadings } from "@/data/readings";
import { cardLines } from "@/features/history/logic";
import { ActiveShareBanner, useShareBannerShown } from "@/features/location-share/active-banner";
import { ShareLocationSheet } from "@/features/location-share/share-sheet";
import { EMERGENCY_NUMBERS, SOS_COUNTDOWN_S, SOS_DIAL, SYMPTOMS } from "@/features/safety/config";
import { formatLatLng, useGrantedLocation } from "@/features/safety/location";
import { useSos } from "@/features/safety/use-sos";
import { emergencyEvent, telUrl, useEmergencySheet } from "@/lib/emergency";
import { orderFacilities } from "@/lib/nearest";
import { readingValueText } from "@/lib/readings";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/use-now";
import { motion } from "@/motion/presets";
import { ForcedScheme, useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * Help · SOS (board THelp/DHelp, §8.7, F-21). Always light (law L11), so the
 * red reads the same day or night, and the one route without a Help button
 * (it is the destination).
 *
 * Works signed out: the countdown, the call, the symptom chips and the
 * nearest hospital need no session; the medic card's name and number appear
 * only for a signed-in patient, from the phone's cache (no network needed).
 *
 * Honest by construction: SOS dials 112 (PRD Q1, 912 unverified). Nothing
 * else is sent by the app today, so "We have told" ticks only the call the
 * phone actually started; the rest say "not sent" or "not set up".
 */
export default function HelpScreen() {
  return (
    <ForcedScheme scheme="light">
      <HelpBody />
    </ForcedScheme>
  );
}

function HelpBody() {
  const t = useTide();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const router = useRouter();
  const { session, status } = useSession();
  const signedIn = status === "signedIn";
  const sos = useSos();
  const now = useNow(1000);
  const here = useGrantedLocation();
  const [syms, setSyms] = useState<SymptomKey[]>([]);
  const [sharing, setSharing] = useState(false);
  const shareShown = useShareBannerShown();
  const name = metaName(session?.user.user_metadata);
  const id = useCardIdentity(signedIn ? (session?.user.id ?? null) : null, name);
  const { sheet } = useEmergencySheet(null);
  const nearest = sheet ? (orderFacilities(sheet.facilities, here, null)[0] ?? null) : null;

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const toggle = (k: SymptomKey) =>
    setSyms((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const reported = SYMPTOMS.filter((s) => syms.includes(s.key)).map((s) => s.label.toLowerCase());

  const elapsed = sos.calledAt ? Math.max(0, Math.floor((now.getTime() - sos.calledAt) / 1000)) : 0;
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const onRed = t.onEmergency;
  const onRedSoft = t.critical.tint;

  const callNearest = () => {
    const f = nearest?.facility;
    if (!f?.emergencyPhone) return;
    emergencyEvent("call_tapped", { contact_id: `hospital:${f.id}` });
    Linking.openURL(telUrl(f.emergencyPhone)).catch(() => {});
  };

  const hero =
    sos.phase === "idle" ? (
      <>
        <Text
          accessibilityRole="header"
          style={[tType.title, { fontSize: 28, lineHeight: 32, color: onRed, textAlign: "center" }]}
        >
          Do you need help now?
        </Text>
        <View style={{ width: 200, height: 200 }}>
          {[0, 900].map((delay) => (
            <Animated.View
              key={delay}
              pointerEvents="none"
              style={[
                {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: 100,
                  backgroundColor: onRed,
                },
                motion.sosPulse(delay, reduced),
              ]}
            />
          ))}
          <Press
            onPress={sos.start}
            accessibilityLabel={`SOS. Calls ${SOS_DIAL} after ${SOS_COUNTDOWN_S} seconds`}
            testID="sos"
            style={{
              width: 200,
              height: 200,
              borderRadius: 100,
              backgroundColor: onRed,
              alignItems: "center",
              justifyContent: "center",
              gap: tSpace[1.5],
              boxShadow: t.shadow.float,
            }}
          >
            <Icon name="phone" size={34} color={t.emergencyBand} strokeWidth={2} />
            <Text style={{ fontFamily: tFont.extrabold, fontSize: 22, color: t.emergencyBand }}>
              SOS
            </Text>
            <Text style={[tType.caption, { color: t.emergencyBand }]}>Tap to call {SOS_DIAL}</Text>
          </Press>
        </View>
        <Text style={[tType.bodyS, { color: onRedSoft, textAlign: "center", maxWidth: 290 }]}>
          We call {SOS_DIAL} after {SOS_COUNTDOWN_S} seconds, so you can cancel a press by mistake.
          Then show the medic the card on this screen.
        </Text>
      </>
    ) : sos.phase === "counting" ? (
      <>
        <Text
          accessibilityRole="header"
          accessibilityLiveRegion="assertive"
          style={[tType.title, { fontSize: 28, lineHeight: 32, color: onRed }]}
        >
          Calling in {sos.secs}…
        </Text>
        <Ring
          value={sos.secs / SOS_COUNTDOWN_S}
          size={220}
          stroke={6}
          color={onRed}
          track={t.bandGlass}
        >
          <View
            style={{
              width: 196,
              height: 196,
              borderRadius: 98,
              backgroundColor: onRed,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: tFont.monoBold,
                fontSize: 72,
                lineHeight: 80,
                color: t.emergencyBand,
              }}
            >
              {sos.secs}
            </Text>
          </View>
        </Ring>
        <Press
          onPress={sos.cancel}
          testID="sos-cancel"
          accessibilityLabel="Cancel, I'm okay"
          style={{
            minHeight: 52,
            paddingHorizontal: 30,
            borderRadius: tRadius.pill,
            borderWidth: 2,
            borderColor: onRed,
            backgroundColor: t.bandGlass,
            justifyContent: "center",
          }}
        >
          <Text style={[tType.label, { fontFamily: tFont.bold, color: onRed }]}>
            Cancel, I&apos;m okay
          </Text>
        </Press>
      </>
    ) : (
      <>
        <Pill
          label={sos.dialled === false ? "The call did not start" : `On call · ${clock}`}
          dot={sos.dialled === false ? undefined : onRed}
          bg={t.bandGlass}
          fg={onRed}
          style={{ alignSelf: "center" }}
        />
        <Text
          accessibilityRole="header"
          style={[tType.title, { fontSize: 30, lineHeight: 34, color: onRed, textAlign: "center" }]}
        >
          Ask for an ambulance
        </Text>
        <Text style={[tType.bodyM, { color: onRedSoft, textAlign: "center" }]}>
          Tell them where you are. Stay where you are. Keep your phone near you. Unlock your door if
          you can.
        </Text>
        <Press
          onPress={sos.callAgain}
          accessibilityLabel={`Call ${SOS_DIAL} again`}
          haptic
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={[tType.label, { color: onRed, textDecorationLine: "underline" }]}>
            Call {SOS_DIAL} again
          </Text>
        </Press>
      </>
    );

  return (
    <>
      <Screen
        help="none"
        stagger={false}
        header={
          <Press
            onPress={close}
            accessibilityLabel="Close help"
            style={{
              minHeight: 44,
              paddingHorizontal: tSpace[2.5],
              marginLeft: -tSpace[2.5],
              flexDirection: "row",
              alignItems: "center",
              gap: tSpace[1],
            }}
          >
            <Icon name="close" size={20} color={onRed} />
            <Text style={[tType.label, { fontSize: 15, color: onRed }]}>Close</Text>
          </Press>
        }
        headerRight={
          here ? <Pill label="Location on" icon="locate" bg={t.bandGlass} fg={onRed} /> : null
        }
        topBand={
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: insets.top + 56,
              backgroundColor: t.emergencyBand,
            }}
          />
        }
      >
        <View
          style={{
            marginHorizontal: -tSpace[5],
            marginTop: -tSpace[1] - 6,
            paddingTop: tSpace[3],
            paddingHorizontal: tSpace[5],
            paddingBottom: tSpace[8],
            backgroundColor: t.emergencyBand,
            borderBottomLeftRadius: 40,
            borderBottomRightRadius: 40,
            alignItems: "center",
            gap: 18,
          }}
        >
          {hero}
        </View>

        {shareShown ? <ActiveShareBanner /> : null}

        {sos.phase === "calling" ? (
          <>
            <Card radius={tRadius.panel}>
              <Text
                accessibilityRole="header"
                style={[tType.labelS, { fontFamily: tFont.bold, color: t.ink }]}
              >
                We have told
              </Text>
              <Told
                done={sos.dialled === true}
                text={`Emergency line ${SOS_DIAL} · ${sos.dialled === true ? "call started" : sos.dialled === false ? "call did not start" : "starting"}`}
              />
              <Told
                done={false}
                text="Your location · not sent"
                sub={here ? `Read it out: ${formatLatLng(here)}` : undefined}
              />
              <Told done={false} text="Your care team · not sent" />
              <Told done={false} text="Your emergency contact · not set up" />
            </Card>

            {signedIn || reported.length ? (
              <Band style={{ gap: tSpace[2] }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: tSpace[2],
                  }}
                >
                  <Text
                    style={[
                      tType.micro,
                      {
                        fontFamily: tFont.bold,
                        letterSpacing: 1.1,
                        textTransform: "uppercase",
                        color: t.onBandAccent,
                      },
                    ]}
                  >
                    Show this to the medic
                  </Text>
                  {signedIn ? (
                    <Text
                      style={{ fontFamily: tFont.monoSemibold, fontSize: 11, color: t.onBand2 }}
                    >
                      {cardNumber(id.code)}
                    </Text>
                  ) : null}
                </View>
                {signedIn ? (
                  <>
                    <Text
                      style={[
                        tType.heading,
                        { fontFamily: tFont.bold, fontSize: 18, color: t.onBand },
                      ]}
                    >
                      {[id.name ?? "Name not recorded", sexLetter(id.sex)]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                    <MedicLines conditions={id.conditions} />
                  </>
                ) : null}
                {reported.length ? (
                  <Text style={[tType.bodyS, { fontFamily: tFont.semibold, color: t.onBand }]}>
                    Reported now: {reported.join(", ")}
                  </Text>
                ) : null}
              </Band>
            ) : null}

            <Press
              onPress={sos.end}
              accessibilityLabel="End emergency"
              style={{
                minHeight: 52,
                borderRadius: tRadius.pill,
                backgroundColor: t.surface,
                borderWidth: 2,
                borderColor: t.critical.tint,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={[
                  tType.label,
                  { fontFamily: tFont.bold, fontSize: 15, color: t.emergencyBand },
                ]}
              >
                End emergency
              </Text>
            </Press>
          </>
        ) : (
          <>
            <Card radius={tRadius.panel}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: tSpace[2],
                }}
              >
                <Text
                  accessibilityRole="header"
                  style={[tType.label, { fontFamily: tFont.bold, fontSize: 15, color: t.ink }]}
                >
                  What is happening?
                </Text>
                <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3 }]}>
                  optional · for the medic
                </Text>
              </View>
              <ChipRow>
                {SYMPTOMS.map((s) => (
                  <Chip
                    key={s.key}
                    label={s.label}
                    tone="danger"
                    selected={syms.includes(s.key)}
                    onPress={() => toggle(s.key)}
                  />
                ))}
              </ChipRow>
              {syms.includes("sugar") ? (
                <Note tone="info">
                  If your sugar is low and you can swallow, eat or drink something sweet now.
                </Note>
              ) : null}
            </Card>

            <Text
              accessibilityRole="header"
              style={[tType.labelS, { fontSize: 13, color: t.ink3, paddingHorizontal: tSpace[1] }]}
            >
              Not an emergency?
            </Text>
            {signedIn ? (
              <LinkRow
                icon="message"
                tint={t.accentTint}
                color={t.accentText}
                title="Message my care team"
                sub={id.facility ?? "Your care team"}
                onPress={() => router.push("/care/chat")}
              />
            ) : null}
            <LinkRow
              icon="user"
              tint={t.info.tint}
              color={t.info.text}
              title="Call my emergency contact"
              sub={
                signedIn
                  ? "Not set up yet · add one in Me"
                  : "Sign in to use your emergency contact"
              }
              onPress={signedIn ? () => router.push("/me") : undefined}
            />
            <LinkRow
              icon="building"
              tint={t.place.tint}
              color={t.place.text}
              title="Nearest hospital"
              sub={
                nearest
                  ? [
                      nearest.facility.name,
                      nearest.distanceKm !== null ? `${nearest.distanceKm} km` : null,
                      nearest.facility.emergencyPhone ? null : "no phone number verified",
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "Go to the nearest emergency unit"
              }
              onPress={nearest?.facility.emergencyPhone ? callNearest : undefined}
            />
            {signedIn ? (
              <LinkRow
                icon="locate"
                tint={t.accentTint}
                color={t.accentText}
                title="Share my live location"
                sub="A private link for family, for a time you choose"
                onPress={() => setSharing(true)}
              />
            ) : null}
            {signedIn ? (
              <>
                <LinkRow
                  icon="phone"
                  tint={t.surface2}
                  color={t.ink}
                  title="All emergency lines"
                  sub="Your hospital's verified lines first"
                  onPress={() => router.push("/(app)/emergency/lines")}
                />
                <LinkRow
                  icon="heart"
                  tint={t.info.tint}
                  color={t.info.text}
                  title="Thinking of hurting yourself?"
                  sub="Calm support, no questions asked"
                  onPress={() => router.push("/(app)/emergency/crisis")}
                />
                <LinkRow
                  icon="shield"
                  tint={t.info.tint}
                  color={t.info.text}
                  title="After sexual violence"
                  sub="Why time matters, and where to go"
                  onPress={() => router.push("/(app)/emergency/sv")}
                />
              </>
            ) : (
              <LinkRow
                icon="phone"
                tint={t.surface2}
                color={t.ink}
                title="All emergency lines"
                sub="Verified national lines"
                onPress={() => router.push("/emergency")}
              />
            )}
            <Text style={[tType.micro, { color: t.ink3, textAlign: "center" }]}>
              General emergency {EMERGENCY_NUMBERS.general} · Ambulance{" "}
              {EMERGENCY_NUMBERS.ambulance} is not confirmed yet, so we dial {SOS_DIAL}. Numbers and
              first-aid wording pending MoH and CSO sign-off.
            </Text>
          </>
        )}
        <ShareLocationSheet
          visible={sharing}
          onClose={() => setSharing(false)}
          purpose="emergency"
        />
      </Screen>
      {/* White status-bar text on the red band; mounted after <Screen> so it wins. */}
      <StatusBar style="light" />
    </>
  );
}

/** A line of "We have told": a ticked disc only for what really happened. */
function Told({ done, text, sub }: { done: boolean; text: string; sub?: string }) {
  const t = useTide();
  return (
    <View style={{ flexDirection: "row", gap: tSpace[2.5], alignItems: "flex-start" }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          marginTop: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: done ? t.accentPressed : "transparent",
          borderWidth: done ? 0 : 1.5,
          borderColor: t.lineStrong,
        }}
      >
        {done ? <Icon name="check" size={14} color={t.onBand} strokeWidth={2.6} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[tType.labelS, { color: done ? t.ink : t.ink2 }]}>{text}</Text>
        {sub ? <Text style={[tType.bodyS, { color: t.ink }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

/** A "Not an emergency?" row. Without `onPress` it is information only (no chevron). */
function LinkRow({
  icon,
  tint,
  color,
  title,
  sub,
  onPress,
}: {
  icon: IconName;
  tint: string;
  color: string;
  title: string;
  sub: string;
  onPress?: () => void;
}): ReactNode {
  const t = useTide();
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${title}. ${sub}`}
      radius={tRadius.card}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: tSpace[3],
        paddingVertical: tSpace[3],
      }}
    >
      <IconDisc name={icon} color={color} bg={tint} size={42} />
      <View style={{ flex: 1 }}>
        <Text style={[tType.label, { fontFamily: tFont.bold, fontSize: 15, color: t.ink }]}>
          {title}
        </Text>
        <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink2 }]}>{sub}</Text>
      </View>
      {onPress ? <Icon name="forward" size={18} color={t.ink3} /> : null}
    </Card>
  );
}

/**
 * What the medic reads off the card: the patient's own conditions, medicine
 * names (never amounts, law L5) and their last blood pressure, all from the
 * patient's real records. Allergies are not readable on the phone, so the
 * line says to ask.
 */
function MedicLines({ conditions }: { conditions: string[] }) {
  const t = useTide();
  const now = useNow();
  const own = cardLines(useHistory(), conditions);
  const { doses } = useMedicines(now);
  const bp = useSavedReadings().find((r) => r.input.kind === "bp");
  const names = [...new Set(doses.map((d) => d.medicine))];
  const lines = [
    own.conditions === "None listed" ? "No conditions recorded" : own.conditions,
    names.length ? `Medicines: ${names.join(", ")}` : "No medicines on their list",
    `Allergies: ${own.allergies === "None listed" ? "ask the patient" : `${own.allergies} (their own words)`}${bp ? ` · Last BP ${readingValueText(bp.input)}` : ""}`,
  ];
  return <Text style={[tType.bodyS, { color: t.onBand2 }]}>{lines.join("\n")}</Text>;
}
