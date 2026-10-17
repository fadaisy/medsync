import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/tide/icon";
import { Press } from "@/components/tide/press";
import { HelpButton } from "@/components/tide/screen";
import { motion } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

/**
 * A bottom sheet that does a short task in place: the reading and medicine
 * sheets on the Plus (ADR 0341 allows sheets on the patient phone).
 *
 * A system modal, so focus stays inside it and Android back closes it. The
 * scrim closes it on tap. Help stays reachable above the scrim (law L6).
 */
export function Sheet({
  visible,
  onClose,
  overline,
  overlineColor,
  title,
  children,
  label,
}: {
  visible: boolean;
  onClose: () => void;
  overline?: string;
  overlineColor?: string;
  title: string;
  children: ReactNode;
  /** Screen-reader name for the sheet; defaults to the title. */
  label?: string;
}) {
  const t = useTide();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View style={[{ flex: 1 }, motion.scrimIn(reduced)]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ position: "absolute", inset: 0, backgroundColor: t.scrim }}
        />
      </Animated.View>
      <View style={{ position: "absolute", top: insets.top + 6, right: tSpace[5] }}>
        <HelpButton source="sheet" />
      </View>
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={label ?? title}
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: "88%",
            borderTopLeftRadius: tRadius.sheet,
            borderTopRightRadius: tRadius.sheet,
            backgroundColor: t.surface,
            boxShadow: t.shadow.float,
          },
          motion.sheetUp(reduced),
        ]}
      >
        <ScrollView
          bounces={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: tSpace[2.5],
            paddingHorizontal: tSpace[4],
            paddingBottom: Math.max(insets.bottom, tSpace[4]) + tSpace[2.5],
            gap: tSpace[3],
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
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: tSpace[1],
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              {overline ? (
                <Text style={[tType.overline, { color: overlineColor ?? t.ink3 }]}>{overline}</Text>
              ) : null}
              <Text
                accessibilityRole="header"
                style={[tType.title, { fontFamily: tType.display.fontFamily, color: t.ink }]}
              >
                {title}
              </Text>
            </View>
            <Press
              onPress={onClose}
              accessibilityLabel="Close"
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: t.surface2,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="close" size={18} color={t.ink} strokeWidth={2.2} />
            </Press>
          </View>
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
