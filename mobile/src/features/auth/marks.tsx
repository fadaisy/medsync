import type { IconName } from "@/components/tide/icon";
import type { Step } from "@/features/auth/rules";
import type { ReactNode } from "react";
import type { KeyboardTypeOptions, TextInputInstance, TextInputProps } from "react-native";
import { Fragment, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { FieldLabel, formatUgPhone, isUgMobile } from "@/components/tide/field";
import { Icon } from "@/components/tide/icon";
import { Press } from "@/components/tide/press";
import { STEP_NAMES } from "@/features/auth/rules";
import { transition } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * The status language of sign-up and sign-in (owner's approved onboarding prototype, 18 Nov 2026).
 *
 * Three marks, each with words: a tick (done, or good), a triangle (needs fixing) and a ring (still to
 * come). All three are ink. None is red, amber or green, because a mistyped email is not a clinical state
 * (laws L3, L4), and they are told apart by shape and by the words beside or under them, never by colour.
 */
export type MarkKind = "tick" | "triangle" | "ring";

export function Mark({
  kind,
  size = 20,
  color,
}: {
  kind: MarkKind;
  size?: number;
  /** The ring's edge; the tick and the triangle are always ink. */
  color?: string;
}) {
  const t = useTide();
  if (kind === "tick")
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: t.primary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="check" size={Math.round(size * 0.6)} color={t.onPrimary} strokeWidth={3} />
      </View>
    );
  if (kind === "triangle") return <Icon name="alert" size={size} color={t.ink} />;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: color ?? t.lineStrong,
      }}
    />
  );
}

/* ─── Links ──────────────────────────────────────────────────────────── */

/** Cancel or Back at the left of the header row, with its word. A 48pt touch around a 44pt control. */
export function BarBack({
  label,
  icon = "back",
  onPress,
}: {
  label: string;
  icon?: "back" | "close";
  onPress: () => void;
}) {
  const t = useTide();
  return (
    <Press
      onPress={onPress}
      accessibilityLabel={label}
      hitSlop={{ top: 2, bottom: 2, left: tSpace[5], right: tSpace[2] }}
      style={{
        minHeight: 44,
        paddingRight: tSpace[3],
        flexDirection: "row",
        alignItems: "center",
        gap: tSpace[1],
      }}
    >
      <Icon name={icon} size={20} color={t.ink} />
      <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>{label}</Text>
    </Press>
  );
}

/** A link in lagoon ink ("Forgot?", "Change number"), with a 48pt touch around its one line. */
export function QuietLink({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTide();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="link"
      // A 20pt line with 14 above and below: 48pt to touch.
      hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
      haptic={false}
    >
      <Text style={[tType.labelS, { fontSize: 15, lineHeight: 20, color: t.accentText }]}>
        {label}
      </Text>
    </Press>
  );
}

/* ─── Fields ─────────────────────────────────────────────────────────── */

/** `opt`: empty, and allowed to stay empty. */
export type StatusState = "idle" | "good" | "bad" | "opt";

/** What a screen reader hears for the mark at the right end of a field. */
export const STATE_WORDS: Record<StatusState, string> = {
  idle: "Not filled in yet",
  good: "Good",
  bad: "Needs fixing",
  opt: "Optional",
};

/** The right end of a field: its own icon while untouched, then the tick, the triangle or "Optional". */
export function FieldMark({ state, icon }: { state: StatusState; icon: IconName }) {
  const t = useTide();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={STATE_WORDS[state]}
      style={{ minWidth: 24, height: 24, alignItems: "center", justifyContent: "center" }}
    >
      {state === "good" ? (
        <Mark kind="tick" />
      ) : state === "bad" ? (
        <Mark kind="triangle" />
      ) : state === "opt" ? (
        <Text style={[tType.bodyS, { lineHeight: 17, color: t.ink3 }]}>Optional</Text>
      ) : (
        <Icon name={icon} size={20} color={t.ink3} />
      )}
    </View>
  );
}

/** The words under a field that needs fixing (or under the form, when the server said no): triangle, then ink. */
export function FieldProblem({ children, center = false }: { children: string; center?: boolean }) {
  const t = useTide();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: center ? "center" : "flex-start",
        gap: tSpace[1.5],
      }}
    >
      <Mark kind="triangle" size={16} />
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          tType.bodyS,
          { flexShrink: 1, fontFamily: tFont.semibold, lineHeight: 17, color: t.ink },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

const FIELD_H = 52;
const FIELD_H_LARGE = 64;

/**
 * A text field that shows its state at its right end. 16pt text so phones never zoom (law L13); a hairline
 * ring that turns to 2pt ink when the value needs fixing, with the real words under it. The lagoon ring is
 * the focus ring only.
 */
