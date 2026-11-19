import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { Button, FieldLabel, isUgMobile, Note, Press, Screen } from "@/components/tide";
import { sendPhoneCode, signInWithPassword, verifyPhoneCode } from "@/data/signup";
import {
  BarBack,
  CodeBoxes,
  FieldProblem,
  QuietLink,
  StatusField,
  StatusPhoneField,
} from "@/features/auth/marks";
import { e164, isEmail } from "@/features/auth/rules";
import { ScanView } from "@/features/auth/scan-view";
import { StepHeading } from "@/features/auth/steps";
import { BRAND } from "@/lib/brand";
import { flag } from "@/lib/flags";
import { useNow } from "@/lib/use-now";
import { useTide } from "@/theme/theme";
import { tFont, tSpace, tType } from "@/theme/tide";

export type Method = "pass" | "otp" | "scan";

/** How long before "Send again" opens. */
const RESEND_S = 60;
/** How many numbers the texted code has. */
const CODE_LENGTH = 6;

/**
 * Sign in (Tide v1 F-02), in sign-up's look (owner's approved onboarding prototype, 18 Nov 2026): a small
 * title between Back and Help, a large heading with one grey line, soft fields that show their state, one
 * lagoon button. Other ways in show only when they work: the phone code behind `mobilePhoneOtp`, the
 * health card behind `mobileQrSignIn`; never a greyed-out "Not yet" tile.
 *
 * Password signs in by email only (Supabase), so the field says Email. On
 * success the root gate moves the patient into the app.
 */
export default function SignInScreen() {
  const t = useTide();
  const router = useRouter();
  const otpOn = flag("mobilePhoneOtp");
  const qrOn = flag("mobileQrSignIn");
  const [method, setMethod] = useState<Method>("pass");

  return (
    <SignInView
      method={method}
      otpOn={otpOn}
      qrOn={qrOn}
      onMethod={setMethod}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onSignUp={() => router.push("/sign-up")}
    >
      {method === "pass" ? (
        <PasswordForm />
      ) : method === "otp" ? (
        <PhoneCodeForm />
      ) : (
        <View style={{ gap: tSpace[4] }}>
          <Text accessibilityRole="header" style={[tType.title, { fontSize: 22, color: t.ink }]}>
            Scan your card
          </Text>
          <ScanView />
        </View>
      )}
    </SignInView>
  );
}

/**
 * The frame every way of signing in sits in: the header row, "Welcome back", the form, the other ways in
 * where they are switched on, and the way to sign-up at the foot. The form comes in as `children`, so
 * `/dev/onboarding` can draw each state on fixtures.
 */
export function SignInView({
  method,
  otpOn,
  qrOn,
  onMethod,
  onBack,
  onSignUp,
  children,
}: {
  method: Method;
  otpOn: boolean;
  qrOn: boolean;
  onMethod: (next: Method) => void;
  onBack: () => void;
  onSignUp: () => void;
  children: ReactNode;
}) {
  const t = useTide();
  return (
    <Screen
      header={<BarBack label="Back" onPress={onBack} />}
      help="pill"
      helpSource="sign-in"
      barTitle="Sign in"
      growLast
      contentStyle={{ flexGrow: 1, paddingTop: tSpace[3] }}
    >
      <StepHeading key="heading" title="Welcome back" sub="Sign in to see your day." />
      <View key="form">{children}</View>

      {method === "pass" && (otpOn || qrOn) ? (
        <View key="ways" style={{ gap: tSpace[4] }}>
          <OrDivider />
          {otpOn ? (
            <Button
              label="Text me a code"
              icon="smartphone"
              variant="outline"
              onPress={() => onMethod("otp")}
            />
          ) : null}
          {qrOn ? (
            <Button
              label="Scan my health card"
              icon="scan"
              variant="outline"
              onPress={() => onMethod("scan")}
            />
          ) : null}
        </View>
      ) : null}
      {method !== "pass" ? (
        <View key="password" style={{ alignItems: "center" }}>
          <QuietLink label="Use my password instead" onPress={() => onMethod("pass")} />
        </View>
      ) : null}

      <View key="foot" style={{ flexGrow: 1, justifyContent: "flex-end", alignItems: "center" }}>
        <Press
          onPress={onSignUp}
          accessibilityRole="link"
          accessibilityLabel={`New to ${BRAND}? Create an account`}
          haptic={false}
          style={{ minHeight: 48, paddingHorizontal: tSpace[3], justifyContent: "center" }}
        >
          <Text style={[tType.bodyM, { textAlign: "center", color: t.ink2 }]}>
            New to {BRAND}?{" "}
            <Text style={{ fontFamily: tFont.semibold, color: t.accentText }}>
              Create an account
            </Text>
          </Text>
        </Press>
      </View>
    </Screen>
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
      <View style={{ flex: 1, height: 1, backgroundColor: t.lineStrong }} />
      <Text style={[tType.bodyS, { color: t.ink3 }]}>or</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: t.lineStrong }} />
    </View>
  );
}

