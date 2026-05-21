import type { ClinicalStatus } from "@/components/medsync/clinical-badge";
import type { Metadata } from "next";
import Link from "next/link";

import { ClinicalBadge } from "@/components/medsync/clinical-badge";
import { ClinicalPath } from "@/components/medsync/clinical-path";
import { SectionNumber } from "@/components/medsync/section-number";
import { VitalStat } from "@/components/medsync/vital-stat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Design system",
  description:
    "Visual contract for MedSync — colors, typography, primitives, and clinical patterns.",
};

// ─── Data ────────────────────────────────────────────────────────────────

const neutralScale = [
  { name: "black", hex: "#000000", swatchClass: "bg-black", textOnLight: false },
  { name: "gray-950", hex: "#0A0A0A", swatchClass: "bg-gray-950", textOnLight: false },
  { name: "gray-900", hex: "#171717", swatchClass: "bg-gray-900", textOnLight: false },
  { name: "gray-800", hex: "#262626", swatchClass: "bg-gray-800", textOnLight: false },
  { name: "gray-700", hex: "#404040", swatchClass: "bg-gray-700", textOnLight: false },
  { name: "gray-600", hex: "#525252", swatchClass: "bg-gray-600", textOnLight: false },
  { name: "gray-500", hex: "#737373", swatchClass: "bg-gray-500", textOnLight: false },
  { name: "gray-400", hex: "#A3A3A3", swatchClass: "bg-gray-400", textOnLight: true },
  { name: "gray-300", hex: "#D4D4D4", swatchClass: "bg-gray-300", textOnLight: true },
  { name: "gray-200", hex: "#E5E5E5", swatchClass: "bg-gray-200", textOnLight: true },
  { name: "gray-150", hex: "#EFEFEF", swatchClass: "bg-gray-150", textOnLight: true },
  { name: "gray-100", hex: "#F5F5F5", swatchClass: "bg-gray-100", textOnLight: true },
  { name: "gray-50", hex: "#FAFAFA", swatchClass: "bg-gray-50", textOnLight: true },
  {
    name: "white",
    hex: "#FFFFFF",
    swatchClass: "bg-white border border-gray-200",
    textOnLight: true,
  },
] as const;

const tealScale = [
  { name: "teal-50", hex: "#F0FDFA", swatchClass: "bg-teal-50", textOnLight: true },
  { name: "teal-100", hex: "#CCFBF1", swatchClass: "bg-teal-100", textOnLight: true },
  { name: "teal-200", hex: "#99F6E4", swatchClass: "bg-teal-200", textOnLight: true },
  { name: "teal-300", hex: "#5EEAD4", swatchClass: "bg-teal-300", textOnLight: true },
  { name: "teal-400", hex: "#2DD4BF", swatchClass: "bg-teal-400", textOnLight: true },
  { name: "teal-500", hex: "#14B8A6", swatchClass: "bg-teal-500", textOnLight: false },
  { name: "teal-600", hex: "#0D9488", swatchClass: "bg-teal-600", textOnLight: false },
  { name: "teal-700", hex: "#0F766E", swatchClass: "bg-teal-700", textOnLight: false },
  { name: "teal-800", hex: "#115E59", swatchClass: "bg-teal-800", textOnLight: false },
  { name: "teal-900", hex: "#134E4A", swatchClass: "bg-teal-900", textOnLight: false },
] as const;

const clinicalStatuses: Array<{ status: ClinicalStatus; label: string; usage: string }> = [
  { status: "stable", label: "Stable", usage: "Patient stable, vitals normal" },
  { status: "critical", label: "Critical", usage: "Emergency, critical vitals" },
  { status: "caution", label: "Caution", usage: "Borderline vitals, warning" },
  { status: "admitted", label: "Admitted", usage: "Currently admitted" },
  { status: "discharged", label: "Discharged", usage: "Discharged patients" },
  { status: "pending", label: "Pending", usage: "Awaiting action" },
];

