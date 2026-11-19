import type { DoctorCard } from "@/data/doctors";
import { useCallback } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Image, ScrollView, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { Icon, Press, SectionHead } from "@/components/tide";
import { availabilityWords, loadDoctors, useDoctors } from "@/data/doctors";
import { shortDayOf } from "@/features/visits/logic";
import { dateKey } from "@/lib/booking";
import { useNow } from "@/lib/use-now";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * "See a doctor" on Home: small portrait previews of the doctors with the soonest open day (the redesign the
 * owner approved on the design canvas, 18 Nov 2026, "portrait"). The real clinicians at every hospital
 * (contract in `data/doctors.ts`); no count of people anywhere (ADR 0084 §6), no rating, no placeholder
 * doctor. "See all" opens Book, where every doctor and clinic is.
 */
export function Doctors() {
  const router = useRouter();
  const now = useNow();
  const { status, doctors } = useDoctors();
  useFocusEffect(
    useCallback(() => {
      void loadDoctors();
    }, []),
  );

  const previews = doctorPreviews(doctors);
  const today = dateKey(now);

  if (status !== "ready" || previews.length === 0) {
    const line =
      status === "loading"
        ? "Loading the doctors"
        : status === "error"
          ? "Couldn't load the doctors. Check your connection."
          : doctors.length === 0
            ? "No doctor takes bookings on Tether yet."
            : "No open day in the next two weeks";
    return (
      <QuietRow
        line={line}
        onPress={status === "error" ? () => void loadDoctors() : () => router.push("/book")}
        hint={status === "error" ? "Try again" : "Opens Book"}
      />
    );
  }

  return (
    <View style={{ gap: tSpace[2] }}>
      <SectionHead title="See a doctor" action="See all" onAction={() => router.push("/book")} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -tSpace[5], flexGrow: 0 }}
        contentContainerStyle={{
          paddingHorizontal: tSpace[5],
          paddingTop: 2,
          paddingBottom: tSpace[3.5],
          gap: tSpace[2.5],
        }}
      >
        {previews.map((d) => (
          <DoctorPreview key={d.key} d={d} todayKey={today} />
        ))}
      </ScrollView>
    </View>
  );
}

/** How many doctors Home shows; the rest are in Book. */
export const PREVIEW_COUNT = 4;

/**
 * Home's previews: the doctors with an open day, soonest first, the patient's own hospital first on the same
 * day, then as the list came. A doctor with no open day in the horizon is left for Book.
 */
export function doctorPreviews(doctors: readonly DoctorCard[]): DoctorCard[] {
  return doctors
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.nextDayKey !== null)
    .sort(
      (a, b) =>
        (a.d.nextDayKey ?? "").localeCompare(b.d.nextDayKey ?? "") ||
        Number(atHome(b.d)) - Number(atHome(a.d)) ||
        a.i - b.i,
    )
    .slice(0, PREVIEW_COUNT)
    .map(({ d }) => d);
}

/** The place of the doctor's next open day, else their first place. */
const placeOf = (d: DoctorCard) =>
  d.places.find((p) => p.nextDayKey === d.nextDayKey) ?? d.places[0];
const atHome = (d: DoctorCard) => placeOf(d)?.home === true;

const CARD_W = 156;
const PHOTO_H = 118;

/**
 * One doctor: the photo (or a quiet silhouette) with the day in the fewest words on a chip ("Today", filled,
 * or "Thu 19 Nov"; the word says it, so colour is never alone), then the name, the role and where. Tapping
 * it asks that doctor for a day, where they are open first.
 */
function DoctorPreview({ d, todayKey }: { d: DoctorCard; todayKey: string }) {
  const t = useTide();
  const router = useRouter();
  const at = placeOf(d);
  const available = availabilityWords(d.nextDayKey, todayKey, shortDayOf);
  const where =
    d.places.length === 1 ? at.hospitalName : `${at.hospitalName} and ${d.places.length - 1} more`;
  const day = available.today ? "Today" : d.nextDayKey ? shortDayOf(d.nextDayKey) : "";

  return (
    <Press
      onPress={() =>
        router.push({
          pathname: "/book/day",
          params: { doctor: d.userId, department: at.departmentId, hospital: at.hospitalId },
        })
      }
      accessibilityLabel={`${d.name}, ${d.role}. ${where}. ${available.text}. Ask for a day.`}
      style={{
        width: CARD_W,
        borderRadius: tRadius.cardLg,
        overflow: "hidden",
        backgroundColor: t.surface,
        boxShadow: t.shadow.card,
      }}
    >
      {/* The photo clips its own top corners: an iOS image ignores the card's clip. */}
      <View
        style={{
          height: PHOTO_H,
          backgroundColor: t.surface3,
          borderTopLeftRadius: tRadius.cardLg,
          borderTopRightRadius: tRadius.cardLg,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        {d.photoUrl ? (
          <Image
            source={{ uri: d.photoUrl }}
            accessibilityIgnoresInvertColors
            resizeMode="cover"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              borderTopLeftRadius: tRadius.cardLg,
              borderTopRightRadius: tRadius.cardLg,
            }}
          />
        ) : (
          <Svg
            width={104}
            height={104}
            viewBox="0 0 24 24"
            style={{ marginBottom: -18, opacity: 0.4 }}
          >
            <Circle cx={12} cy={9} r={4.2} fill={t.ink3} />
            <Path d="M3.5 24c0-5 3.8-8.2 8.5-8.2s8.5 3.2 8.5 8.2z" fill={t.ink3} />
          </Svg>
        )}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: "absolute",
            left: tSpace[2.5],
            top: tSpace[2.5],
            minHeight: 26,
            paddingHorizontal: tSpace[2.5],
            borderRadius: tRadius.pill,
            justifyContent: "center",
            backgroundColor: available.today ? t.primary : t.surface,
          }}
        >
          <Text
            style={[
              tType.caption,
              { fontFamily: tFont.semibold, color: available.today ? t.onPrimary : t.ink },
            ]}
          >
            {day}
          </Text>
        </View>
      </View>
      <View
        style={{
          paddingTop: tSpace[3],
          paddingHorizontal: tSpace[3.5],
          paddingBottom: tSpace[3.5],
        }}
      >
        <Text style={[tType.label, { color: t.ink }]} numberOfLines={1}>
          {d.name}
        </Text>
        <Text style={[tType.caption, { color: t.ink2 }]} numberOfLines={1}>
          {d.role}
        </Text>
        <Text style={[tType.caption, { color: t.ink2 }]} numberOfLines={1}>
          {where}
        </Text>
      </View>
    </Press>
  );
}

/** While the doctors load, cannot be read, or none is open: one quiet row that still leads to Book. */
function QuietRow({ line, onPress, hint }: { line: string; onPress: () => void; hint: string }) {
  const t = useTide();
  return (
    <Press
      onPress={onPress}
      accessibilityLabel={`See a doctor. ${line}`}
      accessibilityHint={hint}
      style={{
        minHeight: 68,
        paddingVertical: tSpace[3],
        paddingHorizontal: tSpace[3.5],
        borderRadius: tRadius.cardLg,
        backgroundColor: t.surface,
        boxShadow: t.shadow.card,
        flexDirection: "row",
        alignItems: "center",
        gap: tSpace[3],
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: t.surface3,
        }}
      >
        <Icon name="user" size={20} color={t.ink2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[tType.label, { color: t.ink }]}>See a doctor</Text>
        <Text style={[tType.caption, { color: t.ink2 }]}>{line}</Text>
      </View>
      <Icon name="forward" size={20} color={t.ink3} />
    </Press>
  );
}
