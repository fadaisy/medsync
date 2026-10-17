import type { DoctorCard } from "@/data/doctors";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native";

import {
  Avatar,
  Button,
  Chip,
  ChipRow,
  Note,
  Pill,
  SectionHead,
  TextLink,
} from "@/components/tide";
import { doctorFilters, loadDoctors, matchesFilter, useDoctors } from "@/data/doctors";
import { shortDayOf } from "@/features/visits/logic";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

/**
 * "See a doctor": the real clinicians at the patient's hospital (contract in
 * `data/doctors.ts`), each with their next open day, their fee or "No fee",
 * "Ask for a day", and "Come today" when their clinic takes walk-ins now.
 * No count of people anywhere (ADR 0084 §6), no rating, no placeholder doctor.
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
    ) : status === "no-hospital" ? (
      <View style={{ gap: tSpace[2] }}>
        <Note tone="plain">Choose your hospital to see its doctors and open days.</Note>
        <Button
          size="md"
          variant="outline"
          label="Choose my hospital"
          onPress={() => router.push("/book")}
        />
      </View>
    ) : status === "error" ? (
      <View style={{ gap: tSpace[2] }}>
        <Note tone="plain">{"Couldn't load the doctors. Check your connection."}</Note>
        <TextLink label="Try again" onPress={() => void loadDoctors()} />
      </View>
    ) : doctors.length === 0 ? (
      <Note tone="plain">No doctor at your hospital takes bookings on MedSync yet.</Note>
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

function DoctorTile({ d }: { d: DoctorCard }) {
  const t = useTide();
  const router = useRouter();
  return (
    <View
      style={{
        width: 252,
        borderRadius: tRadius.cardLg,
        padding: tSpace[4],
        backgroundColor: t.surface,
        gap: tSpace[2.5],
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
            {d.role} · {d.place}
          </Text>
        </View>
      </View>
      <Text style={[tType.labelS, { fontSize: 13, color: t.ink2 }]} numberOfLines={2}>
        {d.feeWords}
      </Text>
      <View style={{ gap: 2 }}>
        {d.walkInToday ? (
          <Pill label="Takes walk-ins today" bg={t.accentTint} fg={t.accentText} />
        ) : null}
        <Text style={[tType.bodyS, { fontSize: 12, color: t.ink2 }]}>
          {d.nextDayKey
            ? `Next open day: ${shortDayOf(d.nextDayKey)}`
            : "No open day in the next two weeks"}
        </Text>
      </View>
      {d.walkInToday ? (
        <Button
          size="md"
          label="Come today"
          accessibilityLabel={`Come today to ${d.place}`}
          onPress={() =>
            router.push({ pathname: "/book/today", params: { clinic: d.departmentId } })
          }
        />
      ) : null}
      {d.nextDayKey ? (
        <Button
          size="md"
          variant="outline"
          label="Ask for a day"
          accessibilityLabel={`Ask ${d.name} for a day`}
          onPress={() =>
            router.push({
              pathname: "/book/day",
              params: { doctor: d.userId, department: d.departmentId },
            })
          }
        />
      ) : null}
    </View>
  );
}
