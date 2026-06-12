import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRightIcon,
  BuildingIcon,
  ClipboardListIcon,
  StethoscopeIcon,
  UserIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Get started",
  description: "Sign up to MedSync as a patient, as medical staff, or on behalf of a hospital.",
};

/**
 * /get-started — intent selector (kickoff §B).
 *
 * Three audience tiles + a separate sign-in link for returning users.
 * No public "Admin" tile; no superadmin signup. The four-path flow
 * branches from here:
 *
 *   - patient  → no approval gate, active immediately after verify
 *   - clinical → council-anchored, per-affiliation approval, MFA mandatory
 *   - hospital → superadmin gate, applicant becomes scoped hospital_admin
 *   - superadmin → seeded, never public (signs in via standard /sign-in)
 *
 * GATE A scaffold: tiles route to the per-path signup stubs which
 * become real multi-step forms in gates C / D / E.
 */

interface IntentTile {
  audience: "patient" | "clinical" | "non_clinical" | "hospital";
  label: string;
  sub: string;
  details: string;
  approvalNote: string;
  href: string;
  Icon: typeof UserIcon;
}

const TILES: ReadonlyArray<IntentTile> = [
  {
    audience: "patient",
    label: "I'm a patient",
    sub: "Sign up to manage your own health record.",
    details:
      "Phone-verified signup. Optional MFA. Account is active right after you verify — pick a primary facility and join a queue from your dashboard.",
    approvalNote: "Active immediately after phone verification.",
    href: "/signup/patient",
    Icon: UserIcon,
  },
  {
    audience: "clinical",
    label: "I'm a clinician",
    sub: "Doctor, nurse, midwife, pharmacist, allied health.",
    details:
      "Council registration + licence upload (UMDPC, UNMC, AHPC, Pharmacy Board) is the verification anchor. One affiliation per hospital × department × role, each approved separately by the hospital's admin. MFA mandatory before any clinical access.",
    approvalNote: "Approval-gated, per affiliation. MFA required.",
    href: "/signup/clinical",
    Icon: StethoscopeIcon,
  },
  {
    audience: "non_clinical",
    label: "Reception, records or non-clinical staff",
    sub: "Front desk, records, admin — no clinical access.",
    details:
      "No professional council. Your hospital admin verifies you against your appointment and NIN. You get the reception workspace — bookings, intake, queue and demographics — but not clinical content.",
    approvalNote: "Hospital-admin approval. No clinical access.",
    href: "/signup/non-clinical",
    Icon: ClipboardListIcon,
  },
  {
    audience: "hospital",
    label: "I represent a hospital",
    sub: "Apply to onboard your institution.",
    details:
      "Institutional details + applicant authorisation. Once approved by MedSync, your account is elevated to hospital admin scoped to that hospital only. Pilot terms are cost-only for the founding cohort.",
    approvalNote: "Reviewed by MedSync. MFA required.",
    href: "/signup/hospital",
    Icon: BuildingIcon,
  },
];

export default function GetStartedPage() {
  return (
    <div className="bg-background relative isolate flex min-h-svh w-full flex-col">
      {/* Atmospheric teal radial — same shape as the landing hero */}
      <div
        aria-hidden
        className="fade-in-slow pointer-events-none absolute top-0 left-1/2 -z-10 h-[60%] w-[140%] max-w-none -translate-x-1/2 [background:radial-gradient(closest-side,oklch(0.95_0.06_180/0.45),transparent_72%)] dark:[background:radial-gradient(closest-side,oklch(0.45_0.08_180/0.25),transparent_72%)]"
      />

      <main className="mx-auto flex w-full max-w-300 flex-1 flex-col px-5 py-14 sm:px-8 sm:py-20">
        <header className="stagger-children mb-10 flex flex-col gap-4">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-[12.5px] transition-colors"
          >
            &larr; Back to MedSync
          </Link>
          <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
            <span className="pulse-dot size-1 rounded-full bg-teal-500" />
            Get started
          </span>
          <h1
            className="font-display text-foreground max-w-[24ch] text-[36px] leading-[1.05] tracking-[-0.025em] text-balance sm:text-[52px]"
            style={{ fontWeight: 400 }}
          >
            One record.{" "}
            <span className="text-teal-700 italic dark:text-teal-300">Four doors in.</span>
          </h1>
          <p className="text-muted-foreground max-w-[60ch] text-[15px] leading-[1.55] sm:text-[16.5px]">
            Pick the door that matches you. Patients get an account immediately; clinicians and
            hospitals go through approval so we can verify identity and protect patient data.
          </p>
        </header>

        <ul role="list" className="stagger-children grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {TILES.map((tile) => (
            <li key={tile.audience} className="flex">
              <Link
                href={tile.href}
                className={cn(
                  "group border-border bg-card card-lift relative flex h-full w-full flex-col gap-4 overflow-hidden rounded-xl border p-5",
                  "hover:border-teal-300",
                  "dark:hover:bg-teal-50/[0.04]",
                )}
              >
                {/* Quiet teal wash rises from the foot of the tile on hover */}
                <div
                  aria-hidden
                  className="ease-expo-out pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-teal-50/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-teal-50/6"
                />
                <div className="relative flex items-start justify-between">
                  <span className="ease-expo-out inline-flex size-10 items-center justify-center rounded-md bg-teal-50 text-teal-700 transition-colors duration-200 group-hover:bg-teal-100 dark:bg-teal-50/15 dark:text-teal-200 dark:group-hover:bg-teal-50/25">
                    <tile.Icon className="size-5" strokeWidth={1.75} />
                  </span>
                  <ArrowUpRightIcon
                    className="text-muted-foreground ease-expo-out size-4 transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-teal-700 dark:group-hover:text-teal-300"
                    strokeWidth={1.5}
                  />
                </div>
                <div className="relative flex flex-col gap-1.5">
                  <span className="font-display text-foreground text-[20px] leading-tight font-medium">
                    {tile.label}
                  </span>
                  <span className="text-muted-foreground text-[13px]">{tile.sub}</span>
                </div>
                <p className="relative text-[13px] leading-[1.55]">
                  <span className="text-foreground/80">{tile.details}</span>
                </p>
                <p className="text-muted-foreground border-border relative mt-auto border-t pt-3 font-mono text-[10.5px] tracking-[0.12em] uppercase">
                  {tile.approvalNote}
                </p>
              </Link>
            </li>
          ))}
        </ul>

        <div
          className="border-border reveal-up mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-6"
          style={{ animationDelay: "300ms" }}
        >
          <p className="text-muted-foreground text-[13px]">Already have an account?</p>
          <Link
            href="/sign-in"
            className="text-foreground border-border hover:bg-muted tap group inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-[13px] font-medium transition-colors hover:border-gray-300"
          >
            Sign in
            <ArrowUpRightIcon
              className="ease-expo-out size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={1.75}
            />
          </Link>
        </div>

        <p className="text-muted-foreground/70 fade-in-slow mt-10 max-w-[60ch] text-[11.5px] italic">
          MedSync is in private build. The forms below are scaffolded for review — the real
          multi-step signup, identity verification, and approval flows ship in gates C–F.
        </p>
      </main>
    </div>
  );
}
