import type { DoctorCard, DoctorPlace } from "@/data/doctors";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native";

import {
  Avatar,
  Button,
  Chip,
  ChipRow,
  Icon,
  Note,
  Press,
  SectionHead,
  TextLink,
} from "@/components/tide";
import { doctorFilters, loadDoctors, matchesFilter, useDoctors } from "@/data/doctors";
import { shortDayOf } from "@/features/visits/logic";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

/**
 * "See a doctor": the real clinicians at every hospital (contract in
 * `data/doctors.ts`), no hospital to choose first. Each card lists where the
 * doctor works, each hospital with its clinic, next open day and fee; tapping
 * one asks for a day there. "Come today" shows where their clinic at the
 * patient's own hospital takes walk-ins now. No count of people anywhere
 * (ADR 0084 §6), no rating, no placeholder doctor.
 */
export function Doctors() {
  const router = useRouter();
  const t = useTide();
  const { status, doctors } = useDoctors();
  const [filter, setFilter] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      void loadDoctors();
    }, []),
  );

  const filters = doctorFilters(doctors);
  const active = filter && filters.includes(filter) ? filter : null;
  const shown = doctors.filter((d) => matchesFilter(d, active));

  const body =
    status === "loading" ? (
      <ActivityIndicator color={t.ink} accessibilityLabel="Loading the doctors" />
    ) : status === "error" ? (
      <View style={{ gap: tSpace[2] }}>
        <Note tone="plain">{"Couldn't load the doctors. Check your connection."}</Note>
        <TextLink label="Try again" onPress={() => void loadDoctors()} />
      </View>
    ) : doctors.length === 0 ? (
      <Note tone="plain">No doctor takes bookings on MedSync yet.</Note>
    ) : (
      <>
        {filters.length > 0 ? (
          <ChipRow scroll>
            {filters.map((f) => (
              <Chip
                key={f}
                label={f}
                size="sm"
                selected={active === f}
                onPress={() => setFilter(active === f ? null : f)}
              />
            ))}
          </ChipRow>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -tSpace[5], flexGrow: 0 }}
          contentContainerStyle={{
            paddingHorizontal: tSpace[5],
            paddingBottom: tSpace[2],
            gap: tSpace[3],
          }}
        >
          {shown.map((d) => (
            <DoctorTile key={d.key} d={d} />
          ))}
        </ScrollView>
      </>
    );

  return (
    <View style={{ gap: tSpace[3] }}>
      <SectionHead title="See a doctor" action="See all" onAction={() => router.push("/book")} />
      {body}
    </View>
  );
}

/** How many hospitals a card lists before "and N more". */
const PLACES_SHOWN = 2;

function DoctorTile({ d }: { d: DoctorCard }) {
  const t = useTide();
  const router = useRouter();
  const ask = (p: DoctorPlace) =>
    router.push({
      pathname: "/book/day",
      params: { doctor: d.userId, department: p.departmentId, hospital: p.hospitalId },
    });
  const firstOpen = d.places.find((p) => p.nextDayKey !== null) ?? null;
  const walkIn = d.places.find((p) => p.walkInToday) ?? null;
  const shown = d.places.slice(0, PLACES_SHOWN);
  const more = d.places.length - shown.length;
  return (
    <View
      style={{
        width: 280,
        borderRadius: tRadius.cardLg,
        padding: tSpace[4],
        backgroundColor: t.surface,
        gap: tSpace[3],
        boxShadow: t.shadow.card,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2.5] }}>
        {d.photoUrl ? (
          <Image
            source={{ uri: d.photoUrl }}
            accessibilityIgnoresInvertColors
            style={{ width: 44, height: 44, borderRadius: 22 }}
          />
        ) : (
          <Avatar initials={d.initials} size={44} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[tType.label, { color: t.ink }]} numberOfLines={1}>
            {d.name}
          </Text>
          <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]} numberOfLines={1}>
            {d.role}
          </Text>
        </View>
      </View>

      <View style={{ gap: tSpace[1.5] }}>
        <Text style={[tType.overline, { color: t.ink3 }]}>
          {d.places.length === 1 ? "Works at" : `Works at ${d.places.length} hospitals`}
        </Text>
        {shown.map((p) => (
          <PlaceRow key={`${p.hospitalId}:${p.departmentId}`} place={p} onAsk={() => ask(p)} />
        ))}
        {more > 0 ? (
          <Text style={[tType.bodyS, { fontSize: 12, color: t.ink3 }]}>
            and {more} more {more === 1 ? "hospital" : "hospitals"}
          </Text>
        ) : null}
      </View>

      {walkIn ? (
        <Button
          size="md"
          label="Come today"
          accessibilityLabel={`Come today to ${walkIn.departmentName}, ${walkIn.hospitalName}`}
          onPress={() =>
            router.push({ pathname: "/book/today", params: { clinic: walkIn.departmentId } })
          }
        />
      ) : null}
      {firstOpen ? (
        <Button
          size="md"
          variant={walkIn ? "outline" : "primary"}
          label="Ask for a day"
          accessibilityLabel={`Ask ${d.name} for a day at ${firstOpen.hospitalName}`}
          onPress={() => ask(firstOpen)}
        />
      ) : (
        <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]}>
          No open day in the next two weeks
        </Text>
      )}
    </View>
  );
}

/** One hospital on a card: its name, the clinic, the next open day and the fee. Tap to ask there. */
function PlaceRow({ place, onAsk }: { place: DoctorPlace; onAsk: () => void }) {
  const t = useTide();
  const when = place.nextDayKey ? `Next ${shortDayOf(place.nextDayKey)}` : "No open day yet";
  return (
    <Press
      onPress={onAsk}
      disabled={!place.nextDayKey}
      accessibilityLabel={`${place.hospitalName}, ${place.departmentName}. ${when}. ${place.feeWords}.${
        place.nextDayKey ? " Ask for a day here." : ""
      }`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: tSpace[2.5],
        minHeight: 52,
        paddingVertical: tSpace[2],
        paddingHorizontal: tSpace[3],
        borderRadius: tRadius.md,
        backgroundColor: t.surface2,
      }}
    >
      <Icon name="building" size={18} color={t.area.visits} />
      <View style={{ flex: 1, gap: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1.5] }}>
          <Text style={[tType.labelS, { flexShrink: 1, color: t.ink }]} numberOfLines={1}>
            {place.hospitalName}
          </Text>
          {place.home ? <Text style={[tType.micro, { color: t.accentText }]}>Yours</Text> : null}
        </View>
        <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]} numberOfLines={1}>
          {place.departmentName} · {when} · {place.feeWords}
        </Text>
      </View>
      {place.nextDayKey ? <Icon name="forward" size={16} color={t.ink3} /> : null}
    </Press>
  );
}
