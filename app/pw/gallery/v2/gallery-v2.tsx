"use client";

import type { PlanPoint } from "@/components/tide/v2-care";
import { useState } from "react";
import { heroFor } from "@patient-core/today-hero";
import { stageOf } from "@patient-core/visit-stages";

import { SectionHead } from "@/components/tide/kit";
import { DayTimeline, HeroCard } from "@/components/tide/v2-care";
import { MembershipCard, TierCard } from "@/components/tide/v2-membership";
import { PayChoice, PromptStatus, Receipt, RefundTracker } from "@/components/tide/v2-pay";
import { ReadingCard } from "@/components/tide/v2-reading-card";
import { CalledBanner, StageList, StageStrip } from "@/components/tide/v2-stages";
import { TicketV2 } from "@/components/tide/v2-ticket";

const DAYS = [
  "7 Nov",
  "8 Nov",
  "9 Nov",
  "10 Nov",
  "11 Nov",
  "12 Nov",
  "13 Nov",
  "14 Nov",
  "15 Nov",
  "16 Nov",
];
const SUGAR = [8.4, 7.9, null, 7.6, 6.8, 7.4, null, 6.9, 7.2, 7.8];
const BP = [
  [148, 94],
  [146, 92],
  [142, 90],
  null,
  [139, 88],
  [144, 91],
  [136, 86],
  null,
  [138, 87],
  [134, 84],
] as const;
const WEIGHT = [82.4, null, 82.1, 82, null, 81.8, 81.9, null, 81.6, 81.6];

function SampleQr() {
  const cells = Array.from({ length: 49 }, (_, i) => (i * 7 + ((i * i) % 5)) % 3 === 0);
  return (
    <svg
      viewBox="0 0 7 7"
      className="size-24"
      role="img"
      aria-label="Sample code, not a real token"
    >
      {cells.map((on, i) =>
        on ? (
          <rect
            key={i}
            x={i % 7}
            y={Math.floor(i / 7)}
            width={1}
            height={1}
            className="fill-pw-ink"
          />
        ) : null,
      )}
    </svg>
  );
}