export function StatusField({
  label,
  value,
  onChangeText,
  state = "idle",
  icon,
  mark = true,
  error,
  placeholder,
  secure,
  onToggleSecure,
  keyboardType,
  autoComplete,
  maxLength,
  textAlign,
  accessibilityLabel,
  prefix,
  large = false,
  inputProps,
}: {
  label?: string;
  value: string;
  onChangeText: (next: string) => void;
  state?: StatusState;
  /** The field's own icon, shown at the right end until the field has a state to show. */
  icon: IconName;
  /** False for a box that shares its mark with a neighbour (the day and month of a date). */
  mark?: boolean;
  /** Shown under the field while its state is `bad`. */
  error?: string | null;
  placeholder?: string;
  /** Hide the text; with `onToggleSecure` an eye button shows it. */
  secure?: boolean;
  onToggleSecure?: () => void;
  keyboardType?: KeyboardTypeOptions;
  autoComplete?: TextInputProps["autoComplete"];
  maxLength?: number;
  textAlign?: "left" | "center";
  accessibilityLabel?: string;
  /** Sits before the text inside the field ("+256"). */
  prefix?: ReactNode;
  large?: boolean;
  inputProps?: TextInputProps;
}) {
  const t = useTide();
  const [focused, setFocused] = useState(false);
  const h = large ? FIELD_H_LARGE : FIELD_H;
  const ring = state === "bad" ? `2px ${t.ink}` : focused ? `2px ${t.focus}` : `1px ${t.line}`;
  const centred = textAlign === "center";
  return (
    <View style={{ gap: tSpace[1.5] }}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: h,
          paddingLeft: prefix ? tSpace[4] : 0,
          paddingRight: onToggleSecure ? tSpace[1] : mark ? tSpace[3.5] : 0,
          borderRadius: large ? tRadius.card : tRadius.field,
          backgroundColor: t.surface,
          boxShadow: `inset 0px 0px 0px ${ring}`,
        }}
      >
        {prefix}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.ink4}
          secureTextEntry={secure}
          keyboardType={keyboardType}
          autoComplete={autoComplete}
          maxLength={maxLength}
          accessibilityLabel={accessibilityLabel ?? label}
          {...inputProps}
          onFocus={(e) => {
            setFocused(true);
            inputProps?.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps?.onBlur?.(e);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            height: h,
            paddingLeft: centred ? tSpace[1] : prefix ? tSpace[2.5] : tSpace[4],
            paddingRight: centred ? tSpace[1] : tSpace[2],
            paddingVertical: 0,
            fontFamily: tFont.medium,
            fontSize: large ? 18 : 16,
            color: t.ink,
            textAlign,
          }}
        />
        {mark ? <FieldMark state={state} icon={icon} /> : null}
        {onToggleSecure ? (
          <Press
            onPress={onToggleSecure}
            accessibilityLabel={secure ? "Show password" : "Hide password"}
            style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name={secure ? "eyeOff" : "eye"} size={20} color={t.ink2} />
          </Press>
        ) : null}
      </View>
      {error && state === "bad" ? <FieldProblem>{error}</FieldProblem> : null}
    </View>
  );
}

/**
 * A Ugandan mobile number behind "+256". It formats itself as it is typed and reads its own state, exactly
 * as the kit's `PhoneField` does: good once it is a mobile number, needs fixing once nine digits are in
 * and it is not.
 */
export function StatusPhoneField({
  label,
  value,
  onChangeText,
  error,
  large = false,
}: {
  label?: string;
  value: string;
  onChangeText: (next: string) => void;
  error?: string | null;
  large?: boolean;
}) {
  const t = useTide();
  const digits = value.replace(/ /g, "");
  const state: StatusState = isUgMobile(value) ? "good" : digits.length >= 9 ? "bad" : "idle";
  return (
    <StatusField
      label={label}
      value={value}
      onChangeText={(v) => onChangeText(formatUgPhone(v))}
      state={state}
      icon="smartphone"
      error={error}
      placeholder="772 000 000"
      keyboardType="number-pad"
      autoComplete="tel-national"
      accessibilityLabel={label ?? "Phone number"}
      large={large}
      prefix={
        <Text style={[tType.label, { fontSize: large ? 18 : 16, lineHeight: 22, color: t.ink2 }]}>
          +256
        </Text>
      }
    />
  );
}

/**
 * The texted code as separate boxes over one hidden input, so SMS autofill and paste still work. The next
 * box to fill carries the ink ring.
 */
