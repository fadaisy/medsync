import type { IconName } from "@/components/tide";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Text, useWindowDimensions, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  BackLink,
  Button,
  FieldLabel,
  Icon,
  isUgMobile,
  Note,
  OtpBoxes,
  PhoneField,
  Press,
  Screen,
  TextField,
  TextLink,
} from "@/components/tide";
import {
  fingerprintAvailable,
  readFingerprintChoice,
  saveFingerprintChoice,
  sendPhoneCode,
  signInWithPassword,
  verifyPhoneCode,
} from "@/data/signup";
import { e164, isEmail } from "@/features/auth/rules";
import { ScanView } from "@/features/auth/scan-view";
import { flag } from "@/lib/flags";
import { useNow } from "@/lib/use-now";
import { motion } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

type Method = "otp" | "pass" | "scan";

/** How long before "Send again" opens. */
const RESEND_S = 60;
/** Where the white sheet starts, from the top of the screen (the board's 312). */
const SHEET_TOP = 312;

/**
 * Sign in (Tide v1 F-02, board TSignIn/DSignIn): a navy hero with three
 * floating cards, and a sheet with three ways in.
 *
 * Password is live today (email only: Supabase signs in by email). Phone code
 * is built in full behind `mobilePhoneOtp`; health card behind
 * `mobileQrSignIn`. Either one off says so on its tile and points to the
 * password. On success the root gate moves the patient into the app.
 */
export default function SignInScreen() {
  const t = useTide();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const otpOn = flag("mobilePhoneOtp");
  const qrOn = flag("mobileQrSignIn");
  const [method, setMethod] = useState<Method>(otpOn ? "otp" : "pass");
  const headerH = insets.top + 50;

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <Screen
      header={<BackLink label="Back" color={t.onBand} onPress={back} />}
      helpSource="sign-in"
      topBand={<Hero />}
      stagger={false}
      contentStyle={{
        paddingTop: Math.max(tSpace[4], SHEET_TOP - headerH),
        paddingHorizontal: 12,
        paddingBottom: 0,
      }}
    >
      <View
        style={{
          minHeight: height - SHEET_TOP,
          paddingTop: tSpace[2.5],
          paddingHorizontal: tSpace[4],
          paddingBottom: insets.bottom + tSpace[10],
          borderTopLeftRadius: tRadius.sheet,
          borderTopRightRadius: tRadius.sheet,
          backgroundColor: t.surface,
          boxShadow: t.shadow.float,
          gap: tSpace[4],
        }}
      >
        <View
          style={{
            alignSelf: "center",
            width: 40,
            height: 5,
            borderRadius: 3,
            backgroundColor: t.line,
          }}
        />
        <MethodTiles method={method} onChange={setMethod} otpOn={otpOn} qrOn={qrOn} />
        {method === "otp" ? (
          <PhonePanel on={otpOn} onUsePassword={() => setMethod("pass")} />
        ) : null}
        {method === "pass" ? <PasswordPanel /> : null}
        {method === "scan" ? <ScanPanel on={qrOn} onUsePassword={() => setMethod("pass")} /> : null}
      </View>
    </Screen>
  );
}

/* ─── Hero ───────────────────────────────────────────────────────────── */

