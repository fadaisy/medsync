import type { Anim } from "@/motion/presets";
import { useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { Button, Icon, IconDisc, Note, Press } from "@/components/tide";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

const FRAME = 220;
const CORNER = 36;

/**
 * The scan line sweeping the frame while the camera looks. It is a state
 * ("looking"), so it moves; under reduce motion it holds still mid-frame.
 */
function scanLine(reduced: boolean): Anim {
  if (reduced) return { animationName: "none" };
  return {
    animationName: {
      from: { transform: [{ translateY: 12 }] },
      to: { transform: [{ translateY: FRAME - 15 }] },
    },
    animationDuration: 2000,
    animationIterationCount: "infinite",
    animationDirection: "alternate",
    animationTimingFunction: "ease-in-out",
  };
}

/**
 * "Scan your card" (behind `mobileQrSignIn`): the camera with corner
 * brackets, a scan line and the torch. No engine exchanges a card's code for
 * a session yet, so a found code says so plainly and signs nobody in. The
 * code itself is not read, kept or sent.
 */
export function ScanView() {
  const t = useTide();
  const reduced = useReducedMotion();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [found, setFound] = useState(false);

  if (!permission?.granted)
    return (
      <View style={{ gap: tSpace[3] }}>
        <Note tone="info" icon="camera">
          MedSync needs the camera to read the QR code on your health card. Nothing else is
          recorded.
        </Note>
        <Button
          label="Allow the camera"
          variant="primary"
          onPress={() => void requestPermission()}
        />
      </View>
    );

  const frame = found ? t.accent : t.onBand;
  const corner = (pos: "tl" | "tr" | "bl" | "br") => ({
    position: "absolute" as const,
    width: CORNER,
    height: CORNER,
    borderColor: frame,
    ...(pos[0] === "t" ? { top: 0, borderTopWidth: 4 } : { bottom: 0, borderBottomWidth: 4 }),
    ...(pos[1] === "l" ? { left: 0, borderLeftWidth: 4 } : { right: 0, borderRightWidth: 4 }),
    ...(pos === "tl" ? { borderTopLeftRadius: 10 } : {}),
    ...(pos === "tr" ? { borderTopRightRadius: 10 } : {}),
    ...(pos === "bl" ? { borderBottomLeftRadius: 10 } : {}),
    ...(pos === "br" ? { borderBottomRightRadius: 10 } : {}),
  });

  return (
    <View style={{ gap: tSpace[3] }}>
      <View
        style={{
          height: 380,
          borderRadius: tRadius.xl,
          overflow: "hidden",
          backgroundColor: t.band,
        }}
      >
        <CameraView
          style={{ position: "absolute", inset: 0 }}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={found ? undefined : () => setFound(true)}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: FRAME,
            height: FRAME,
            marginLeft: -FRAME / 2,
            marginTop: -FRAME / 2,
          }}
        >
          <View style={corner("tl")} />
          <View style={corner("tr")} />
          <View style={corner("bl")} />
          <View style={corner("br")} />
          {found ? (
            <View
              style={{
                position: "absolute",
                inset: 0,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconDisc name="check" size={72} color={t.onAccent} bg={t.accent} />
            </View>
          ) : (
            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: 12,
                  right: 12,
                  top: 0,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: t.accent,
                  boxShadow: t.shadow.accent,
                },
                scanLine(reduced),
              ]}
            />
          )}
        </View>
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 18,
            flexDirection: "row",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <Press
            onPress={() => setTorch((v) => !v)}
            accessibilityLabel="Torch"
            accessibilityState={{ checked: torch }}
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: torch ? t.onBand : t.bandGlass,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="torch" size={20} color={torch ? t.band : t.onBand} />
          </Press>
          <View
            accessibilityLiveRegion="polite"
            style={{
              minHeight: 48,
              paddingHorizontal: tSpace[4],
              borderRadius: tRadius.pill,
              backgroundColor: t.bandGlass,
              justifyContent: "center",
            }}
          >
            <Text style={[tType.caption, { fontSize: 13, color: t.onBand }]}>
              {found ? "Found a code" : "Looking for your QR code…"}
            </Text>
          </View>
        </View>
      </View>
      {found ? (
        <Note tone="plain" icon="info">
          Signing in with a health card is not connected yet. Use a phone code or your password.
        </Note>
      ) : null}
    </View>
  );
}
