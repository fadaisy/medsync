import type { AvailabilityKind } from "@/db/schema/scheduling";
import type { Metadata } from "next";
import { and, asc, eq, gte } from "drizzle-orm";

import { db } from "@/db";
import { availabilityBlocks, clinicianSchedulingSettings } from "@/db/schema/scheduling";
import { requireClinicianScope } from "@/lib/clinician/scope";
import { AvailabilityList } from "./_components/availability-list";
import { SettingsPanel } from "./_components/settings-panel";

export const metadata: Metadata = {
  title: "Availability · MedSync",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ block?: string; new?: string }>;
}

export interface AvailabilityRow {
  id: string;
  kind: AvailabilityKind;
  startsAtIso: string;
  endsAtIso: string;
  recurrence: string;
  recurrenceWeekday: number | null;
  recurrenceUntilIso: string | null;
  location: string | null;
  notes: string | null;
}

export interface SettingsRow {
  autoConfirm: boolean;
  defaultSlotMinutes: number;
  bufferMinutes: number;
  allowVirtual: boolean;
  allowOutOfHoursOverride: boolean;
}

const DEFAULT_SETTINGS: SettingsRow = {
  autoConfirm: false,
  defaultSlotMinutes: 15,
  bufferMinutes: 0,
  allowVirtual: false,
  allowOutOfHoursOverride: true,
};

export default async function AvailabilityPage({ searchParams }: PageProps) {
  const scope = await requireClinicianScope();
  const params = await searchParams;

  const [blocks, settingsRow] = await Promise.all([
    fetchAvailability(scope.userId, scope.hospitalId),
    fetchSettings(scope.userId, scope.hospitalId),
  ]);

  const settings: SettingsRow = settingsRow ?? DEFAULT_SETTINGS;

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* Quiet atmosphere — a 5% teal wash behind the header, nothing louder. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(80%_100%_at_50%_0%,rgba(13,148,136,0.05),transparent_70%)]"
      />

      <header className="reveal-up flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex w-fit items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="bg-brand-500 ring-brand-500/20 size-1 rounded-full ring-2" />
          {scope.hospitalName} · {scope.departmentName}
        </span>
        <h1 className="font-display text-foreground sm:text-heading-l text-[24px] leading-[1.15] font-medium tracking-[-0.015em]">
          Your availability
        </h1>
        <p className="text-muted-foreground max-w-2xl text-[13.5px] leading-relaxed">
          Declare your bookable hours, mark out your teaching, ward rounds and admin, and choose
          whether requests confirm automatically or wait for your approval.
        </p>
        <div className="bg-brand-500/60 dark:bg-brand-400/50 h-px w-10" aria-hidden />
      </header>

      <div className="reveal-up" style={{ animationDelay: "70ms" }}>
        <SettingsPanel settings={settings} usingDefaults={!settingsRow} />
      </div>

      <AvailabilityList
        blocks={blocks}
        selectedBlockId={params.block ?? null}
        isCreatingNew={params.new === "1"}
      />
    </div>
  );
}

/* ─── Data fetchers ────────────────────────────────────────────────── */

async function fetchAvailability(
  clinicianUserId: string,
  hospitalId: string,
): Promise<AvailabilityRow[]> {
  // Pull all blocks from the start of yesterday onwards so the
  // clinician can see + adjust today's block + everything ahead.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: availabilityBlocks.id,
      kind: availabilityBlocks.kind,
      startsAt: availabilityBlocks.startsAt,
      endsAt: availabilityBlocks.endsAt,
      recurrence: availabilityBlocks.recurrence,
      recurrenceWeekday: availabilityBlocks.recurrenceWeekday,
      recurrenceUntil: availabilityBlocks.recurrenceUntil,
      location: availabilityBlocks.location,
      notes: availabilityBlocks.notes,
      state: availabilityBlocks.state,
    })
    .from(availabilityBlocks)
    .where(
      and(
        eq(availabilityBlocks.clinicianUserId, clinicianUserId),
        eq(availabilityBlocks.hospitalId, hospitalId),
        gte(availabilityBlocks.startsAt, since),
      ),
    )
    .orderBy(asc(availabilityBlocks.startsAt));

  return rows
    .filter((r) => r.state === "active")
    .map((r) => ({
      id: r.id,
      kind: r.kind as AvailabilityKind,
      startsAtIso: r.startsAt.toISOString(),
      endsAtIso: r.endsAt.toISOString(),
      recurrence: r.recurrence,
      recurrenceWeekday: r.recurrenceWeekday ?? null,
      recurrenceUntilIso: r.recurrenceUntil ? r.recurrenceUntil.toISOString() : null,
      location: r.location,
      notes: r.notes,
    }));
}

async function fetchSettings(
  clinicianUserId: string,
  hospitalId: string,
): Promise<SettingsRow | null> {
  const [row] = await db
    .select({
      autoConfirm: clinicianSchedulingSettings.autoConfirm,
      defaultSlotMinutes: clinicianSchedulingSettings.defaultSlotMinutes,
      bufferMinutes: clinicianSchedulingSettings.bufferMinutes,
      allowVirtual: clinicianSchedulingSettings.allowVirtual,
      allowOutOfHoursOverride: clinicianSchedulingSettings.allowOutOfHoursOverride,
    })
    .from(clinicianSchedulingSettings)
    .where(
      and(
        eq(clinicianSchedulingSettings.clinicianUserId, clinicianUserId),
        eq(clinicianSchedulingSettings.hospitalId, hospitalId),
      ),
    )
    .limit(1);
  return row ?? null;
}