function Hero() {
  const t = useTide();
  const reduced = useReducedMotion();
  const card = (
    bg: string,
    fg: string,
    sub: string,
    icon: IconName,
    title: string,
    caption: string,
    pos: { right: number; top: number; width: number; rotate: string },
    bob: [number, number],
  ) => (
    <View
      style={{
        position: "absolute",
        right: pos.right,
        top: pos.top,
        width: pos.width,
        transform: [{ rotate: pos.rotate }],
      }}
    >
      <Animated.View
        style={[
          {
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 18,
            backgroundColor: bg,
            flexDirection: "row",
            alignItems: "center",
            gap: tSpace[2],
            boxShadow: t.shadow.float,
          },
          motion.bob(bob[0], bob[1], reduced),
        ]}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: t.bandGlass,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={15} color={fg} strokeWidth={2} />
        </View>
        <View>
          <Text style={{ fontFamily: tFont.bold, fontSize: 13, color: fg }}>{title}</Text>
          <Text style={{ fontFamily: tFont.medium, fontSize: 10, color: sub }}>{caption}</Text>
        </View>
      </Animated.View>
    </View>
  );
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        height: 340,
        backgroundColor: t.band,
        borderBottomLeftRadius: 40,
        borderBottomRightRadius: 40,
        overflow: "hidden",
      }}
    >
      {card(
        t.cascade[1],
        t.onBand,
        t.onBand2,
        "heart",
        "128/82",
        "In your range",
        { right: -18, top: 118, width: 170, rotate: "8deg" },
        [5000, 0],
      )}
      {card(
        t.cascade[2],
        t.onBand,
        t.onBand2,
        "calendar",
        "Fri 23 · Review",
        "Diabetes clinic",
        { right: 26, top: 182, width: 176, rotate: "-4deg" },
        [6000, 0],
      )}
      {card(
        t.accent,
        t.onAccent,
        t.onAccent,
        "check",
        "Medicine taken",
        "13:04",
        { right: -10, top: 244, width: 160, rotate: "5deg" },
        [5500, 600],
      )}
      <View style={{ position: "absolute", left: 24, top: 128, maxWidth: 190, gap: 10 }}>
        <Animated.View style={motion.rise(0, reduced)}>
          <Text
            style={{
              fontFamily: tFont.extrabold,
              fontSize: 20,
              letterSpacing: -0.4,
              color: t.onBand,
            }}
          >
            Med<Text style={{ color: t.accent }}>Sync</Text>
          </Text>
        </Animated.View>
        <Animated.View style={motion.rise(100, reduced)}>
          <Text
            style={{
              fontFamily: tFont.semibold,
              fontSize: 36,
              lineHeight: 38,
              letterSpacing: -1.26,
              color: t.onBand,
            }}
          >
            {"Welcome\nback."}
          </Text>
        </Animated.View>
        <Animated.View style={motion.rise(200, reduced)}>
          <Text style={[tType.bodyM, { fontSize: 14, lineHeight: 19, color: t.onBand2 }]}>
            Your readings, medicines and visits are waiting.
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

/* ─── Method tiles ───────────────────────────────────────────────────── */

