/**
 * `/dev/v2`: the patient app v2 phone kit on sample data (Step 3b), for light and dark screenshots. Development
 * builds only (the root layout guards it). Names are the prompt's invented ones; no patient data.
 * `?scheme=dark` opens it dark for the screenshot harness.
 */
import type { PlanPoint } from "@/components/tide/v2";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { heroFor } from "@patient-core/today-hero";
import { stageOf } from "@patient-core/visit-stages";

import { Screen, SectionHead } from "@/components/tide";
import {
  CalledBanner,
  DayBar,
  DoseRow,
  MembershipCard,
  PayChoice,
  PromptStatus,
  ReadingSnippet,
  Receipt,
  RefundTracker,
  StageList,
  TicketV2,
  TierCard,
} from "@/components/tide/v2";
import { HeroCard } from "@/components/tide/v2-hero";
import { useTheme, useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

const DAYS = ["7 Nov", "8 Nov", "9 Nov", "10 Nov", "11 Nov", "12 Nov", "13 Nov", "14 Nov", "15 Nov", "16 Nov"];
const SUGAR = [8.4, 7.9, null, 7.6, 6.8, 7.4, null, 6.9, 7.2, 7.8];

function SampleQr() {
  const t = useTide();
  return (
    <Svg viewBox="0 0 7 7" width={88} height={88} accessibilityLabel="Sample code, not a real token">
      {Array.from({ length: 49 }, (_, i) =>
        (i * 7 + ((i * i) % 5)) % 3 === 0 ? <Rect key={i} x={i % 7} y={Math.floor(i / 7)} width={1} height={1} fill={t.ink} /> : null,
      )}
    </Svg>
  );
}

export default function DevV2() {
  const { scheme } = useLocalSearchParams<{ scheme?: string }>();
  const { setPreference } = useTheme();
  useEffect(() => {
    if (scheme === "dark" || scheme === "light") setPreference(scheme);
  }, [scheme, setPreference]);
  const t = useTide();
  const [choice, setChoice] = useState<"momo" | "hospital">("momo");
  const [points, setPoints] = useState<PlanPoint[]>([
    { key: "s1", label: "Sugar before breakfast", at: "07:00", done: true, kind: "check" },
    { key: "m1", label: "Metformin", at: "07:30", done: true, kind: "dose" },
    { key: "w1", label: "Walk", at: "17:00", done: false, kind: "walk" },
    { key: "m2", label: "Amlodipine", at: "20:00", done: false, kind: "dose" },
  ]);
  const toggle = (k: string) => setPoints((ps) => ps.map((p) => (p.key === k ? { ...p, done: !p.done } : p)));
  return (
    <Screen title="Patient app v2 kit" subtitle="Every state, on sample data.">
      <View style={{ gap: 28 }}>
        <View style={{ gap: tSpace[3] }}>
          <SectionHead title="Ticket" />
          <TicketV2
            hospitalName="Kampala General Hospital"
            hospitalInitials="KG"
            day="16"
            dayLine="Monday · November"
            window="08:00 to 10:00"
            doctorTime={false}
            clinic="General OPD"
            room="4"
            patient="Esther N."
            block="B"
            pay={{ kind: "paid", amountUgx: 30000, method: "mtn", receiptNumber: 421 }}
            code="K7M 42Q"
          />
        </View>
        <View style={{ gap: tSpace[3] }}>
          <SectionHead title="Where you are" />
          <StageList view={stageOf("arrived", "line")} times={["Fri 13", "08:36", "08:52", null, null]} />
          <CalledBanner room="4" code="K7M 42Q" onOnMyWay={() => undefined} />
        </View>
        <View style={{ gap: tSpace[3] }}>
          <SectionHead title="Pay when booking" />
          <PayChoice value={choice} onChange={setChoice} network="mtn" maskedNumber="07•• ••• 123" onChangeNumber={() => undefined} />
          <PromptStatus view="approve_on_phone" />
          <PromptStatus view="nothing_taken" />
          <Receipt
            r={{
              number: 421,
              hospital: "Kampala General Hospital",
              issuedAt: "Mon 16 Nov · 08:31",
              items: [{ label: "Medical officer", amountUgx: 30000 }],
              totalUgx: 30000,
              method: "mtn",
              reference: "sbx_7f2c",
              payer: "Esther N.",
              patient: "Sarah N.",
            }}
          />
          <RefundTracker status="approved" network="mtn" />
        </View>
        <View style={{ gap: tSpace[3] }}>
          <SectionHead title="Today" />
          <HeroCard hero={heroFor({ danger: null, teamAsks: null, dueNow: { kind: "dose", key: "m", label: "Metformin", dueAt: "08:00" }, visitToday: null, nextItem: null, nothingUntil: null })} onAction={() => undefined} />
          <DayBar points={points} now="13:05" />
          {points.map((p) => (
            <DoseRow key={p.key} point={p} onToggle={() => toggle(p.key)} />
          ))}
          <ReadingSnippet metric="sugar" ctx="fasting" unit="mmol/L" weekAgo={8.4} days={DAYS.map((date, i) => ({ date, value: SUGAR[i]! }))} onLog={() => undefined} />
        </View>
        <View style={{ gap: tSpace[3] }}>
          <SectionHead title="Membership" />
          <MembershipCard
            tier="plus_care"
            name="Joseph Ssemakula"
            memberNo="TTH 0042 2290"
            id={{ emergencyContact: "Aisha S. · 07•• ••• 552", bloodGroup: "A+", allergies: [], conditions: ["Diabetes", "Hypertension"], hospitalLine: "0414 000 000 (sample)", qr: <SampleQr /> }}
          />
          <TierCard tier="family_care" monthlyUgx={13000} yearlyUgx={130000} features={["Everything in Plus Family", "Everything in Plus Care"]} current={false} onChoose={() => undefined} />
          <Text style={[tType.caption, { color: t.ink3 }]}>Sample data only.</Text>
        </View>
      </View>
    </Screen>
  );
}
