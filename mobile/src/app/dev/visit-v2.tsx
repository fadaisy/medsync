/**
 * `/dev/visit-v2?screen=home|visits|day&scheme=light|dark`: patient app v2 Visit mode on the phone (Step 4) on
 * fixtures, for screenshots. Development builds only. Invented names (prompt Appendix A); no patient data.
 */
import type { VisitQuestion } from "@/data/visit-v2";
import type { AppointmentRow } from "@/lib/booking";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { stageOf } from "@patient-core/visit-stages";

import { Screen } from "@/components/tide";
import { PayChoice, PromptStatus } from "@/components/tide/v2";
import { ticketFor } from "@/data/visit-v2";
import { HomeVisitCardV2 } from "@/features/v2/routes";
import { VisitDay } from "@/features/v2/visit-day";
import { VisitsList } from "@/features/v2/visits-list";
import { useTheme } from "@/theme/theme";

const ESTHER = {
  id: "fx-1",
  startsAtIso: "2026-11-16T05:00:00.000Z",
  endsAtIso: "2026-11-16T07:00:00.000Z",
  status: "arrived",
  departmentName: "General OPD",
  hospitalName: "Kampala General Hospital",
  bookingCode: "K7M42Q",
  sessionId: "s1",
  arrivalWindowStartIso: "2026-11-16T05:00:00.000Z",
  arrivalWindowEndIso: "2026-11-16T07:00:00.000Z",
  forMember: null,
  quotedFeeUgx: 30000,
} as unknown as AppointmentRow;
const PAID = {
  appointmentId: "fx-1",
  billId: "b",
  status: "paid" as const,
  totalUgx: 30000,
  paidUgx: 30000,
  refundedUgx: 0,
  method: "mtn" as const,
  receiptNumber: 421,
  paidChannel: "app" as const,
};

export default function DevVisitV2() {
  const { screen = "day", scheme } = useLocalSearchParams<{ screen?: string; scheme?: string }>();
  const { setPreference } = useTheme();
  useEffect(() => {
    if (scheme === "dark" || scheme === "light") setPreference(scheme);
  }, [scheme, setPreference]);
  const [questions, setQuestions] = useState<VisitQuestion[]>([
    { id: "q1", body: "Is my blood pressure medicine still right for me?", suggested: false, asked: true },
    { id: "q2", body: "When should I come back?", suggested: true, asked: false },
  ]);
  const [pay, setPay] = useState<"momo" | "hospital">("momo");

  if (screen === "home")
    return (
      <Screen title="Good morning, Esther" subtitle="Monday 16 November">
        <HomeVisitCardV2 visit={ESTHER} pay={PAID} me="Esther N." />
      </Screen>
    );
  if (screen === "visits")
    return (
      <Screen title="Visits">
        <VisitsList
          offers={[{ id: "o1", title: "Eye Clinic moved", line: "The clinic cancelled Thu 19 Nov. Next open day: Tue 24 Nov." }]}
          upcoming={[
            { id: "u1", day: "16", dayLabel: "MON", clinic: "General OPD", who: "You", window: "08:00 to 10:00", code: "K7M 42Q", chip: "paid_app" },
            { id: "u2", day: "18", dayLabel: "WED", clinic: "Dental Clinic", who: "Moses", window: "10:40", code: "P3D 81X", chip: "at_hospital" },
            { id: "u3", day: "20", dayLabel: "FRI", clinic: "Medical Clinic", who: "Sarah", window: "08:00 to 12:00", code: "R2T 55M", chip: "paid_counter" },
          ]}
          past={[{ id: "p1", day: "2", dayLabel: "MON", clinic: "General OPD", who: "You", window: "09:20", code: "H8K 13B", chip: "none" }]}
          onOpen={() => undefined}
          onOffer={() => undefined}
        />
      </Screen>
    );
  if (screen === "pay")
    return (
      <Screen title="Ask for a day">
        <PayChoice value={pay} onChange={setPay} network="mtn" maskedNumber="07•• ••• 123" onChangeNumber={() => undefined} />
        <PromptStatus view="approve_on_phone" />
      </Screen>
    );
  return (
    <Screen title="Your visit">
      <VisitDay
        ticket={ticketFor(ESTHER, PAID, "Esther N.")}
        stage={stageOf("arrived", "line")}
        stageTimes={["Fri 13", "08:36", "08:52", null, null]}
        calledRoom={null}
        questions={questions}
        nurseNote="Headaches in the morning for two weeks."
        onAddQuestion={(text, suggested) =>
          setQuestions((q) => [...q, { id: `q${q.length + 1}`, body: text, suggested, asked: false }])
        }
        onMarkQuestion={(id, change) =>
          setQuestions((q) =>
            change === "remove" ? q.filter((x) => x.id !== id) : q.map((x) => (x.id === id ? { ...x, asked: change === "asked" } : x)),
          )
        }
        onAction={() => undefined}
        onEditNote={() => undefined}
      />
    </Screen>
  );
}