function MethodTiles({
  method,
  onChange,
  otpOn,
  qrOn,
}: {
  method: Method;
  onChange: (m: Method) => void;
  otpOn: boolean;
  qrOn: boolean;
}) {
  const t = useTide();
  const tiles: { key: Method; label: string; icon: IconName; on: boolean }[] = [
    { key: "otp", label: "Phone code", icon: "smartphone", on: otpOn },
    { key: "pass", label: "Password", icon: "lock", on: true },
    { key: "scan", label: "Health card", icon: "scan", on: qrOn },
  ];
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="How do you want to sign in?"
      style={{ flexDirection: "row", gap: tSpace[2] }}
    >
      {tiles.map((tile) => {
        const sel = tile.key === method;
        const fg = sel ? t.onPrimary : t.ink;
        return (
          <Press
            key={tile.key}
            onPress={() => onChange(tile.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            accessibilityLabel={tile.on ? tile.label : `${tile.label}, not available yet`}
            style={{
              flex: 1,
              minHeight: 84,
              borderRadius: tRadius.card,
              backgroundColor: sel ? t.primary : t.surface2,
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: tSpace[2],
              boxShadow: sel ? t.shadow.float : undefined,
              transform: [{ translateY: sel ? -2 : 0 }],
            }}
          >
            <Icon name={tile.icon} size={22} color={fg} />
            <Text style={[tType.caption, { color: fg }]}>{tile.label}</Text>
            {!tile.on ? (
              <Text style={[tType.micro, { fontSize: 10, color: sel ? t.onPrimary : t.ink3 }]}>
                Not yet
              </Text>
            ) : null}
          </Press>
        );
      })}
    </View>
  );
}

function PanelHeading({ title, sub }: { title: string; sub: string }) {
  const t = useTide();
  const reduced = useReducedMotion();
  return (
    <Animated.View style={[{ gap: 6 }, motion.rise(0, reduced)]}>
      <Text
        accessibilityRole="header"
        style={[tType.title, { fontSize: 22, lineHeight: 27, letterSpacing: -0.44, color: t.ink }]}
      >
        {title}
      </Text>
      <Text style={[tType.bodyM, { color: t.ink2 }]}>{sub}</Text>
    </Animated.View>
  );
}

/* ─── Phone code ─────────────────────────────────────────────────────── */

function PhonePanel({ on, onUsePassword }: { on: boolean; onUsePassword: () => void }) {
  const t = useTide();
  const now = useNow(1000);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!on)
    return (
      <View style={{ gap: tSpace[4] }}>
        <PanelHeading
          title="Sign in with your phone"
          sub="Use the number your hospital has for you. We send a code by SMS."
        />
        <Note tone="plain">Phone codes are coming soon. For now, sign in with your password.</Note>
        <Button label="Use my password" onPress={onUsePassword} />
      </View>
    );

  const send = async () => {
    setBusy(true);
    setError(null);
    const out = await sendPhoneCode(e164(phone));
    setBusy(false);
    if (!out.ok) return setError(out.message);
    setCode("");
    setSentAt(Date.now());
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const out = await verifyPhoneCode(e164(phone), code);
    setBusy(false);
    if (!out.ok) setError(out.message);
  };

  if (sentAt === null)
    return (
      <View style={{ gap: tSpace[4] }}>
        <PanelHeading
          title="Sign in with your phone"
          sub="Use the number your hospital has for you. We send a code by SMS."
        />
        <PhoneField
          large
          value={phone}
          onChangeText={setPhone}
          error="Ugandan mobile numbers start with 7, like 772 000 000"
        />
        <ErrorNote text={error} />
        <Button label="Send me a code" onPress={send} disabled={!isUgMobile(phone)} busy={busy} />
        <Text style={[tType.bodyS, { color: t.ink3 }]}>
          No phone of your own? A family member can sign in and add you under &quot;People I care
          for&quot;.
        </Text>
      </View>
    );

  const left = Math.max(0, RESEND_S - Math.floor((now.getTime() - sentAt) / 1000));
  return (
    <View style={{ gap: tSpace[4] }}>
      <View style={{ gap: 6 }}>
        <Text
          accessibilityRole="header"
          style={[tType.title, { fontSize: 22, lineHeight: 27, color: t.ink }]}
        >
          Enter the code
        </Text>
        <Text style={[tType.bodyM, { color: t.ink2 }]}>
          We sent 6 numbers to{" "}
          <Text style={{ fontFamily: tFont.bold, color: t.ink }}>+256 {phone}</Text>.
        </Text>
      </View>
      <OtpBoxes value={code} onChangeText={setCode} />
      <ErrorNote text={error} />
      <Button label="Sign in" onPress={verify} disabled={code.length !== 6} busy={busy} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        {left > 0 ? (
          <Text style={[tType.labelS, { fontSize: 13, color: t.ink3 }]}>
            Send again in 0:{String(left).padStart(2, "0")}
          </Text>
        ) : (
          <TextLink label="Send again" onPress={send} />
        )}
        <TextLink
          label="Change number"
          onPress={() => {
            setSentAt(null);
            setCode("");
            setError(null);
          }}
        />
      </View>
      <Note tone="info" icon="shield">
        MedSync staff will never ask you for this code.
      </Note>
    </View>
  );
}

/* ─── Password ───────────────────────────────────────────────────────── */