export function CodeBoxes({
  value,
  onChangeText,
  length,
}: {
  value: string;
  onChangeText: (next: string) => void;
  length: number;
}) {
  const t = useTide();
  const ref = useRef<TextInputInstance>(null);
  return (
    <Pressable
      onPress={() => ref.current?.focus()}
      accessibilityRole="none"
      style={{ flexDirection: "row", gap: tSpace[2] }}
    >
      {Array.from({ length }, (_, i) => {
        const next = i === value.length;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: 60,
              borderRadius: tRadius.field,
              backgroundColor: t.surface,
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `inset 0px 0px 0px ${next ? `2px ${t.ink}` : `1px ${t.line}`}`,
            }}
          >
            <Text style={{ fontFamily: tFont.monoSemibold, fontSize: 24, color: t.ink }}>
              {value[i] ?? ""}
            </Text>
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(v) => onChangeText(v.replace(/[^0-9]/g, "").slice(0, length))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        accessibilityLabel={`${length}-digit code`}
        style={{ position: "absolute", inset: 0, opacity: 0.02, fontSize: 16 }}
      />
    </Pressable>
  );
}

/* ─── A choice as tiles ──────────────────────────────────────────────── */

/** One answer from a few, two to a row. The chosen tile carries the tick and a 2pt ink ring; the others a ring. */
export function ChoiceTiles<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { key: K; label: string }[];
  value: K | null;
  onChange: (next: K) => void;
}) {
  const t = useTide();
  return (
    <View style={{ gap: tSpace[1.5] }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <FieldLabel>{label}</FieldLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[2] }}>
        {options.map((o) => {
          const on = value === o.key;
          return (
            <Press
              key={o.key}
              onPress={() => onChange(o.key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              style={{
                flexBasis: "45%",
                flexGrow: 1,
                minHeight: 48,
                paddingLeft: tSpace[4],
                paddingRight: tSpace[3],
                borderRadius: tRadius.field,
                backgroundColor: t.surface,
                boxShadow: `inset 0px 0px 0px ${on ? `2px ${t.ink}` : `1px ${t.line}`}`,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: tSpace[2],
              }}
            >
              <Text style={[tType.label, { flexShrink: 1, fontSize: 15, color: t.ink }]}>
                {o.label}
              </Text>
              <Mark kind={on ? "tick" : "ring"} />
            </Press>
          );
        })}
      </View>
    </View>
  );
}

/* ─── The steps ──────────────────────────────────────────────────────── */

const STEPS: readonly Step[] = [1, 2, 3, 4];

/** What a screen reader hears for one mark of the stepper. */
export function stepLabel(n: Step, current: Step): string {
  const where =
    n < current ? "done. Go back to it." : n === current ? "this step" : "still to come";
  return `Step ${n} of 4, ${STEP_NAMES[n]}, ${where}`;
}

/**
 * Four marks joined by a line: a tick for a finished step (tap it to go back), a filled mark with its name
 * for the step you are on, a ring for a step still to come. The page's title says "Step n of 4".
 */
export function StepRail({ step, onGo }: { step: Step; onGo: (step: Step) => void }) {
  const t = useTide();
  const reduced = useReducedMotion();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: 48,
        marginHorizontal: -tSpace[2],
      }}
    >
      {STEPS.map((n) => {
        const done = n < step;
        const now = n === step;
        return (
          <Fragment key={n}>
            {n > 1 ? (
              <Animated.View
                style={[
                  {
                    flex: 1,
                    minWidth: 6,
                    height: 2,
                    borderRadius: 1,
                    backgroundColor: n <= step ? t.ink : t.lineStrong,
                  },
                  transition.colour(reduced),
                ]}
              />
            ) : null}
            <Press
              onPress={done ? () => onGo(n) : undefined}
              disabled={!done}
              accessibilityLabel={stepLabel(n, step)}
              accessibilityState={{ selected: now }}
              style={{
                flexShrink: now ? 1 : 0,
                height: 48,
                minWidth: 48,
                paddingHorizontal: tSpace[2],
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: tSpace[2],
              }}
            >
              {done ? (
                <Mark kind="tick" size={24} />
              ) : now ? (
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: t.ink,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View
                    style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.ink }}
                  />
                </View>
              ) : (
                <Mark kind="ring" size={24} />
              )}
              {now ? (
                <Text
                  numberOfLines={1}
                  style={[tType.label, { flexShrink: 1, fontSize: 15, color: t.ink }]}
                >
                  {STEP_NAMES[n]}
                </Text>
              ) : null}
            </Press>
          </Fragment>
        );
      })}
    </View>
  );
}

/** One line above a main button that cannot be pressed yet: what the step is still waiting for. */
export function StillNeeded({ names }: { names: readonly string[] }) {
  const t = useTide();
  if (names.length === 0) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "center",
        gap: tSpace[1.5],
      }}
    >
      <Mark kind="ring" size={16} color={t.ink3} />
      <Text style={[tType.bodyS, { flexShrink: 1, lineHeight: 17, color: t.ink2 }]}>
        {`Still needed: ${names.join(", ")}`}
      </Text>
    </View>
  );
}
