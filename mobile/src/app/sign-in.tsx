import { useState } from "react";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  BackLink,
  Button,
  FieldLabel,
  isUgMobile,
  Note,
  OtpBoxes,
  PhoneField,
  Screen,
  TextField,
  TextLink,
} from "@/components/tide";
import { sendPhoneCode, signInWithPassword, verifyPhoneCode } from "@/data/signup";
import { e164, isEmail } from "@/features/auth/rules";
import { ScanView } from "@/features/auth/scan-view";
import { flag } from "@/lib/flags";
import { useNow } from "@/lib/use-now";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

type Method = "pass" | "otp" | "scan";

/** How long before "Send again" opens. */
const RESEND_S = 60;

/**
 * Sign in (Tide v1 F-02), the calm band (canvas "MedSync Sign-in Rework", A):
 * a navy band with the wordmark and one line, then a white card with the
 * password form. Other ways in show only when they work: the phone code
 * behind `mobilePhoneOtp`, the health card behind `mobileQrSignIn`; never a
 * greyed-out "Not yet" tile.
 *
 * Password signs in by email only (Supabase), so the field says Email. On
 * success the root gate moves the patient into the app.
 */
export default function SignInScreen() {
  const t = useTide();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const otpOn = flag("mobilePhoneOtp");
  const qrOn = flag("mobileQrSignIn");
  const [method, setMethod] = useState<Method>("pass");

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const usePassword = () => setMethod("pass");

  return (
    <>
      <Screen
        header={<BackLink label="Back" color={t.onBand} onPress={back} />}
        helpSource="sign-in"
        background={t.band}
        stagger={false}
        gap={0}
        contentStyle={{ flexGrow: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}
      >
        <View
          style={{
            paddingHorizontal: tSpace[6],
            paddingTop: tSpace[3],
            paddingBottom: tSpace[10],
            gap: tSpace[2.5],
          }}
        >
          <Text
            style={{
              fontFamily: tFont.extrabold,
              fontSize: 22,
              letterSpacing: -0.4,
              color: t.onBand,
            }}
          >
            Med<Text style={{ color: t.accent }}>Sync</Text>
          </Text>
          <Text
            accessibilityRole="header"
            style={[tType.display, { marginTop: tSpace[2], color: t.onBand }]}
          >
            Welcome back
          </Text>
          <Text style={[tType.bodyM, { color: t.onBand2 }]}>Sign in to see your day.</Text>
        </View>

        <View
          style={{
            flexGrow: 1,
            marginTop: -tSpace[8],
            paddingTop: tSpace[8],
            paddingHorizontal: tSpace[6],
            paddingBottom: insets.bottom + tSpace[6],
            borderTopLeftRadius: tRadius.sheet,
            borderTopRightRadius: tRadius.sheet,
            backgroundColor: t.surface,
            gap: tSpace[4.5],
          }}
        >
          {method === "pass" ? (
            <PasswordForm />
          ) : method === "otp" ? (
            <PhoneCodeForm />
          ) : (
            <View style={{ gap: tSpace[4] }}>
              <Text
                accessibilityRole="header"
                style={[tType.title, { fontSize: 22, color: t.ink }]}
              >
                Scan your card
              </Text>
              <ScanView />
            </View>
          )}

          {method === "pass" && (otpOn || qrOn) ? (
            <>
              <OrDivider />
              {otpOn ? (
                <Button
                  label="Text me a code"
                  icon="smartphone"
                  variant="outline"
                  size="md"
                  onPress={() => setMethod("otp")}
                />
              ) : null}
              {qrOn ? (
                <Button
                  label="Scan my health card"
                  icon="scan"
                  variant="outline"
                  size="md"
                  onPress={() => setMethod("scan")}
                />
              ) : null}
            </>
          ) : null}
          {method !== "pass" ? (
            <View style={{ alignItems: "center" }}>
              <TextLink label="Use my password instead" onPress={usePassword} />
            </View>
          ) : null}

          <View style={{ flexGrow: 1, minHeight: tSpace[4] }} />
          <Text style={[tType.bodyM, { textAlign: "center", color: t.ink2 }]}>
            New to MedSync?{" "}
            <Text
              accessibilityRole="link"
              onPress={() => router.push("/sign-up")}
              style={{ fontFamily: tFont.bold, color: t.accentText }}
            >
              Create an account
            </Text>
          </Text>
        </View>
      </Screen>
      {/* White status-bar text on the navy band; mounted after <Screen> so it wins. */}
      <StatusBar style="light" />
    </>
  );
}

function OrDivider() {
  const t = useTide();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
      <Text style={[tType.caption, { color: t.ink3 }]}>or</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
    </View>
  );
}

/* ─── Password ───────────────────────────────────────────────────────── */

function PasswordForm() {
  const t = useTide();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  const typed = email.trim();
  const emailish = isEmail(typed);
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

  return (
    <View style={{ gap: tSpace[4.5] }}>
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        state={emailish ? "good" : "idle"}
        placeholder="name@example.com"
        keyboardType="email-address"
        autoComplete="email"
        inputProps={{
          autoCapitalize: "none",
          autoCorrect: false,
          textContentType: "username",
          returnKeyType: "next",
        }}
      />
      <View style={{ gap: tSpace[1.5] }}>
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          <FieldLabel>Password</FieldLabel>
          <TextLink label="Forgot?" onPress={() => setForgot(true)} />
        </View>
        <TextField
          value={pw}
          onChangeText={setPw}
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
          <Text style={[tType.bodyS, { color: t.ink2 }]}>
            Resetting a password from the app is not switched on yet. Ask at your hospital&apos;s
            desk, or reset it on the MedSync website.
          </Text>
        ) : null}
      </View>
      <ErrorNote text={error} />
      <Button label="Sign in" onPress={submit} disabled={!canSubmit} busy={busy} />
    </View>
  );
}

/* ─── Phone code (behind mobilePhoneOtp) ─────────────────────────────── */

function PhoneCodeForm() {
  const t = useTide();
  const now = useNow(1000);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <Text style={[tType.bodyM, { color: t.ink2 }]}>
          Use the number your hospital has for you. We send a code by SMS.
        </Text>
        <PhoneField
          large
          value={phone}
          onChangeText={setPhone}
          error="Ugandan mobile numbers start with 7, like 772 000 000"
        />
        <ErrorNote text={error} />
        <Button label="Send me a code" onPress={send} disabled={!isUgMobile(phone)} busy={busy} />
      </View>
    );

  const left = Math.max(0, RESEND_S - Math.floor((now.getTime() - sentAt) / 1000));
  return (
    <View style={{ gap: tSpace[4] }}>
      <Text style={[tType.bodyM, { color: t.ink2 }]}>
        We sent 6 numbers to{" "}
        <Text style={{ fontFamily: tFont.bold, color: t.ink }}>+256 {phone}</Text>.
      </Text>
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

function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  // Not red: a mistyped password is not an emergency (law L3).
  return (
    <Note tone="plain" icon="alert">
      {text}
    </Note>
  );
}