/* ─── Password ───────────────────────────────────────────────────────── */

function PasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  const typed = email.trim();
  const canSubmit = isEmail(typed) && pw.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const out = await signInWithPassword(typed, pw);
    setBusy(false);
    if (!out.ok) return setError(out.message);
    router.replace("/");
  };

  // The words under the password are about what was sent; they go once either field is changed.
  return (
    <PasswordFormView
      email={email}
      pw={pw}
      show={show}
      busy={busy}
      error={error}
      forgot={forgot}
      onEmail={(v) => {
        setEmail(v);
        setError(null);
      }}
      onPw={(v) => {
        setPw(v);
        setError(null);
      }}
      onToggleShow={() => setShow((s) => !s)}
      onForgot={() => setForgot(true)}
      onSubmit={submit}
    />
  );
}

export function PasswordFormView({
  email,
  pw,
  show,
  busy,
  error,
  forgot,
  onEmail,
  onPw,
  onToggleShow,
  onForgot,
  onSubmit,
}: {
  email: string;
  pw: string;
  show: boolean;
  /** The sign-in is out: the button says "Signing in". */
  busy: boolean;
  /** The server's words when the sign-in was refused, or null. */
  error: string | null;
  forgot: boolean;
  onEmail: (next: string) => void;
  onPw: (next: string) => void;
  onToggleShow: () => void;
  onForgot: () => void;
  onSubmit: () => void;
}) {
  const t = useTide();
  const emailish = isEmail(email.trim());
  const canSubmit = emailish && pw.length > 0 && !busy;
  return (
    <View style={{ gap: tSpace[4] }}>
      <StatusField
        label="Email"
        value={email}
        onChangeText={onEmail}
        state={emailish ? "good" : "idle"}
        icon="mail"
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
          <QuietLink label="Forgot?" onPress={onForgot} />
        </View>
        {/* Not red: a mistyped password is not an emergency (law L3). The triangle and the words say it. */}
        <StatusField
          value={pw}
          onChangeText={onPw}
          state={error ? "bad" : "idle"}
          icon="lock"
          error={error}
          placeholder="Your password"
          secure={!show}
          onToggleSecure={onToggleShow}
          autoComplete="current-password"
          accessibilityLabel="Password"
          inputProps={{
            autoCapitalize: "none",
            autoCorrect: false,
            textContentType: "password",
            returnKeyType: "go",
            onSubmitEditing: onSubmit,
          }}
        />
        {forgot ? (
          <Text style={[tType.bodyS, { lineHeight: 19, color: t.ink2 }]}>
            Resetting a password from the app is not switched on yet. Ask at your hospital&apos;s
            desk, or reset it on the {BRAND} website.
          </Text>
        ) : null}
      </View>
      <Button
        label={busy ? "Signing in" : "Sign in"}
        variant="accent"
        onPress={onSubmit}
        disabled={!canSubmit}
        busy={busy}
      />
    </View>
  );
}