export function GalleryV2() {
  const [choice, setChoice] = useState<"momo" | "hospital">("momo");
  const [points, setPoints] = useState<PlanPoint[]>([
    { key: "m1", label: "Metformin", at: "07:30", done: true, kind: "dose" },
    { key: "s1", label: "Sugar before breakfast", at: "07:00", done: true, kind: "check" },
    { key: "w1", label: "Walk", at: "17:00", done: false, kind: "walk" },
    { key: "m2", label: "Amlodipine", at: "20:00", done: false, kind: "dose" },
    { key: "s2", label: "Sugar before supper", at: "18:30", done: false, kind: "check" },
  ]);
  const toggle = (k: string) =>
    setPoints((ps) => ps.map((p) => (p.key === k ? { ...p, done: !p.done } : p)));

  return (
    <div className="flex flex-col gap-8 pb-16">
      <section className="flex flex-col gap-3">
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
        <TicketV2
          hospitalName="Kampala General Hospital"
          hospitalInitials="KG"
          day="24"
          dayLine="Tuesday · November"
          window="10:40"
          doctorTime
          clinic="Eye Clinic"
          room={null}
          patient="Moses N."
          block={null}
          pay={{ kind: "to_pay", amountUgx: 30000 }}
          code="P3D 81X"
          onPayNow={() => undefined}
        />
      </section>

      <section className="grid gap-4 min-[761px]:grid-cols-2">
        <div className="flex flex-col gap-3">
          <SectionHead title="Where you are" />
          <StageStrip view={stageOf("arrived", "line")} />
          <StageList
            view={stageOf("arrived", "line")}
            times={["Fri 13", "08:36", "08:52", null, null]}
          />
        </div>
        <div className="flex flex-col gap-3">
          <SectionHead title="Called" />
          <CalledBanner room="4" code="K7M 42Q" onOnMyWay={() => undefined} />
        </div>
      </section>

      <section className="grid gap-4 min-[761px]:grid-cols-2">
        <div className="flex flex-col gap-3">
          <SectionHead title="Pay when booking" />
          <PayChoice
            value={choice}
            onChange={setChoice}
            network="mtn"
            maskedNumber="07•• ••• 123"
            onChangeNumber={() => undefined}
          />
          <PromptStatus view="approve_on_phone" />
          <PromptStatus view="paid" />
          <PromptStatus view="nothing_taken" />
        </div>
        <div className="flex flex-col gap-3">
          <SectionHead title="Receipt and refund" />
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
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHead title="Today hero" />
        <div className="grid gap-3 min-[761px]:grid-cols-3">
          <HeroCard
            hero={heroFor({
              danger: { kind: "low_sugar", at: "Low sugar at 07:20" },
              teamAsks: null,
              dueNow: null,
              visitToday: null,
              nextItem: null,
              nothingUntil: null,
            })}
            onAction={() => undefined}
          />
          <HeroCard
            hero={heroFor({
              danger: null,
              teamAsks: null,
              dueNow: { kind: "dose", key: "m", label: "Metformin", dueAt: "08:00" },
              visitToday: null,
              nextItem: null,
              nothingUntil: null,
            })}
            onAction={() => undefined}
          />
          <HeroCard
            hero={heroFor({
              danger: null,
              teamAsks: null,
              dueNow: null,
              visitToday: null,
              nextItem: null,
              nothingUntil: "Tomorrow 07:00",
            })}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHead title="Readings" />
        <div className="grid gap-3 min-[1100px]:grid-cols-3">
          <ReadingCard
            metric="sugar"
            ctx="fasting"
            unit="mmol/L"
            weekAgo={8.4}
            days={DAYS.map((date, i) => ({ date, value: SUGAR[i]! }))}
            onLog={() => undefined}
            detailsHref="#"
          />
          <ReadingCard
            metric="bp"
            ctx="random"
            unit="mmHg"
            weekAgo={148}
            days={DAYS.map((date, i) => ({
              date,
              value: BP[i]?.[0] ?? null,
              bottom: BP[i]?.[1] ?? null,
            }))}
            onLog={() => undefined}
            detailsHref="#"
          />
          <ReadingCard
            metric="weight"
            ctx="random"
            unit="kg"
            weekAgo={82.4}
            weightNextStep={80}
            days={DAYS.map((date, i) => ({ date, value: WEIGHT[i]! }))}
            onLog={() => undefined}
            detailsHref="#"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHead title="The plan as a day" />
        <DayTimeline points={points} now="13:05" onToggle={toggle} />
      </section>

      <section className="grid gap-4 min-[761px]:grid-cols-2">
        <div className="flex flex-col gap-3">
          <SectionHead title="Membership card" />
          <MembershipCard
            tier="plus_family"
            name="Esther Namubiru"
            memberNo="TTH 0042 1187"
            id={{
              emergencyContact: "Moses N. · 07•• ••• 552",
              bloodGroup: "O+",
              allergies: ["Penicillin"],
              conditions: [],
              hospitalLine: "0414 000 000 (sample)",
              qr: <SampleQr />,
            }}
          />
        </div>
        <div className="grid gap-3 min-[1100px]:grid-cols-2">
          <TierCard
            tier="plus_family"
            monthlyUgx={5000}
            yearlyUgx={50000}
            features={["Household calendar", "Pay for household members", "A helper in the loop"]}
            current
            onChoose={() => undefined}
          />
          <TierCard
            tier="plus_care"
            monthlyUgx={10000}
            yearlyUgx={100000}
            features={[
              "Texts as well as app alerts",
              "A family helper on readings",
              "Refills packed",
              "A 12-month report",
            ]}
            current={false}
            onChoose={() => undefined}
          />
        </div>
      </section>
    </div>
  );
}