const typeScale = [
  { name: "Display XL", className: "text-display-xl", spec: "72/1.0/-0.04em/500" },
  { name: "Display L", className: "text-display-l", spec: "56/1.05/-0.035em/500" },
  { name: "Display M", className: "text-display-m", spec: "44/1.1/-0.03em/500" },
  { name: "Display S", className: "text-display-s", spec: "36/1.15/-0.025em/500" },
  { name: "Heading L", className: "text-heading-l", spec: "28/1.2/-0.02em/500" },
  { name: "Heading M", className: "text-heading-m", spec: "22/1.3/-0.015em/500" },
  { name: "Heading S", className: "text-heading-s", spec: "18/1.4/-0.01em/500" },
  { name: "Body L", className: "text-body-l", spec: "17/1.6/-0.006em/400" },
  { name: "Body M", className: "text-body-m", spec: "15/1.6/-0.004em/400" },
  { name: "Body S", className: "text-body-s", spec: "13/1.5/0/400" },
  { name: "Caption", className: "text-caption", spec: "11/1.4/0.02em/500" },
  { name: "Overline", className: "text-overline uppercase", spec: "11/1.4/0.08em/600" },
] as const;

const spacingScale = [
  2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 96, 120, 160,
] as const;

const radiiScale = [
  { name: "xs", className: "rounded-xs", value: "4px" },
  { name: "sm", className: "rounded-sm", value: "6px" },
  { name: "md", className: "rounded-md", value: "8px" },
  { name: "lg", className: "rounded-lg", value: "12px" },
  { name: "xl", className: "rounded-xl", value: "16px" },
  { name: "2xl", className: "rounded-2xl", value: "20px" },
  { name: "full", className: "rounded-full", value: "9999px" },
] as const;

const shadowsScale = [
  { name: "xs", className: "shadow-xs" },
  { name: "sm", className: "shadow-sm" },
  { name: "md", className: "shadow-md" },
  { name: "lg", className: "shadow-lg" },
  { name: "card", className: "shadow-card" },
  { name: "popover", className: "shadow-popover" },
] as const;

// ─── Components ──────────────────────────────────────────────────────────

