import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { requirePatientScope } from "@/lib/patient/scope";
import { suggestedReadingKinds } from "@/lib/patient/self-tracking";
import { LogReadingForm } from "../_components/log-reading-form";

export const metadata: Metadata = { title: "Log a reading · MedSync" };
export const dynamic = "force-dynamic";

const KIND_VALUES = [
  "glucose",
  "bp",
  "weight",
  "spo2",
  "temperature",
  "symptom",
  "note",
  "other",
] as const;
type Kind = (typeof KIND_VALUES)[number];

interface PageProps {
  searchParams: Promise<{ kind?: string }>;
}

export default async function LogReadingPage({ searchParams }: PageProps) {
  const { kind: kindParam } = await searchParams;
  const scope = await requirePatientScope();
  const suggested = await suggestedReadingKinds(scope.userId);
  // ?kind=... wins over the conditions-derived default.
  const defaultKind: Kind = (KIND_VALUES as readonly string[]).includes(kindParam ?? "")
    ? (kindParam as Kind)
    : ((suggested[0] ?? "glucose") as Kind);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-9">
      <Link
        href="/patient/track"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-[12.5px] transition-colors"
      >
        <ArrowLeftIcon className="size-3.5" aria-hidden />
        Back to tracking
      </Link>

      <header className="flex flex-col gap-1.5">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          Log a reading
        </span>
        <h1 className="font-display text-foreground text-[24px] leading-[1.15] font-medium tracking-[-0.015em] sm:text-[28px]">
          A small entry
        </h1>
      </header>

      <LogReadingForm defaultKind={defaultKind} suggestedKinds={suggested} />
    </div>
  );
}
