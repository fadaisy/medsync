import type { PinSpot } from "@/features/auth/rules";
import type { GestureResponderEvent, LayoutChangeEvent } from "react-native";
import { useState } from "react";
import * as Location from "expo-location";
import { Pressable, Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import Svg, { Circle, G, Path, Rect, Text as SvgText } from "react-native-svg";

import { Icon, Press } from "@/components/tide";
import { MAP_ART } from "@/data/signup";
import { motion } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/** The drawing's own units (the board's 350 × 220 map). */
const W = 350;
const H = 220;
/** Degrees per drawing unit, from the board. Only offsets from a real fix use it. */
const DEG_PER_UNIT = 0.0004;

/** A real fix from "Use my location", tied to the drawing's centre. */
export interface PinAnchor {
  lat: number;
  lng: number;
}

/** Coordinates for the pin: offsets from the real fix. None until the patient asks for location. */
export function pinCoords(pin: PinSpot, anchor: PinAnchor | null): string | null {
  if (!anchor) return null;
  const lat = anchor.lat + (H / 2 - pin.y) * DEG_PER_UNIT;
  const lng = anchor.lng + (pin.x - W / 2) * DEG_PER_UNIT;
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? "E" : "W"}`;
}

/**
 * "Pin your home": a drawn street map, tap to move the pin, zoom, use my
 * location. The pin is navy with a teal centre, never red. Nothing here is
 * sent anywhere: there is no column for it yet (see the Gate 2 report), and
 * the coordinates of a location fix are never logged.
 */
export function MapPin({
  pin,
  onPin,
  anchor,
  onAnchor,
}: {
  pin: PinSpot | null;
  onPin: (next: PinSpot) => void;
  anchor: PinAnchor | null;
  onAnchor: (next: PinAnchor) => void;
}) {
  const t = useTide();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [drops, setDrops] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);

  const k = width > 0 ? width / W : 1;
  const at = pin ?? { x: W / 2, y: H / 2 };

  const place = (next: PinSpot) => {
    onPin({ x: Math.max(16, Math.min(W - 20, next.x)), y: Math.max(44, Math.min(H - 4, next.y)) });
    setDrops((n) => n + 1);
  };

  const onTap = (e: GestureResponderEvent) => {
    const u = e.nativeEvent.locationX / k;
    const v = e.nativeEvent.locationY / k;
    // Undo the zoom, which is centred on the pin.
    place({ x: at.x + (u - at.x) / zoom, y: at.y + (v - at.y) / zoom });
  };

  const locate = async () => {
    setLocating(true);
    setLocNote(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        setLocNote("Location is off for MedSync. Tap the map instead.");
        return;
      }
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      onAnchor({ lat: fix.coords.latitude, lng: fix.coords.longitude });
      place({ x: W / 2, y: H / 2 });
    } catch {
      setLocNote("We couldn't find your location. Tap the map instead.");
    } finally {
      setLocating(false);
    }
  };

  const coords = pin ? pinCoords(pin, anchor) : null;
  const pinWord = locating ? "Finding you…" : pin ? "Pin set" : "Tap the map to set";

  return (
    <View style={{ gap: tSpace[1.5] }}>
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={{
          aspectRatio: W / H,
          borderRadius: tRadius.card,
          overflow: "hidden",
          boxShadow: `inset 0px 0px 0px 1px ${t.line}, ${t.shadow.card}`,
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            inset: 0,
            transform: [{ scale: zoom }],
            transformOrigin: `${at.x * k}px ${at.y * k}px`,
          }}
        >
          <MapDrawing />
        </View>
        {/* Unscaled, on top: taps arrive in the frame's own units whatever the zoom. */}
        <Pressable
          onPress={onTap}
          accessibilityRole="button"
          accessibilityLabel="Map. Tap to move the pin to your home."
          style={{ position: "absolute", inset: 0 }}
        />
        {pin ? (
          <>
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: pin.x * k - 9,
                top: pin.y * k - 3,
                width: 18,
                height: 6,
                borderRadius: 3,
                backgroundColor: MAP_ART.shadow,
              }}
            />
            <Animated.View
              key={drops}
              pointerEvents="none"
              accessibilityLabel="Your pin"
              style={[
                { position: "absolute", left: pin.x * k - 16, top: pin.y * k - 44 },
                motion.pinDrop(reduced),
              ]}
            >
              <Svg width={32} height={44} viewBox="0 0 32 44">
                <Path
                  d="M16 43c0 0 14-14.5 14-27A14 14 0 0 0 2 16c0 12.5 14 27 14 27z"
                  fill={t.band}
                />
                <Circle cx={16} cy={16} r={6} fill={t.accent} />
              </Svg>
            </Animated.View>
          </>
        ) : null}
        <View
          style={{
            position: "absolute",
            right: 10,
            top: 10,
            borderRadius: 12,
            overflow: "hidden",
            backgroundColor: t.surface,
            boxShadow: t.shadow.float,
          }}
        >
          <Press
            onPress={() => setZoom((z) => Math.min(2, z + 0.3))}
            accessibilityLabel="Zoom in"
            hitSlop={4}
            style={{ width: 44, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="plus" size={18} color={t.ink} strokeWidth={2.2} />
          </Press>
          <View style={{ height: 1, backgroundColor: t.line }} />
          <Press
            onPress={() => setZoom((z) => Math.max(1, z - 0.3))}
            accessibilityLabel="Zoom out"
            hitSlop={4}
            style={{ width: 44, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="minus" size={18} color={t.ink} strokeWidth={2.2} />
          </Press>
        </View>
        <Press
          onPress={locate}
          disabled={locating}
          accessibilityLabel="Use my location"
          style={{
            position: "absolute",
            right: 10,
            bottom: 10,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: t.surface,
            alignItems: "center",
            justifyContent: "center",
            boxShadow: t.shadow.float,
          }}
        >
          <Icon name="locate" size={20} color={t.accentText} />
        </Press>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 10,
            bottom: 10,
            minHeight: 28,
            paddingHorizontal: 10,
            borderRadius: tRadius.pill,
            backgroundColor: t.surface,
            justifyContent: "center",
            boxShadow: t.shadow.card,
          }}
        >
          <Text style={[tType.micro, { fontFamily: tFont.semibold, color: t.ink }]}>{pinWord}</Text>
        </View>
      </View>
      {coords ? (
        <Text
          style={{ fontFamily: tFont.mono, fontSize: 12, color: t.ink3 }}
          accessibilityLabel={`Pin at ${coords}`}
        >
          {coords}
        </Text>
      ) : null}
      {locNote ? <Text style={[tType.bodyS, { color: t.ink2 }]}>{locNote}</Text> : null}
    </View>
  );
}

/** The street drawing from the board. Labels are illustration, not a real survey. */
function MapDrawing() {
  const a = MAP_ART;
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
      <Rect width={W} height={H} fill={a.paper} />
      <Path
        d="M-10 170 C 60 150, 110 190, 180 175 S 300 140, 360 160 L360 230 L-10 230 Z"
        fill={a.water}
      />
      <Rect x={210} y={22} width={92} height={58} rx={8} fill={a.park} />
      <Rect x={30} y={96} width={56} height={40} rx={6} fill={a.park} />
      <G fill={a.block}>
        <Rect x={20} y={20} width={70} height={60} rx={4} />
        <Rect x={104} y={20} width={90} height={60} rx={4} />
        <Rect x={104} y={96} width={90} height={48} rx={4} />
        <Rect x={210} y={96} width={120} height={48} rx={4} />
        <Rect x={316} y={20} width={40} height={60} rx={4} />
      </G>
      <G stroke={a.road} strokeWidth={9} fill="none" strokeLinecap="round">
        <Path d="M0 88 H350" />
        <Path d="M97 0 V160" />
        <Path d="M202 0 V150" />
        <Path d="M308 0 V140" />
      </G>
      <Path d="M0 83.5 H350 M0 92.5 H350" stroke={a.roadEdge} strokeWidth={1} fill="none" />
      <Path
        d="M-10 130 C 80 120, 150 60, 360 40"
        stroke={a.main}
        strokeWidth={10}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M-10 130 C 80 120, 150 60, 360 40"
        stroke={a.mainEdge}
        strokeWidth={1}
        fill="none"
        strokeOpacity={0.7}
      />
      <G fontFamily={tFont.semibold} fontSize={8} fill={a.label}>
        <SvgText x={226} y={54}>
          Kawempe grounds
        </SvgText>
        <SvgText x={112} y={112}>
          Bwaise II
        </SvgText>
        <SvgText x={230} y={120}>
          Kawempe HC IV
        </SvgText>
        <SvgText x={40} y={190} fill={a.waterLabel}>
          Nsooba channel
        </SvgText>
        <SvgText x={250} y={36} fill={a.mainLabel} rotation={-6} origin="250, 36">
          Bombo Road
        </SvgText>
      </G>
      <G transform="translate(222 113)">
        <Circle r={5} fill={a.road} stroke={a.clinic} strokeWidth={2} />
        <Path d="M-2 0 H2 M0 -2 V2" stroke={a.clinic} strokeWidth={1.5} />
      </G>
    </Svg>
  );
}
