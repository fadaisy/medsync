import type { CatalogItem } from "@shared/symptom-catalog/types";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { t as say } from "@shared/symptom-catalog/classify";
import { TIER_LABEL_KEY } from "@shared/symptom-catalog/types";
import * as Haptics from "expo-haptics";
import { Linking, Text, View } from "react-native";

import { Button, Icon, Press } from "@/components/tide";
import { telUrl } from "@/lib/emergency";
import { emergencyEvent } from "@/lib/symptoms";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

/**
 * The red parts of the symptom steps (the danger interrupt, colour law):
 * the "Any of these, right now?" card with its signs, the in-place Help
 * panel a sign opens, and the "This needs help now" result. Red is always
 * paired with words.
 */
export function DangerSigns({
  signs,
  selected,
  onPress,
  children,
}: {
  signs: { key: string; label: string }[];
  selected: string[];
  onPress: (key: string) => void;
  /** The in-place Help panel, when a sign is chosen. */
  children?: ReactNode;
}) {
  const t = useTide();
  return (
    <View
      style={{
        gap: tSpace[2],
        padding: tSpace[3.5],
        borderRadius: tRadius.card,
        backgroundColor: t.surface,
        borderWidth: 2,
        borderColor: t.critical.tint,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2] }}>
        <Icon name="alert" size={20} color={t.critical.text} />
        <Text accessibilityRole="header" style={[tType.label, { color: t.ink }]}>
          Any of these, right now?
        </Text>
      </View>
      {signs.map((s) => {
        const on = selected.includes(s.key);
        return (
          <Press
            key={s.key}
            onPress={() => onPress(s.key)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={s.label}
            style={{
              minHeight: 52,
              flexDirection: "row",
              alignItems: "center",
              gap: tSpace[2.5],
              paddingHorizontal: tSpace[3],
              paddingVertical: tSpace[2.5],
              borderRadius: tRadius.md,
              backgroundColor: t.critical.tint,
            }}
          >
            <Text style={[tType.labelS, { flex: 1, fontSize: 15, lineHeight: 20, color: t.ink }]}>
              {s.label}
            </Text>
            {on ? <Icon name="check" size={18} color={t.critical.text} strokeWidth={3} /> : null}
          </Press>
        );
      })}
      {children}
    </View>
  );
}

/**
 * Opened in place the moment an answer points to an emergency (PRD §5.4): one
 * Warning haptic as it appears, the item's own words, a call to the
 * hospital's registered number when one is known (ADR 0084 §3), Help, and
 * the one way back, "This is not happening now", logged as `declined`. The
 * item stays ticked either way. A self-harm item (PRD §5.5) opens calmly
 * instead: no red, no haptic, and its next step is someone to talk to.
 */
export function HelpPanel({
  item,
  hospitalName,
  emergencyPhone,
  onHelp,
  onNotNow,
}: {
  item: CatalogItem;
  hospitalName: string | null;
  emergencyPhone: string | null;
  onHelp: () => void;
  onNotNow: () => void;
}) {
  const t = useTide();
  const itemKey = item.key;
  const calm = item.flags?.includes("crisis_route") ?? false;

  useEffect(() => {
    if (!calm)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    emergencyEvent({ event: "interrupt_shown", itemKey });
  }, [itemKey, calm]);

  const call = () => {
    if (!emergencyPhone) return;
    emergencyEvent({ event: "call_tapped", itemKey });
    void Linking.openURL(telUrl(emergencyPhone)).catch(() => {});
  };
  const notNow = () => {
    emergencyEvent({ event: "declined", itemKey });
    onNotNow();
  };

  if (calm)
    return (
      <View
        accessibilityLiveRegion="polite"
        style={{
          gap: tSpace[2.5],
          padding: tSpace[3.5],
          borderRadius: tRadius.md,
          backgroundColor: t.surface2,
        }}
      >
        <Text style={[tType.label, { color: t.ink }]}>
          You don’t have to go through this alone.
        </Text>
        <Text style={[tType.bodyS, { color: t.ink2 }]}>
          Talking to someone now can help. These people are there to listen.
        </Text>
        <Button label="Someone to talk to" onPress={onHelp} />
        <Button label="This is not happening now" variant="outline" size="md" onPress={notNow} />
      </View>
    );

  return (
    <View
      accessibilityLiveRegion="assertive"
      style={{
        gap: tSpace[2.5],
        padding: tSpace[3.5],
        borderRadius: tRadius.md,
        backgroundColor: t.critical.tint,
      }}
    >
      <Text style={[tType.label, { color: t.ink }]}>
        This needs help now. Do not wait for a booking.
      </Text>
      <Text style={[tType.bodyS, { color: t.ink2 }]}>
        Because you chose: {say(CATALOG, item.labelKey)}. Call, or go to the nearest hospital.
      </Text>
      {emergencyPhone ? (
        <Button
          label={`Call ${hospitalName ?? "the hospital"}`}
          icon="phone"
          variant="danger"
          accessibilityLabel={`Call ${hospitalName ?? "the hospital"} on ${emergencyPhone}`}
          onPress={call}
        />
      ) : null}
      <Button
        label="Get help now"
        icon="phone"
        variant={emergencyPhone ? "outline" : "danger"}
        onPress={onHelp}
      />
      <Button label="This is not happening now" variant="outline" size="md" onPress={notNow} />
    </View>
  );
}

/** Step 3 when the answers point to an emergency. */
export function DangerResult({ because }: { because: string[] }) {
  const t = useTide();
  return (
    <View
      style={{
        gap: tSpace[2.5],
        padding: tSpace[4.5],
        borderRadius: tRadius.panel,
        backgroundColor: t.critical.tint,
      }}
    >
      <Text style={[tType.micro, { letterSpacing: 0.8, color: t.critical.text }]}>
        {say(CATALOG, TIER_LABEL_KEY.E).toUpperCase()}
      </Text>
      <Text accessibilityRole="header" style={[tType.title, { color: t.ink }]}>
        This needs help now
      </Text>
      <Text style={[tType.bodyM, { color: t.ink2 }]}>
        Do not wait for a booking. Call or go to the nearest emergency unit.
        {because.length ? ` Because you chose: ${because.join(" · ")}.` : ""}
      </Text>
    </View>
  );
}