/* ─── Phone code (behind mobilePhoneOtp) ─────────────────────────────── */

function PhoneCodeForm() {
  const now = useNow(1000);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy("send");
    setError(null);
    const out = await sendPhoneCode(e164(phone));
    setBusy(null);
    if (!out.ok) return setError(out.message);
    setCode("");
    setSentAt(Date.now());
  };

  const verify = async () => {
    setBusy("verify");
    setError(null);
    const out = await verifyPhoneCode(e164(phone), code);
    setBusy(null);
    if (!out.ok) setError(out.message);
  };

  return (
    <PhoneCodeView
      phone={phone}
      code={code}
      sent={sentAt !== null}
      resendIn={
        sentAt === null ? 0 : Math.max(0, RESEND_S - Math.floor((now.getTime() - sentAt) / 1000))
      }
      sending={busy === "send"}
      verifying={busy === "verify"}
      error={error}
      onPhone={setPhone}
      onCode={setCode}
      onSend={send}
      onVerify={verify}
      onChangeNumber={() => {
        setSentAt(null);
        setCode("");
        setError(null);
      }}
    />
  );
}

export function PhoneCodeView({
  phone,
  code,
  sent,
  resendIn,
  sending,
  verifying,
  error,
  onPhone,
  onCode,
  onSend,
  onVerify,
  onChangeNumber,
}: {
  phone: string;
  code: string;
  /** A code has been sent: ask for it instead of the number. */
  sent: boolean;
  /** Seconds until "Send again" opens; 0 when it is open. */
  resendIn: number;
  sending: boolean;
  /** The code is being checked: the button says "Signing in". */
  verifying: boolean;
  error: string | null;
  onPhone: (next: string) => void;
  onCode: (next: string) => void;
  onSend: () => void;
  onVerify: () => void;
  onChangeNumber: () => void;
}) {
  const t = useTide();
  const busy = sending || verifying;

  if (!sent)
    return (
      <View style={{ gap: tSpace[4] }}>
        <Text style={[tType.bodyM, { color: t.ink2 }]}>
          Use the number your hospital has for you. We send a code by SMS.
        </Text>
        <StatusPhoneField
          large
          value={phone}
          onChangeText={onPhone}
          error="Ugandan mobile numbers start with 7, like 772 000 000"
        />
        {error ? <FieldProblem>{error}</FieldProblem> : null}
        <Button
          label="Send me a code"
          variant="accent"
          onPress={onSend}
          disabled={!isUgMobile(phone)}
          busy={busy}
        />
      </View>
    );

  return (
    <View style={{ gap: tSpace[4] }}>
      <Text style={[tType.bodyM, { color: t.ink2 }]}>
        We sent 6 numbers to{" "}
        <Text style={{ fontFamily: tFont.bold, color: t.ink }}>+256 {phone}</Text>.
      </Text>
      <CodeBoxes value={code} onChangeText={onCode} length={CODE_LENGTH} />
      {error ? <FieldProblem>{error}</FieldProblem> : null}
      <Button
        label={verifying ? "Signing in" : "Sign in"}
        variant="accent"
        onPress={onVerify}
        disabled={code.length !== CODE_LENGTH}
        busy={busy}
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          minHeight: 48,
        }}
      >
        {resendIn > 0 ? (
          <Text style={[tType.labelS, { fontSize: 13, color: t.ink3 }]}>
            Send again in 0:{String(resendIn).padStart(2, "0")}
          </Text>
        ) : (
          <QuietLink label="Send again" onPress={onSend} />
        )}
        <QuietLink label="Change number" onPress={onChangeNumber} />
      </View>
      <Note tone="plain" icon={null}>
        {BRAND} staff will never ask you for this code.
      </Note>
    </View>
  );
}