interface SectionProps {
  n: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

function Section({ n, title, subtitle, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <SectionNumber n={n} />
          <span className="text-caption font-mono text-gray-400 uppercase">{title}</span>
        </div>
        {subtitle ? <p className="text-body-m max-w-2xl text-gray-600">{subtitle}</p> : null}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Swatch({
  name,
  hex,
  swatchClass,
  textOnLight,
}: {
  name: string;
  hex: string;
  swatchClass: string;
  textOnLight: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`h-16 w-full rounded-md ${swatchClass} flex items-end justify-between p-2 transition-shadow duration-150 hover:shadow-md`}
      >
        <span
          className={`font-mono text-[10px] ${textOnLight ? "text-gray-700" : "text-white/80"}`}
        >
          {hex}
        </span>
      </div>
      <span className="font-mono text-[11px] text-gray-500">{name}</span>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function StyleguidePage() {
  return (
    <div className="bg-background min-h-svh">
      {/* Header */}
      <header className="border-gray-150 border-b">
        <div className="mx-auto flex w-full max-w-300 items-center justify-between px-8 py-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="font-display text-heading-s tracking-tight text-gray-900">
              MedSync
            </span>
            <span className="font-mono text-[11px] tracking-wider text-gray-400 uppercase">
              Design system
            </span>
          </Link>
          <Link
            href="/"
            className="text-[13px] text-gray-500 transition-colors duration-150 hover:text-gray-900"
          >
            ← Back home
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-300 px-8 py-16">
        {/* Title block */}
        <div className="mb-20 flex flex-col gap-6">
          <ClinicalPath segments={["docs", "design system"]} />
          <h1 className="font-display text-display-l text-gray-900">The visual contract.</h1>
          <p className="text-body-l max-w-2xl text-gray-500">
            Every token, primitive, and clinical pattern that defines MedSync. Mirror this page
            whenever you build a new view. Disagreements with{" "}
            <code className="text-body-s font-mono text-teal-600">DESIGN-medsync.md</code> are
            resolved by the document.
          </p>
        </div>

        <div className="flex flex-col gap-24">
          {/* 01 — Neutrals */}
          <Section
            n={1}
            title="Neutrals"
            subtitle="90% of the UI lives here. Backgrounds, borders, text — monochrome by default."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {neutralScale.map((s) => (
                <Swatch key={s.name} {...s} />
              ))}
            </div>
          </Section>

          {/* 02 — Teal */}
          <Section
            n={2}
            title="Teal (clinical accent)"
            subtitle="Trust, calm, medical authority. teal-600 is the anchor — primary CTAs, links, active nav."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 lg:grid-cols-10">
              {tealScale.map((s) => (
                <Swatch key={s.name} {...s} />
              ))}
            </div>
          </Section>

          {/* 03 — Clinical status */}
          <Section
            n={3}
            title="Clinical status"
            subtitle="Six patient/data states. Red is reserved for clinical emergencies only — never decoration."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {clinicalStatuses.map(({ status, label, usage }) => (
                <div
                  key={status}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
                >
                  <div className="flex flex-col gap-1.5">
                    <ClinicalBadge status={status}>{label}</ClinicalBadge>
                    <span className="text-body-s text-gray-500">{usage}</span>
                  </div>
                  <code className="font-mono text-[10px] text-gray-400">{status}</code>
                </div>
              ))}
            </div>
          </Section>

          {/* 04 — Typography */}
          <Section
            n={4}
            title="Typography"
            subtitle="Neue Haas Grotesk for UI, fallback chain through Helvetica Neue. SF Mono / Fira Code for clinical data."
          >
            <div className="flex flex-col">
              {typeScale.map((t) => (
                <div
                  key={t.name}
                  className="border-gray-150 flex flex-wrap items-baseline justify-between gap-4 border-b py-5 last:border-b-0"
                >
                  <div className={`${t.className} text-gray-900`}>{t.name}</div>
                  <div className="flex items-baseline gap-3">
                    <code className="font-mono text-[11px] text-gray-400">{t.spec}</code>
                    <code className="font-mono text-[11px] text-teal-600">
                      .{t.className.split(" ")[0]}
                    </code>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* 05 — Buttons */}
          <Section
            n={5}
            title="Buttons"
            subtitle="Six variants, three sizes. All transition with the expo-out easing at 150ms. Emergency is clinical-only."
          >
            <div className="flex flex-col gap-12">
              {(["primary", "secondary", "ghost", "tealSoft", "emergency", "alert"] as const).map(
                (variant) => (
                  <div
                    key={variant}
                    className="border-gray-150 grid grid-cols-1 items-center gap-6 border-b pb-8 last:border-b-0 last:pb-0 sm:grid-cols-[120px_1fr]"
                  >
                    <code className="font-mono text-[11px] text-gray-500">{variant}</code>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant={variant} size="sm">
                        Small
                      </Button>
                      <Button variant={variant} size="md">
                        Medium action
                      </Button>
                      <Button variant={variant} size="lg">
                        Large action
                      </Button>
                      <Button variant={variant} size="md" disabled>
                        Disabled
                      </Button>
                    </div>
                  </div>
                ),
              )}
            </div>
          </Section>

          {/* 06 — Inputs */}
          <Section
            n={6}
            title="Inputs"
            subtitle="Compact for data density. Focus ring is teal-tinted."
          >
            <div className="grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <Label htmlFor="patient-name">Patient name</Label>
                <Input id="patient-name" placeholder="Last, First" defaultValue="Mukasa, Joseph" />
              </div>
              <div>
                <Label htmlFor="mrn">MRN</Label>
                <Input id="mrn" placeholder="MRN-2026-00000" className="font-mono tracking-wider" />
              </div>
              <div>
                <Label htmlFor="dose">Dose</Label>
                <Input id="dose" placeholder="—" disabled defaultValue="500 mg" />
              </div>
              <div>
                <Label htmlFor="dob">Date of birth</Label>
                <Input id="dob" placeholder="DD MMM YYYY" aria-invalid defaultValue="32 Feb 1990" />
              </div>
            </div>
          </Section>

          {/* 07 — Cards */}
          <Section
            n={7}
            title="Cards"
            subtitle="Three tones: standard for default surfaces, muted for grouped data, teal-tinted for clinical highlights."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card tone="standard">
                <CardHeader>
                  <CardTitle>Standard</CardTitle>
                  <CardDescription>
                    White surface with 1px gray-200 border + card shadow.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-body-s text-gray-600">
                    Default container for forms, modules, and most layouts.
                  </p>
                </CardContent>
              </Card>
              <Card tone="muted">
                <CardHeader>
                  <CardTitle>Muted</CardTitle>
                  <CardDescription>
                    gray-50 surface, no shadow. For grouped sub-sections.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-body-s text-gray-600">
                    Reduces visual weight when nested inside a standard card.
                  </p>
                </CardContent>
              </Card>
              <Card tone="tealTinted">
                <CardHeader>
                  <CardTitle>Teal-tinted</CardTitle>
                  <CardDescription>
                    For clinical highlights — current admission, active alert, focus context.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-body-s text-gray-600">
                    Pair with a clinical-bracket label, never used decoratively.
                  </p>
                </CardContent>
              </Card>
            </div>
          </Section>

          {/* 08 — Vital stat strip */}
          <Section
            n={8}
            title="Vital stat strip"
            subtitle="The clinical primitive. Monospace, tabular-nums, large. Critical vitals snap to red + bold."
          >
            <Card tone="standard">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <CardTitle>Mukasa, Joseph</CardTitle>
                    <CardDescription className="font-mono">
                      MRN-2026-00481 · 47y · M · Ward 4-B
                    </CardDescription>
                  </div>
                  <ClinicalBadge status="critical">Critical</ClinicalBadge>
                </div>
              </CardHeader>
              <Separator className="-mx-6 my-2 w-auto" />
              <CardContent>
                <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
                  <VitalStat label="HR" value="142" unit="bpm" tone="critical" meta="14:32" />
                  <VitalStat label="BP" value="186/112" unit="mmHg" tone="critical" meta="14:32" />
                  <VitalStat label="SpO₂" value="89" unit="%" tone="critical" meta="14:32" />
                  <VitalStat label="Temp" value="38.4" unit="°C" tone="normal" meta="14:30" />
                </div>
              </CardContent>
            </Card>
          </Section>

          {/* 09 — Section numbers + clinical paths */}
          <Section
            n={9}
            title="Section numbers & clinical paths"
            subtitle="Bracket numbers anchor the eye through dense layouts. Path notation locates the clinician in the IA."
          >
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              <Card tone="muted">
                <CardHeader>
                  <CardTitle className="text-body-m">Section numbers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-3">
                    {[1, 2, 3, 4, 12].map((n) => (
                      <SectionNumber key={n} n={n} />
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card tone="muted">
                <CardHeader>
                  <CardTitle className="text-body-m">Clinical paths</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3">
                    <ClinicalPath segments={["patient", "vitals"]} separator="→" />
                    <ClinicalPath segments={["ward", "bed 12"]} separator="⋮" />
                    <ClinicalPath segments={["labs", "hematology"]} separator="·" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </Section>

          {/* 10 — Spacing */}
          <Section
            n={10}
            title="Spacing"
            subtitle="4px base grid. Tailwind utilities map 1-to-1 (8px = p-2, 16px = p-4, …)."
          >
            <div className="flex flex-wrap items-end gap-6">
              {spacingScale.map((px) => (
                <div key={px} className="flex flex-col items-center gap-2">
                  <div
                    className="bg-teal-600"
                    style={{ width: `${px}px`, height: `${px}px` }}
                    aria-hidden
                  />
                  <code className="font-mono text-[10px] text-gray-500">{px}</code>
                </div>
              ))}
            </div>
          </Section>

          {/* 11 — Radii */}
          <Section
            n={11}
            title="Radii"
            subtitle="Six steps. xs for badges, sm for inputs, md for buttons, lg for cards."
          >
            <div className="flex flex-wrap items-center gap-6">
              {radiiScale.map((r) => (
                <div key={r.name} className="flex flex-col items-center gap-2">
                  <div className={`size-20 border border-teal-200 bg-teal-50 ${r.className}`} />
                  <div className="flex flex-col items-center">
                    <code className="font-mono text-[11px] text-gray-900">{r.name}</code>
                    <code className="font-mono text-[10px] text-gray-400">{r.value}</code>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* 12 — Shadows */}
          <Section
            n={12}
            title="Shadows"
            subtitle="Restrained elevation. card is the workhorse — paired with a 1px border."
          >
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
              {shadowsScale.map((s) => (
                <div key={s.name} className="flex flex-col items-center gap-3">
                  <div className={`size-24 rounded-lg bg-white ${s.className}`} />
                  <code className="font-mono text-[11px] text-gray-500">{s.name}</code>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <footer className="border-gray-150 mt-32 flex items-center justify-between border-t pt-8 text-[11px] text-gray-400">
          <span>
            Source of truth: <code className="font-mono text-teal-600">DESIGN-medsync.md</code>
          </span>
          <span>Phase 0.2 · 2026-05-21</span>
        </footer>
      </main>
    </div>
  );
}
