"use client";

import { useState } from "react";
import {
  CalendarClockIcon,
  FileTextIcon,
  FlaskConicalIcon,
  HeartPulseIcon,
  PillIcon,
  UserIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * §09 — [02] Adaptive model — "The closed-loop record".
 *
 * Attio's "Universal Context" tabs analogue. Four IM sub-specialties
 * (the Phase 0 seed list) each show the same six clinical object cards
 * with attributes shifted per specialty — proving the record adapts
 * without being rebuilt per ward.
 *
 * Reduced-motion behaviour: tab swap is React state-driven so the change
 * is instant; the cross-fade is only an opacity transition we add on top.
 * `motion-reduce:transition-none` strips the fade for reduced-motion users.
 */

type SpecialtyKey = "diabetology" | "cardiology" | "nephrology" | "pulmonology";

interface CardField {
  label: string;
  value: string;
  flag?: "ok" | "high" | "low";
}

interface SpecialtyCardSet {
  patient: { name: string; age: number; sex: "F" | "M"; tags: string[]; moreAttributes: number };
  vital: {
    label: string;
    value: string;
    trend: "up" | "down" | "flat";
    time: string;
    moreAttributes: number;
  };
  medication: { name: string; dose: string; freq: string; route: string; moreAttributes: number };
  note: { author: string; ts: string; body: string; moreAttributes: number };
  lab: { name: string; value: string; flag: "ok" | "high" | "low"; moreAttributes: number };
  appointment: { kind: string; when: string; with: string; moreAttributes: number };
  signature: CardField[];
}

const SPECIALTIES: Record<
  SpecialtyKey,
  { label: string; subtitle: string; data: SpecialtyCardSet }
> = {
  diabetology: {
    label: "Diabetology",
    subtitle: "Glycaemic control · home-monitored",
    data: {
      patient: {
        name: "Amina N.",
        age: 47,
        sex: "F",
        tags: ["T2DM · 9y", "HTN", "Microalbuminuria"],
        moreAttributes: 12,
      },
      vital: {
        label: "Capillary glucose",
        value: "14.2 mmol/L",
        trend: "up",
        time: "3 min ago",
        moreAttributes: 5,
      },
      medication: {
        name: "Insulin Actrapid",
        dose: "Sliding scale",
        freq: "Pre-meal",
        route: "SC",
        moreAttributes: 6,
      },
      note: {
        author: "Dr. Usama Fadhul · Diabetology",
        ts: "07:42",
        body: "Glycaemic excursion overnight. Held morning glibenclamide. Sliding scale insulin continued; review HbA1c trend.",
        moreAttributes: 4,
      },
      lab: { name: "HbA1c", value: "9.8 %", flag: "high", moreAttributes: 9 },
      appointment: {
        kind: "Diabetology clinic",
        when: "Today · 14:30",
        with: "Dr. Usama Fadhul",
        moreAttributes: 3,
      },
      signature: [
        { label: "HbA1c", value: "9.8 %", flag: "high" },
        { label: "Fasting", value: "12.4 mmol/L", flag: "high" },
        { label: "Postprandial", value: "16.1 mmol/L", flag: "high" },
        { label: "Microalbumin", value: "92 mg/g", flag: "high" },
        { label: "Foot risk", value: "Moderate" },
      ],
    },
  },
  cardiology: {
    label: "Cardiology",
    subtitle: "Heart failure · post-discharge",
    data: {
      patient: {
        name: "Joseph K.",
        age: 62,
        sex: "M",
        tags: ["HFrEF · LVEF 32%", "AFib", "Stage 1 HTN"],
        moreAttributes: 14,
      },
      vital: {
        label: "Blood pressure",
        value: "146 / 92",
        trend: "up",
        time: "11 min ago",
        moreAttributes: 6,
      },
      medication: {
        name: "Bisoprolol",
        dose: "5 mg",
        freq: "OD",
        route: "PO",
        moreAttributes: 7,
      },
      note: {
        author: "Dr. Nuwagira Nelson · Cardiology",
        ts: "08:10",
        body: "NYHA II → III. Up-titrate bisoprolol once HR stable. Continue furosemide; recheck K+ in 48h.",
        moreAttributes: 5,
      },
      lab: { name: "NT-proBNP", value: "1,420 pg/mL", flag: "high", moreAttributes: 11 },
      appointment: {
        kind: "Echo + clinic",
        when: "Fri · 09:15",
        with: "Cardiology day-unit",
        moreAttributes: 4,
      },
      signature: [
        { label: "LVEF", value: "32 %", flag: "low" },
        { label: "BP", value: "146/92", flag: "high" },
        { label: "Troponin", value: "12 ng/L" },
        { label: "ECG", value: "AFib · rate 88" },
        { label: "NYHA", value: "III", flag: "high" },
        { label: "LDL", value: "3.2 mmol/L", flag: "high" },
      ],
    },
  },
  nephrology: {
    label: "Nephrology",
    subtitle: "CKD stage 4 · pre-dialysis planning",
    data: {
      patient: {
        name: "Esther M.",
        age: 54,
        sex: "F",
        tags: ["CKD 4", "Diabetic nephropathy", "Anaemia"],
        moreAttributes: 13,
      },
      vital: {
        label: "Dry weight",
        value: "62.4 kg",
        trend: "down",
        time: "today",
        moreAttributes: 4,
      },
      medication: {
        name: "Erythropoietin α",
        dose: "4,000 IU",
        freq: "3× / week",
        route: "SC",
        moreAttributes: 5,
      },
      note: {
        author: "Dr. Mirembe Joselyn Nayiga · Nephrology",
        ts: "09:05",
        body: "eGFR trending down 4 mL/min over 3 months. Discuss AV-fistula formation; refer vascular access clinic.",
        moreAttributes: 6,
      },
      lab: { name: "eGFR", value: "22 mL/min", flag: "low", moreAttributes: 14 },
      appointment: {
        kind: "Vascular access referral",
        when: "Mon · 10:00",
        with: "Vascular surgery",
        moreAttributes: 3,
      },
      signature: [
        { label: "eGFR", value: "22 mL/min", flag: "low" },
        { label: "Creatinine", value: "232 µmol/L", flag: "high" },
        { label: "Urea", value: "18.4 mmol/L", flag: "high" },
        { label: "Urine ACR", value: "84 mg/mmol", flag: "high" },
        { label: "Hb", value: "8.9 g/dL", flag: "low" },
        { label: "K+", value: "5.1 mmol/L" },
      ],
    },
  },
  pulmonology: {
    label: "Pulmonology",
    subtitle: "Asthma + COPD overlap · home oxygen",
    data: {
      patient: {
        name: "Peter W.",
        age: 68,
        sex: "M",
        tags: ["ACO", "Ex-smoker · 22 PY", "Home O₂"],
        moreAttributes: 11,
      },
      vital: {
        label: "SpO₂ on air",
        value: "89 %",
        trend: "down",
        time: "today 06:00",
        moreAttributes: 5,
      },
      medication: {
        name: "Salbutamol nebs",
        dose: "2.5 mg",
        freq: "PRN q4h",
        route: "Neb",
        moreAttributes: 4,
      },
      note: {
        author: "Dr. Murizihiwe Caroline · Pulmonology",
        ts: "11:20",
        body: "Exacerbation. Step up ICS; review oxygen titration at home. Pulmonary rehab referral pending.",
        moreAttributes: 4,
      },
      lab: { name: "FEV1", value: "1.42 L (46 %)", flag: "low", moreAttributes: 8 },
      appointment: {
        kind: "Pulm rehab assessment",
        when: "Thu · 11:00",
        with: "Respiratory team",
        moreAttributes: 3,
      },
      signature: [
        { label: "SpO₂", value: "89 %", flag: "low" },
        { label: "FEV1", value: "1.42 L · 46 %", flag: "low" },
        { label: "FVC", value: "2.81 L" },
        { label: "Peak flow", value: "240 L/min", flag: "low" },
        { label: "ACT score", value: "12 / 25", flag: "low" },
        { label: "Home O₂", value: "2 L/min · 16h" },
      ],
    },
  },
};

const TAB_ORDER: SpecialtyKey[] = ["diabetology", "cardiology", "nephrology", "pulmonology"];

export function AdaptiveModel() {
  const [active, setActive] = useState<SpecialtyKey>("diabetology");
  const current = SPECIALTIES[active];

  return (
    <section
      id="adaptive-model"
      aria-labelledby="adaptive-model-headline"
      className="border-border bg-muted/30 relative w-full border-y"
    >
      <div className="mx-auto w-full max-w-300 px-5 py-20 sm:px-8 sm:py-28">
        <div className="mb-8 flex flex-col gap-4">
          <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
            <span className="size-1 rounded-full bg-teal-500" />
            [02] &nbsp; One model, many specialties
          </span>
          <h2
            id="adaptive-model-headline"
            className="font-display text-foreground text-[34px] leading-[1.08] tracking-[-0.025em] text-balance sm:text-[52px]"
            style={{ fontWeight: 400 }}
          >
            The closed-loop record{" "}
            <span className="text-teal-700 italic dark:text-teal-300">adapts to the ward</span> —
            not the other way around.
          </h2>
          <p className="text-muted-foreground max-w-[64ch] text-[15px] leading-[1.55] sm:text-[17px]">
            Same six clinical objects everywhere. The attributes shift per specialty so Diabetology
            sees HbA1c first, Cardiology sees LVEF first, and nothing has to be re-built per team.
          </p>
        </div>

        {/* Tab bar */}
        <div className="border-border bg-card flex w-full max-w-2xl overflow-hidden rounded-lg border">
          {TAB_ORDER.map((key) => {
            const tab = SPECIALTIES[key];
            const isActive = key === active;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActive(key)}
                className={cn(
                  "group relative flex flex-1 flex-col items-start gap-0.5 px-3 py-2.5 text-left",
                  "transition-colors duration-150",
                  isActive
                    ? "bg-teal-50 text-teal-900 dark:bg-teal-50/10 dark:text-teal-100"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="text-[13px] font-medium">{tab.label}</span>
                <span className="text-[10.5px] opacity-70">{tab.subtitle}</span>
                {isActive ? (
                  <span className="absolute right-0 bottom-0 left-0 h-px bg-teal-500" />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Object grid */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <PatientCard data={current.data.patient} />
          <VitalCard data={current.data.vital} />
          <MedicationCard data={current.data.medication} />
          <NoteCard data={current.data.note} />
          <LabCard data={current.data.lab} />
          <AppointmentCard data={current.data.appointment} />
        </div>

        {/* Signature attributes strip — the specialty's diagnostic fingerprint */}
        <div className="border-border bg-card mt-6 rounded-lg border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
              {current.label} signature attributes
            </span>
            <span className="text-muted-foreground text-[11px] italic">
              These follow the patient between wards — never re-entered.
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {current.data.signature.map((field) => (
              <SignatureField key={field.label} field={field} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Card primitives ───────────────────────────────────────────────── */

function ObjectCardShell({
  kind,
  Icon,
  moreAttributes,
  children,
}: {
  kind: string;
  Icon: typeof UserIcon;
  moreAttributes: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-border bg-card group flex flex-col gap-2.5 rounded-lg border p-3.5",
        "ease-expo-out transition-[opacity,transform] duration-300 motion-reduce:transition-none",
      )}
    >
      <div className="text-muted-foreground flex items-center gap-2">
        <Icon className="size-3" strokeWidth={1.75} />
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase">{kind}</span>
      </div>
      {children}
      <div className="border-border text-muted-foreground mt-1 flex items-center justify-between border-t pt-2 text-[10.5px]">
        <span className="font-mono tracking-wide">+{moreAttributes} more attributes</span>
        <span className="opacity-50">›</span>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  flag,
}: {
  label: string;
  value: string;
  flag?: "ok" | "high" | "low";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground text-[11.5px]">{label}</span>
      <span
        className={cn(
          "tabular text-[12.5px]",
          flag === "high" || flag === "low"
            ? "text-status-critical-fg font-medium"
            : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function SignatureField({ field }: { field: CardField }) {
  return (
    <div className="border-border bg-muted/40 flex flex-col gap-0.5 rounded-md border p-2">
      <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.16em] uppercase">
        {field.label}
      </span>
      <span
        className={cn(
          "tabular text-[12px] font-medium",
          field.flag === "high" || field.flag === "low"
            ? "text-status-critical-fg"
            : "text-foreground",
        )}
      >
        {field.value}
      </span>
    </div>
  );
}

/* ─── Per-object cards ──────────────────────────────────────────────── */

function PatientCard({ data }: { data: SpecialtyCardSet["patient"] }) {
  return (
    <ObjectCardShell kind="Patient" Icon={UserIcon} moreAttributes={data.moreAttributes}>
      <div>
        <p className="font-display text-foreground text-[15px] font-medium">{data.name}</p>
        <p className="text-muted-foreground text-[11.5px]">
          {data.age} &middot; {data.sex}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        {data.tags.map((t) => (
          <span
            key={t}
            className="border-border text-muted-foreground inline-flex rounded-full border bg-transparent px-1.5 py-0.5 text-[10px]"
          >
            {t}
          </span>
        ))}
      </div>
    </ObjectCardShell>
  );
}

function VitalCard({ data }: { data: SpecialtyCardSet["vital"] }) {
  const arrow = data.trend === "up" ? "↑" : data.trend === "down" ? "↓" : "→";
  return (
    <ObjectCardShell
      kind="Vital reading"
      Icon={HeartPulseIcon}
      moreAttributes={data.moreAttributes}
    >
      <div>
        <p className="text-muted-foreground text-[11.5px]">{data.label}</p>
        <p className="tabular text-foreground text-[18px] font-medium">
          {data.value}{" "}
          <span
            className={cn(
              "ml-0.5 text-[14px]",
              data.trend === "down" ? "text-status-critical-fg" : "text-teal-500",
            )}
          >
            {arrow}
          </span>
        </p>
        <p className="text-muted-foreground text-[10.5px]">{data.time}</p>
      </div>
    </ObjectCardShell>
  );
}

function MedicationCard({ data }: { data: SpecialtyCardSet["medication"] }) {
  return (
    <ObjectCardShell kind="Medication" Icon={PillIcon} moreAttributes={data.moreAttributes}>
      <div>
        <p className="text-foreground text-[13px] font-medium">{data.name}</p>
        <div className="mt-1 flex flex-col gap-0.5">
          <FieldRow label="Dose" value={data.dose} />
          <FieldRow label="Frequency" value={data.freq} />
          <FieldRow label="Route" value={data.route} />
        </div>
      </div>
    </ObjectCardShell>
  );
}

function NoteCard({ data }: { data: SpecialtyCardSet["note"] }) {
  return (
    <ObjectCardShell kind="Care-team note" Icon={FileTextIcon} moreAttributes={data.moreAttributes}>
      <div>
        <p className="text-muted-foreground text-[10.5px]">
          {data.author} &middot; {data.ts}
        </p>
        <p className="text-foreground mt-1 text-[12px] leading-snug">{data.body}</p>
      </div>
    </ObjectCardShell>
  );
}

function LabCard({ data }: { data: SpecialtyCardSet["lab"] }) {
  return (
    <ObjectCardShell kind="Lab result" Icon={FlaskConicalIcon} moreAttributes={data.moreAttributes}>
      <div>
        <p className="text-muted-foreground text-[11.5px]">{data.name}</p>
        <p
          className={cn(
            "tabular text-[20px] font-medium",
            data.flag === "ok" ? "text-foreground" : "text-status-critical-fg",
          )}
        >
          {data.value}
        </p>
        <p className="text-muted-foreground text-[10.5px]">
          {data.flag === "ok" ? "Within range" : "Outside reference range"}
        </p>
      </div>
    </ObjectCardShell>
  );
}

function AppointmentCard({ data }: { data: SpecialtyCardSet["appointment"] }) {
  return (
    <ObjectCardShell
      kind="Appointment"
      Icon={CalendarClockIcon}
      moreAttributes={data.moreAttributes}
    >
      <div>
        <p className="text-foreground text-[13px] font-medium">{data.kind}</p>
        <div className="mt-1 flex flex-col gap-0.5">
          <FieldRow label="When" value={data.when} />
          <FieldRow label="With" value={data.with} />
        </div>
      </div>
    </ObjectCardShell>
  );
}