function PasswordPanel() {
  const t = useTide();
  const router = useRouter();
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [bioOk, setBioOk] = useState(false);
  const [bio, setBio] = useState(false);

  useEffect(() => {
    let live = true;
    void Promise.all([fingerprintAvailable(), readFingerprintChoice()]).then(([ok, on]) => {
      if (!live) return;
      setBioOk(ok);
      setBio(ok && on);
    });
    return () => {
      live = false;
    };
  }, []);

  const typed = user.trim();
  const emailish = isEmail(typed);
  // Only email signs in with Supabase today; say so as soon as something else is typed.
  const hint =
    typed.length > 3 && !emailish && !typed.includes("@")
      ? "For now only your email works here. Phone and MedSync number sign-in are coming."
      : null;
  const canSubmit = emailish && pw.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const out = await signInWithPassword(typed, pw);
    setBusy(false);
    if (!out.ok) return setError(out.message);
    router.replace("/");
  };

  const toggleBio = () => {
    if (!bioOk) return;
    const next = !bio;
    setBio(next);
    void saveFingerprintChoice(next);
  };

  return (
    <View style={{ gap: tSpace[4] }}>
      <PanelHeading title="Sign in with password" sub="Use your MedSync number, phone or email." />
      <View style={{ gap: tSpace[1.5] }}>
        <TextField
          label="MedSync number, phone or email"
          value={user}
          onChangeText={setUser}
          state={emailish ? "good" : "idle"}
          placeholder="name@example.com"
          keyboardType="email-address"
          autoComplete="username"
          inputProps={{
            autoCapitalize: "none",
            autoCorrect: false,
            textContentType: "username",
            returnKeyType: "next",
          }}
        />
        {hint ? <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]}>{hint}</Text> : null}
      </View>
      <View style={{ gap: tSpace[1.5] }}>
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          <FieldLabel>Password</FieldLabel>
          <TextLink label="Forgot password?" onPress={() => setForgot(true)} />
        </View>
        <TextField
          value={pw}
          onChangeText={setPw}
          state={pw.length > 0 ? "good" : "idle"}
          placeholder="Your password"
          secure={!show}
          onToggleSecure={() => setShow((s) => !s)}
          autoComplete="current-password"
          accessibilityLabel="Password"
          inputProps={{
            autoCapitalize: "none",
            autoCorrect: false,
            textContentType: "password",
            returnKeyType: "go",
            onSubmitEditing: submit,
          }}
        />
        {forgot ? (
          <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]}>
            Resetting a password from the app is not switched on yet.
          </Text>
        ) : null}
      </View>
      <ErrorNote text={error} />
      <Button label="Sign in" onPress={submit} disabled={!canSubmit} busy={busy} />
      <Press
        onPress={toggleBio}
        disabled={!bioOk}
        accessibilityRole="switch"
        accessibilityState={{ checked: bio, disabled: !bioOk }}
        accessibilityLabel="Use fingerprint next time"
        accessibilityHint={bioOk ? undefined : "This phone has no fingerprint set up."}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: tSpace[3],
          minHeight: 56,
          paddingHorizontal: tSpace[3.5],
          borderRadius: tRadius.row,
          backgroundColor: t.surface2,
        }}
      >
        <Icon name="fingerprint" size={22} color={bioOk ? t.ink : t.ink4} />
        <View style={{ flex: 1 }}>
          <Text style={[tType.labelS, { color: bioOk ? t.ink : t.ink3 }]}>
            Use fingerprint next time
          </Text>
          {!bioOk ? (
            <Text style={[tType.micro, { color: t.ink3 }]}>
              This phone has no fingerprint set up.
            </Text>
          ) : null}
        </View>
        <View
          style={{
            width: 44,
            height: 26,
            borderRadius: 13,
            padding: 3,
            backgroundColor: bio ? t.accentPressed : t.lineStrong,
            alignItems: bio ? "flex-end" : "flex-start",
          }}
        >
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: t.surface }} />
        </View>
      </Press>
    </View>
  );
}

/* ─── Health card ────────────────────────────────────────────────────── */

function ScanPanel({ on, onUsePassword }: { on: boolean; onUsePassword: () => void }) {
  return (
    <View style={{ gap: tSpace[4] }}>
      <PanelHeading title="Scan your card" sub="Hold the QR code inside the square." />
      {on ? (
        <ScanView />
      ) : (
        <>
          <Note tone="plain">
            Signing in with your health card is not available yet. Use your password for now.
          </Note>
          <Button label="Use my password" onPress={onUsePassword} />
        </>
      )}
    </View>
  );
}

function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  // Not red: a mistyped password is not an emergency (law L3).
  return (
    <Note tone="plain" icon="alert">
      {text}
    </Note>
  );
}
