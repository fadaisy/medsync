import type { Palette } from "@/theme/tokens";
import type * as React from "react";
import { useCallback, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";
import { splashPhoto } from "@/theme/splash-photo";
import { useStyles, useTheme } from "@/theme/theme";
import { brand, font, radius, space, withAlpha } from "@/theme/tokens";

/**
 * Share of the screen the photograph keeps. Much less than the splash's 0.85:
 * the form is the subject here, and the image is continuity — the same picture
 * the patient was just looking at, receded.
 */
const PHOTO_HEIGHT_RATIO = 0.42;

/**
 * Sign in.
 *
 * Composed as a continuation of the splash rather than a new place. The splash
 * ends by docking the wordmark into the top-left corner; this screen opens
 * with it already there, over the same photograph, so the app appears to have
 * moved rather than swapped. The form rises on solid ground beneath it.
 *
 * The one thing this screen must get right is failure. A patient mistyping a
 * password on a 2G connection is the common case, not the edge case, so the
 * error is specific about what to do and never about whether the account
 * exists.
 */
export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<"email" | "password" | null>(null);
  // Defaults to hidden. Revealing is the deliberate act, because a patient may
  // well be signing in with someone standing next to them.
  const [showPassword, setShowPassword] = useState(false);

  // Signup still lives on the web until the app owns its own. Caught
  // rejection: there is nothing useful to tell a patient if the OS refuses to
  // open a browser, and an unhandled promise is a redbox in dev.
  const openGetStarted = useCallback(() => {
    Linking.openURL("https://medsync-six.vercel.app/get-started").catch(() => {});
  }, []);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        // Trimmed and lowercased: a phone keyboard capitalises the first letter
        // by default and a trailing space is invisible. Neither should cost a
        // patient an attempt.
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) {
        // Deliberately generic, matching the web. Distinguishing "no such
        // account" from "wrong password" tells an attacker which addresses are
        // registered — and at a hospital, that a person is a patient there.
        setError("That email and password don't match. Check them and try again.");
        return;
      }
      router.replace("/");
    } catch {
      // Network, DNS, captive portal. Separate from a rejected credential
      // because the remedy is completely different.
      setError("Couldn't reach MedSync. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [canSubmit, email, password, router]);

  return (
    <View style={styles.root}>
      {/* Light glyphs in either theme: the bar sits over the top of the
          photograph, and the scrim there is brand-950 whatever the page ground
          is. The form has no ground of its own, so nothing it scrolls under
          the bar changes what the bar sits on. */}
      <StatusBar style="light" />

      {splashPhoto ? (
        <Image
          source={splashPhoto}
          style={[styles.photo, { width: screenW, height: screenH * PHOTO_HEIGHT_RATIO }]}
          resizeMode="cover"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}

      {/* The photograph is the brand moment in either theme, so the top of the
          scrim stays brand-950 (the one place outside `src/theme` that may
          name a ramp step). The lower stops dissolve into the page ground
          instead — white in light, black in dark — so the form rises on the
          patient's own ground rather than on indigo. */}
      <LinearGradient
        colors={[
          withAlpha(brand[950], 0.72),
          withAlpha(brand[950], 0.35),
          withAlpha(colors.background, 0.92),
          colors.background,
        ]}
        locations={[0, 0.12, 0.34, PHOTO_HEIGHT_RATIO]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Already docked — the splash left it here, so the screen appears to
          have moved rather than been replaced. Same gutter, same size. */}
      <View style={[styles.wordmarkAnchor, { left: space[5], top: insets.top + space[2] }]}>
        <Text style={styles.wordmark}>medsync</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.fill}
        // `padding` on iOS, `height` on Android — the two platforms report the
        // keyboard differently and using one behaviour for both leaves the
        // submit button under the keyboard on whichever one loses.
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: screenH * PHOTO_HEIGHT_RATIO * 0.72,
              paddingBottom: insets.bottom + space[8],
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeIn.duration(400)} style={styles.card}>
            <Text style={styles.heading}>Welcome back</Text>
            <Text style={styles.sub}>Sign in to book a visit or check your place in line.</Text>

            <View style={styles.fields}>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocused("email")}
                onBlur={() => setFocused(null)}
                isFocused={focused === "email"}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                placeholder="you@example.com"
              />

              <Field
                ref={passwordRef}
                label="Password"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
                isFocused={focused === "password"}
                autoComplete="current-password"
                textContentType="password"
                secureTextEntry={!showPassword}
                returnKeyType="go"
                onSubmitEditing={onSubmit}
                placeholder="••••••••••••"
                trailing={
                  <Pressable
                    accessibilityRole="button"
                    // Says what tapping DOES, not what the state is — a screen
                    // reader user needs the action, and "password shown" would
                    // read as a label rather than a control.
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    accessibilityState={{ checked: showPassword }}
                    onPress={() => setShowPassword((v) => !v)}
                    // The icon is 22px; hitSlop takes the tappable area past
                    // 44 without making the glyph clumsy.
                    hitSlop={14}
                    style={styles.reveal}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={22}
                      color={showPassword ? colors.primary : colors.mutedForeground}
                    />
                  </Pressable>
                }
              />
            </View>

            {/* Reserved whether or not there is an error, so the button does
                not jump up the screen the moment one appears — under a thumb
                already on its way down, that is a mis-tap. */}
            <View style={styles.errorSlot}>
              {error ? (
                <Animated.View
                  entering={FadeIn.duration(150)}
                  style={styles.well}
                  accessibilityLiveRegion="polite"
                >
                  <Ionicons name="alert-circle-outline" size={18} color={colors.status.cautionFg} />
                  <Text style={styles.wellText}>{error}</Text>
                </Animated.View>
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              accessibilityState={{ disabled: !canSubmit, busy }}
              disabled={!canSubmit}
              onPress={onSubmit}
              style={({ pressed }) => [
                styles.cta,
                !canSubmit && styles.ctaDisabled,
                pressed && canSubmit && styles.ctaPressed,
              ]}
            >
              <Text style={[styles.ctaLabel, !canSubmit && styles.ctaLabelDisabled]}>
                {busy ? "Signing in…" : "Sign in"}
              </Text>
            </Pressable>

            <View style={styles.links}>
              <Pressable accessibilityRole="button" hitSlop={12} style={styles.link}>
                <Text style={styles.linkLabel}>Forgot your password?</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                hitSlop={12}
                accessibilityLabel="Create an account, opens in your browser"
                onPress={openGetStarted}
                style={styles.link}
              >
                <Text style={styles.linkLabel}>Create an account instead</Text>
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * A single field.
 *
 * Underline rather than a boxed input, following the reference: a filled box
 * reads as a second surface and clutters a short form, while a rule under the
 * text is quiet until it is focused. The rule takes the brand colour on focus
 * — not the mint the button uses, which on a white page is 1.5:1 and vanishes
 * as a hairline — and focus is never carried by colour alone: the label lifts
 * in weight too.
 */
function Field({
  label,
  isFocused,
  ref,
  trailing,
  ...input
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  isFocused: boolean;
  /** Optional control on the rule, inside the field's own row. */
  trailing?: React.ReactNode;
  // React 19 passes `ref` as an ordinary prop — no forwardRef wrapper needed.
  // The password field takes one so "next" on the email keyboard moves here
  // rather than dismissing, which is the difference between one gesture and
  // three on a phone.
  ref?: React.Ref<TextInput>;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);

  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, isFocused && styles.fieldLabelFocused]}>{label}</Text>
      {/* The control sits INSIDE the field row, above the same rule, so the
          rule stays one unbroken line under both. Putting it outside would
          make the input narrower than the email field above it and the two
          would stop lining up. */}
      <View style={styles.inputRow}>
        <TextInput
          ref={ref}
          {...input}
          style={styles.input}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          // The keyboard follows the page, not the phone: a patient who chose
          // dark gets a dark keyboard even if the phone is set to light.
          keyboardAppearance={colors.scheme}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {trailing}
      </View>
      <View style={[styles.rule, isFocused && styles.ruleFocused]} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    fill: { flex: 1 },
    photo: { position: "absolute", top: 0, left: 0 },

    wordmarkAnchor: { position: "absolute", zIndex: 2 },
    wordmark: {
      fontFamily: font.wordmark,
      // 46 × the splash's 0.46 dock scale — the mark arrives at exactly the size
      // it left at, so the transition between screens is invisible.
      fontSize: 46 * 0.46,
      letterSpacing: -0.5,
      // A literal, not `c.foreground`: this mark is drawn over the photograph's
      // brand-950 scrim, which is the same in both themes, so its ink is too.
      // It is the one text on this screen the theme contract exempts.
      color: "#ffffff",
    },

    scroll: { paddingHorizontal: space[5], flexGrow: 1 },
    card: { gap: space[5] },

    heading: {
      fontFamily: font.display,
      fontSize: 30,
      letterSpacing: -0.6,
      color: c.foreground,
    },
    sub: {
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.mutedForeground,
      marginTop: -space[3],
    },

    fields: { gap: space[5] },
    field: { gap: space[1] },
    fieldLabel: {
      fontFamily: font.body,
      fontSize: 12,
      letterSpacing: 0.4,
      color: c.mutedForeground,
    },
    fieldLabelFocused: { fontFamily: font.bodyMedium, color: c.primary },
    inputRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
    reveal: { paddingHorizontal: space[1], paddingVertical: space[1] },
    input: {
      fontFamily: font.body,
      fontSize: 17,
      color: c.foreground,
      // Takes the row's spare width so the reveal control sits hard right.
      flex: 1,
      // 44px minimum touch target, and enough room that the caret is not
      // sitting on the rule.
      minHeight: 44,
      paddingVertical: space[2],
    },
    rule: { height: 1, backgroundColor: c.border },
    ruleFocused: { height: 1.5, backgroundColor: c.primary },

    // Fixed height so the layout below never shifts when an error appears —
    // sized to the well at one line (21 text + 2 × 12 padding + 2 border).
    errorSlot: { minHeight: 47, justifyContent: "center" },
    // Not red. A mistyped password is not a clinical emergency, and red on a
    // MedSync surface is reserved for one. Amber says "look at this" without
    // borrowing the register that has to keep meaning something else — and it
    // is the frame and the glyph, not the words: amber text on a white page
    // fails contrast, so the sentence itself is set in the page's own ink.
    well: {
      flexDirection: "row",
      gap: space[2],
      alignItems: "flex-start",
      padding: space[3],
      borderRadius: radius.lg,
      backgroundColor: c.status.cautionBg,
      borderWidth: 1,
      borderColor: c.status.cautionFg,
    },
    wellText: {
      flex: 1,
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.foreground,
    },

    cta: {
      minHeight: 52,
      borderRadius: radius.full,
      backgroundColor: c.cta,
      alignItems: "center",
      justifyContent: "center",
    },
    // Solid tokens rather than a faded mint: a dimmed fill takes the label
    // down with it, and a patient still needs to read what the button will do
    // once it becomes available. The sunken surface with a hairline so it
    // still has an edge on a white page.
    ctaDisabled: { backgroundColor: c.muted, borderWidth: 1, borderColor: c.border },
    ctaPressed: { opacity: 0.88 },
    ctaLabel: {
      fontFamily: font.bodyMedium,
      fontSize: 16,
      color: c.ctaForeground,
    },
    ctaLabelDisabled: { color: c.mutedForeground },

    links: { alignItems: "center", gap: space[2] },
    link: { minHeight: 44, justifyContent: "center" },
    linkLabel: { fontFamily: font.body, fontSize: 14.5, color: c.primary },
  });
