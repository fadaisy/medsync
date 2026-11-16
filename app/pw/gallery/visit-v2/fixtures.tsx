"use client";

import type { WebQuestion } from "@/components/tide/v2-visit-web";
import type { DayOption } from "@patient-core/book-days";
import { useState } from "react";
import { ticketView } from "@patient-core/ticket-view";
import { stageOf } from "@patient-core/visit-stages";

import { BookOnePage } from "@/components/tide/v2-book-web";
import { VisitDayWeb, VisitsWeb } from "@/components/tide/v2-visit-web";

const session = (
  id: string,
  clinicName: string,
  placesLeft: number,
  fee: number,
  doors: string | null = "08:00",
) => ({
  id,
  part: "Morning" as const,
  doors,
  placesLeft,
  clinicianName: "Medical officer",
  clinicName,
  room: "4",
  fee,
  feeLabel: null,
});
const DAYS: DayOption[] = [
  {
    key: "2026-11-17",
    sessions: [session("s1", "General OPD", 12, 30000), session("s2", "Eye Clinic", 0, 30000)],
  },
  { key: "2026-11-18", sessions: [session("s3", "General OPD", 4, 30000)] },
  {
    key: "2026-11-19",
    sessions: [session("s4", "General OPD", 0, 30000), session("s5", "Eye Clinic", 6, 30000)],
  },
  {
    key: "2026-11-20",
    sessions: [
      session("s6", "General OPD", 9, 30000),
      session("s7", "Dental Clinic", 3, 20000, "10:40"),
    ],
  },
  { key: "2026-11-23", sessions: [session("s8", "General OPD", 15, 30000)] },
];

const ESTHER = {
  startsAtIso: "2026-11-16T05:00:00.000Z",
  sessionId: "s1",
  arrivalWindowStartIso: "2026-11-16T05:00:00.000Z",
  arrivalWindowEndIso: "2026-11-16T07:00:00.000Z",
  departmentName: "General OPD",
  hospitalName: "Kampala General Hospital",
  bookingCode: "K7M42Q",
  forMember: null,
  quotedFeeUgx: 30000,
};
const PAID = {
  appointmentId: "fx",
  billId: "b",
  status: "paid" as const,
  totalUgx: 30000,
  paidUgx: 30000,
  refundedUgx: 0,
  method: "mtn" as const,
  receiptNumber: 421,
  paidChannel: "app" as const,
};
const later = () => new Promise((r) => setTimeout(r, 300));

export function VisitV2Fixtures({ screen }: { screen: string }) {
  const [questions, setQuestions] = useState<WebQuestion[]>([
    {
      id: "q1",
      body: "Is my blood pressure medicine still right for me?",
      suggested: false,
      asked: true,
    },
    { id: "q2", body: "When should I come back?", suggested: true, asked: false },
  ]);
  if (screen === "book")
    return (
      <BookOnePage
        hospitalName="Kampala General Hospital"
        emergencyLine="Emergency? Go to the emergency entrance now, or press Help."
        who={[
          { id: null, label: "Esther Namubiru" },
          { id: "00000000-0000-4000-8000-000000000002", label: "Moses (brother)" },
        ]}
        reasons={[{ code: "follow_up", label: "A follow-up visit" }]}
        days={DAYS}
        savedMsisdn="+256772123456"
        submit={async () => {
          await later();
          return { ok: true, appointmentId: "fx-new", code: "R2T55M" };
        }}
        pay={async () => {
          await later();
          return { ok: true, view: "paid" };
        }}
        visitsHref="/pw/gallery/visit-v2?screen=visits"
      />
    );
  if (screen === "visits")
    return (
      <VisitsWeb
        month="2026-11"
        offers={[
          {
            id: "o1",
            title: "Eye Clinic moved",
            line: "The clinic cancelled Thu 19 Nov. Next open day: Tue 24 Nov.",
          },
        ]}
        upcoming={[
          {
            id: "u1",
            href: "#",
            dateIso: "2026-11-16T08:00:00Z",
            day: "16",
            dayLabel: "MON",
            clinic: "General OPD",
            who: "You",
            window: "08:00 to 10:00",
            code: "K7M 42Q",
            chip: "paid_app",
          },
          {
            id: "u2",
            href: "#",
            dateIso: "2026-11-18T10:40:00Z",
            day: "18",
            dayLabel: "WED",
            clinic: "Dental Clinic",
            who: "Moses",
            window: "10:40",
            code: "P3D 81X",
            chip: "at_hospital",
          },
          {
            id: "u3",
            href: "#",
            dateIso: "2026-11-20T08:00:00Z",
            day: "20",
            dayLabel: "FRI",
            clinic: "Medical Clinic",
            who: "Sarah",
            window: "08:00 to 12:00",
            code: "R2T 55M",
            chip: "paid_counter",
          },
        ]}
        past={[
          {
            id: "p1",
            href: "#",
            dateIso: "2026-11-02T09:20:00Z",
            day: "2",
            dayLabel: "MON",
            clinic: "General OPD",
            who: "You",
            window: "09:20",
            code: "H8K 13B",
            chip: "none",
          },
        ]}
        onOffer={() => undefined}
      />
    );
  return (
    <VisitDayWeb
      ticket={ticketView(ESTHER, PAID, "Esther N.")}
      stage={stageOf("arrived", "line")}
      stageTimes={["Fri 13", "08:36", "08:52", null, null]}
      questions={questions}
      nurseNote="Headaches in the morning for two weeks."
      directionsHref="https://www.google.com/maps/dir/?api=1&destination=0.3%2C32.5"
      smsText="Tether: your code is K7M 42Q. Show it at the desk."
      addQuestion={async (body, suggested) => {
        setQuestions((q) => [...q, { id: `q${q.length + 1}`, body, suggested, asked: false }]);
      }}
      markQuestion={async (id, change) => {
        setQuestions((q) =>
          change === "remove"
            ? q.filter((x) => x.id !== id)
            : q.map((x) => (x.id === id ? { ...x, asked: change === "asked" } : x)),
        );
      }}
    />
  );
}
