import type { ClinicianOption } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * The top of the provider screen — the reference design's photo card, name
 * and credential lines, action row and three-column stats strip, in this
 * app's palette. The web's `app/patient/clinician/[id]` draws the same
 * components in the same order; the two are kept in step by name.
 *
 * Every number on the strip is one the tables hold (ADR 0085 §2): patients
 * seen and reviews are counted server-side by `pt-bookable-clinicians`, and
 * "With us" is the affiliation's own start. The reference's "8 Years
 * Experience" is not reproduced — nothing records a career — and a count of
 * zero reads "—", never a flattering 0.
 *
 * The action row keeps only affordances that do something. Video is real when
 * the clinician allows a virtual visit; a phone or chat circle with no
 * transport behind it would be a fake affordance, so those render as
 * unavailable with the reason in their label.
 */
export function ProviderHero({
  doctor,
  hospitalName,
  allowVirtual,
  seenBefore,
  onBack,
}: {
  doctor: ClinicianOption;
  hospitalName: string;
  allowVirtual: boolean;
  /** PRD §2.7 continuity — takes the reference's "save" position. */
  seenBefore: boolean;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const initials = initialsOf(doctor.fullName);

  return (
    <View style={styles.stack}>
      {/* ── The photo card ────────────────────────────────────── */}
      <View style={styles.card}>
        {doctor.photoUrl ? (
          <Image
            source={{ uri: doctor.photoUrl }}
            style={styles.photo}
            contentFit="cover"
            transition={150}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : (
          <View style={[styles.photo, styles.monogram]}>
            {initials ? (
              <Text style={styles.initials}>{initials}</Text>
            ) : (
              <Avatar name={doctor.fullName} size={72} />
            )}
          </View>
        )}

        <View style={styles.backSlot}>
          <IconButton icon="chevron-back" label="Back" onPress={onBack} tone="card" />
        </View>

        {seenBefore ? (
          <View style={[styles.badge, styles.badgeTopRight]}>
            <Text style={styles.badgeText}>Seen you before</Text>
          </View>
        ) : null}

        {doctor.rating ? (
          <View style={[styles.badge, styles.badgeBottomLeft]}>
            <Ionicons name="star" size={13} color={colors.primary} />
            <Text style={styles.badgeText}>{doctor.rating.average.toFixed(1)}</Text>
          </View>
        ) : null}
      </View>

      {/* ── Name and credentials ──────────────────────────────── */}
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.name}>
          {doctor.fullName}
        </Text>
        <Text style={styles.credential}>
          {[doctor.cadre, doctor.specialty ?? doctor.departmentName].filter(Boolean).join(" · ")}
        </Text>
        <Text style={styles.meta}>
          {doctor.departmentName} · {hospitalName}
        </Text>
      </View>

      {/* ── Action row ────────────────────────────────────────── */}
      <View style={styles.actions}>
        <View style={styles.detailsPill}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <Text style={styles.detailsText}>Details</Text>
        </View>
        <View style={styles.circles}>
          <ActionCircle
            icon="videocam-outline"
            label={
              allowVirtual
                ? "This clinician offers video visits"
                : "This clinician sees patients in person only"
            }
            available={allowVirtual}
          />
          <ActionCircle
            icon="call-outline"
            label="Calling a clinician is not available in MedSync"
            available={false}
          />
          <ActionCircle
            icon="chatbubble-ellipses-outline"
            label="Messaging a clinician is not available in MedSync"
            available={false}
          />
        </View>
      </View>

      {/* ── Stats strip ───────────────────────────────────────── */}
      <View style={styles.strip} accessibilityRole="summary">
        <Stat icon="time-outline" value={yearsWithUs(doctor.withUsSinceIso)} label="With us" />
        <Stat
          icon="people-outline"
          value={doctor.patientsSeen > 0 ? compact(doctor.patientsSeen) : "—"}
          label="Patients"
        />
        <Stat
          icon="star-outline"
          value={doctor.rating ? compact(doctor.rating.count) : "—"}
          label="Reviews"
        />
      </View>
    </View>
  );
}

function ActionCircle({
  icon,
  label,
  available,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  available: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.circle, !available && styles.circleOff]}
    >
      <Ionicons name={icon} size={18} color={available ? colors.primary : colors.mutedForeground} />
    </View>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View
      accessible
      style={styles.stat}
      accessibilityLabel={`${label}: ${value === "—" ? "none yet" : value}`}
    >
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** "3 yrs" / "New" — time on MedSync at this hospital, which is all we know. */
function yearsWithUs(iso: string | null): string {
  if (!iso) return "—";
  const years = Math.floor((Date.now() - new Date(iso).getTime()) / (365.25 * 86_400_000));
  return years < 1 ? "New" : `${years} yr${years === 1 ? "" : "s"}`;
}

/** 3500 → "3.5k". Never a "+": the count is exact, so it is shown exactly. */
function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
}

function initialsOf(name: string): string | null {
  if (name === "Your clinician") return null;
  const letters = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter((c): c is string => !!c && /\p{L}/u.test(c))
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return letters || null;
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    stack: { gap: space[4] },

    // The photo card: the brand's lightest tint as a flat ground — the
    // reference's gradient is a decorative ground, which DESIGN forbids.
    card: {
      position: "relative",
      borderRadius: radius["2xl"],
      overflow: "hidden",
      backgroundColor: c.accent,
    },
    photo: { width: "100%", aspectRatio: 4 / 5, backgroundColor: c.accent },
    monogram: { alignItems: "center", justifyContent: "center" },
    initials: { fontFamily: font.mono, fontSize: 56, color: c.accentForeground },
    backSlot: { position: "absolute", top: space[4], left: space[4] },
    badge: {
      position: "absolute",
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      borderRadius: radius.full,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    badgeTopRight: { top: space[4], right: space[4] },
    badgeBottomLeft: { bottom: space[4], left: space[4] },
    badgeText: { fontFamily: font.bodyMedium, fontSize: 13.5, color: c.foreground },

    head: { gap: 2 },
    name: {
      fontFamily: font.display,
      fontSize: 28,
      lineHeight: 34,
      letterSpacing: -0.4,
      color: c.foreground,
    },
    credential: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: c.mutedForeground },
    meta: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },

    actions: { flexDirection: "row", alignItems: "center", gap: space[2] },
    detailsPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 44,
      paddingHorizontal: space[4],
      borderRadius: radius.full,
      backgroundColor: c.accent,
    },
    detailsText: { fontFamily: font.bodyMedium, fontSize: 14.5, color: c.accentForeground },
    circles: { flexDirection: "row", gap: space[2] },
    circle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    circleOff: { backgroundColor: c.muted, borderColor: c.muted },

    strip: {
      flexDirection: "row",
      padding: space[4],
      borderRadius: radius["2xl"],
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    stat: { flex: 1, alignItems: "center", gap: 2 },
    statValue: { fontFamily: font.mono, fontSize: 16, lineHeight: 22, color: c.foreground },
    statLabel: { fontFamily: font.body, fontSize: 12.5, color: c.mutedForeground },
  });
