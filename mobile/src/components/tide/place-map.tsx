import type { GeoWords } from "@/data/places";
import type MapViewType from "react-native-maps";
import type { Region } from "react-native-maps";
import { useRef, useState } from "react";
import * as Location from "expo-location";
import { Platform, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

import { Icon } from "@/components/tide/icon";
import { Press } from "@/components/tide/press";
import { Note } from "@/components/tide/primitives";
import { coordWords, geoWords } from "@/data/places";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

/**
 * react-native-maps has no web build, and the lead previews screens on web,
 * so it is required on first draw and never on web. Lazy too so the screens
 * and tests that import the Tide kit never load a native map.
 */
let maps: typeof import("react-native-maps") | null | undefined;
function loadMaps() {
  if (maps === undefined)
    maps =
      Platform.OS === "web"
        ? null
        : // eslint-disable-next-line @typescript-eslint/no-require-imports
          (require("react-native-maps") as typeof import("react-native-maps"));
  return maps;
}

export interface MapPick {
  lat: number;
  lng: number;
  /** The phone geocoder's words for the point; null until it answers, or when it cannot. */
  geo: GeoWords | null;
}

/** Kampala, zoomed to the city, until the patient moves the map or asks for their location. */
const START: Region = {
  latitude: 0.3476,
  longitude: 32.5825,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};
const CLOSE = 0.008;

/**
 * A real map with a fixed pin in the middle: the patient moves the map under
 * it, or taps "Use my location". On iPhone it is Apple Maps (no key, never
 * PROVIDER_GOOGLE); on Android the Google Maps SDK. The chosen point becomes
 * words through the phone's own geocoder (`reverseGeocodeAsync`, free).
 * `onPick` is called with the point at once and again when the words arrive.
 * Nothing here saves or logs the point.
 */
export function PlaceMap({
  value,
  onPick,
  height = 200,
}: {
  /** Where the map opens; afterwards the map is the patient's to move. */
  value: { lat: number; lng: number } | null;
  onPick: (pick: MapPick) => void;
  height?: number;
}) {
  const t = useTide();
  const reduced = useReducedMotion();
  const ref = useRef<MapViewType>(null);
  // Set by a finger on the map, so the map's own first settle never counts as a choice.
  const touched = useRef(false);
  const ask = useRef(0);
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  // The blue dot only after the patient asked: showing it earlier makes the map ask for location itself.
  const [located, setLocated] = useState(false);
  // Satellite with road names by default: a home is easier to find from above. Free on both maps.
  const [satellite, setSatellite] = useState(true);

  const choose = (lat: number, lng: number) => {
    onPick({ lat, lng, geo: null });
    setAddress(null);
    const mine = ++ask.current;
    void wordsFor(lat, lng).then((geo) => {
      if (mine !== ask.current || !geo) return;
      setAddress(geo.address);
      onPick({ lat, lng, geo });
    });
  };

  const locate = async () => {
    setLocating(true);
    setLocNote(null);
    const found = await findMe();
    setLocating(false);
    if ("problem" in found) {
      setLocNote(found.problem);
      return;
    }
    const { lat, lng } = found;
    setLocated(true);
    touched.current = false;
    ref.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: CLOSE, longitudeDelta: CLOSE },
      reduced ? 0 : 400,
    );
    choose(lat, lng);
  };

  const Maps = loadMaps();
  if (!Maps)
    return (
      <Note tone="plain" icon="mapPin">
        Maps open in the app. Type your address below.
      </Note>
    );
  const MapView = Maps.default;

  const coords = value ? coordWords(value.lat, value.lng) : null;

  return (
    <View style={{ gap: tSpace[1.5] }}>
      <View
        style={{
          height,
          borderRadius: tRadius.card,
          overflow: "hidden",
          boxShadow: `inset 0px 0px 0px 1px ${t.line}, ${t.shadow.card}`,
        }}
      >
        <View style={{ flex: 1 }} onTouchStart={() => (touched.current = true)}>
          <MapView
            ref={ref}
            style={{ flex: 1 }}
            accessibilityLabel="Map. Move the map so the pin sits on your place."
            initialRegion={
              value
                ? {
                    latitude: value.lat,
                    longitude: value.lng,
                    latitudeDelta: CLOSE,
                    longitudeDelta: CLOSE,
                  }
                : START
            }
            mapType={satellite ? "hybrid" : "standard"}
            userInterfaceStyle={t.scheme}
            showsUserLocation={located}
            showsMyLocationButton={false}
            toolbarEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            onRegionChangeComplete={(r) => {
              if (!touched.current) return;
              touched.current = false;
              choose(r.latitude, r.longitude);
            }}
          />
        </View>
        {/* The fixed pin: its tip on the map's centre. Navy with a teal centre, never red. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            marginLeft: -16,
            marginTop: -44,
          }}
        >
          <Svg width={32} height={44} viewBox="0 0 32 44">
            <Path d="M16 43c0 0 14-14.5 14-27A14 14 0 0 0 2 16c0 12.5 14 27 14 27z" fill={t.band} />
            <Circle cx={16} cy={16} r={6} fill={t.accent} />
          </Svg>
        </View>
        <Press
          onPress={() => setSatellite((v) => !v)}
          accessibilityLabel={satellite ? "Show the street map" : "Show the satellite view"}
          style={{
            position: "absolute",
            left: 10,
            top: 10,
            minHeight: 44,
            paddingHorizontal: tSpace[3],
            borderRadius: tRadius.pill,
            flexDirection: "row",
            alignItems: "center",
            gap: tSpace[1.5],
            backgroundColor: t.surface,
            boxShadow: t.shadow.float,
          }}
        >
          <Icon name={satellite ? "mapPin" : "globe"} size={16} color={t.ink} />
          <Text style={[tType.labelS, { color: t.ink }]}>{satellite ? "Map" : "Satellite"}</Text>
        </Press>
        <Press
          onPress={() => void locate()}
          disabled={locating}
          accessibilityLabel={locating ? "Finding you" : "Use my location"}
          style={{
            position: "absolute",
            right: 10,
            top: 10,
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: t.surface,
            boxShadow: t.shadow.float,
          }}
        >
          <Icon name="locate" size={20} color={locating ? t.ink3 : t.accentText} />
        </Press>
      </View>
      <Text
        accessibilityLiveRegion="polite"
        accessibilityLabel={coords ? `Pin at ${coords.spoken}. ${address ?? ""}` : undefined}
        style={[tType.bodyS, { color: address ? t.ink : t.ink3 }]}
      >
        {locating
          ? "Finding you…"
          : address
            ? address
            : value
              ? "Pin placed"
              : "Move the map so the pin sits on your place."}
      </Text>
      {locNote ? (
        <Text accessibilityLiveRegion="polite" style={[tType.bodyS, { color: t.ink2 }]}>
          {locNote}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One location fix, foreground permission only. A refusal is said plainly,
 * and the patient can still move the map by hand. Never logged.
 */
export async function findMe(): Promise<{ lat: number; lng: number } | { problem: string }> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted")
      return {
        problem:
          "Location is off for MedSync, so we can't find you. Move the map to your place instead.",
      };
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: fix.coords.latitude, lng: fix.coords.longitude };
  } catch {
    return { problem: "We couldn't find your location. Move the map to your place instead." };
  }
}

/** The phone's own geocoder (free, no web service). Null when it has no answer. */
export async function wordsFor(lat: number, lng: number): Promise<GeoWords | null> {
  try {
    const found = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return found[0] ? geoWords(found[0]) : null;
  } catch {
    return null;
  }
}
