import type { HeroVariant } from "./_components/hero-card";
import type { AppointmentRow } from "@/lib/patient/appointments";
import type { ServiceLineCard as LineCard } from "@/lib/patient/discover";
import type { ReadingRow, TrackingGlance } from "@/lib/patient/self-tracking";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { Pill } from "@/components/ui/pill";
import {
  fetchAppointments,
  formatWhen,
  STATUS_LABEL,
  STATUS_TONES,
} from "@/lib/patient/appointments";
import { fetchDiscovery } from "@/lib/patient/discover";
import { requirePatientScope } from "@/lib/patient/scope";
import {
  fetchTrackingGlance,
  formatReadingValue,
  formatReadingWhen,
  listRecentReadings,
  READING_KIND_LABEL,
} from "@/lib/patient/self-tracking";
import { PatientDoors } from "./_components/doors";
import { HeroCard } from "./_components/hero-card";
import { PatientPageHeader } from "./_components/page-header";
import { ProviderCard } from "./_components/provider-card";
import { ServiceLineCard } from "./_components/service-line-card";
import { TintedRow } from "./_components/tinted-row";

export const metadata: Metadata = { title: "Home · MedSync" };
export const dynamic = "force-dynamic";

/**
 * The patient home: one greeting, the emergency instruction, the two doors,
 * then one saturated hero for the thing that matters next, the day's doses,
 * the visits ahead, and what was last logged. Everything below the doors is a
 * glance — the work happens one tap away.
 *
 * The doors used to live in the quick-actions aside, which at a wide content
 * box is a 20rem context column but below that collapses into the single
 * column **in source order** — landing them after the hero, the doses, the
 * visits and the readings on the one device that matters. ADR 0084 §1 is
 * explicit that primary is a layout fact, not a claim, so they moved into the
 * main column instead. What is left in the aside is genuinely secondary, and
 * is still written last for the same source-order reason.
 */
export default async function PatientHome() {
  const scope = await requirePatientScope();

  const [upcoming, glance, readings, discovery] = await Promise.all([
    scope.primaryHospitalId ? fetchUpcomingVisits(scope.userId) : Promise.resolve([]),
    fetchTrackingGlance(scope.userId),
    listRecentReadings(scope.userId, 3),
    // ADR 0085 §4: the phone has shown clinics and clinicians since Gate C;
    // this is the web half that record names as the outstanding follow-up.
    // Fails to empty — a browse section is a convenience, never the screen.
    scope.primaryHospitalId
      ? fetchDiscovery(scope.primaryHospitalId, scope.userId).catch(() => ({
          lines: [],
          providers: [],
        }))
      : Promise.resolve({ lines: [], providers: [] }),
  ]);

  const now = new Date();
  const firstName = scope.fullName?.split(" ")[0];
  const doses = glance.todaySlots;
  const nextVisit = upcoming[0];
  // Gates the doors. The fallback only fires if the hospital row behind an
  // affiliation has gone.
  const hospitalName = scope.primaryHospitalId
    ? (scope.primaryHospitalName ?? "Your hospital")
    : null;

  // The ladder: a patient with no hospital has one job, a patient with a
  // visit booked wants to see it, and after that the day's doses are the
  // most useful thing we can prove. "Start with one reading" is last
  // because it is the only branch that asks for something new.
  const hero: HeroVariant = !scope.primaryHospitalId
    ? { kind: "connect" }
    : nextVisit
      ? {
          kind: "visit",
          clinicianName: nextVisit.clinicianName,
          departmentName: nextVisit.departmentName,
          hospitalName: nextVisit.hospitalName,
          startsAtIso: nextVisit.startsAtIso,
          statusLabel: STATUS_LABEL[nextVisit.status] ?? nextVisit.status,
        }
      : doses.total > 0
        ? { kind: "doses", taken: doses.taken, total: doses.total, next: doses.next }
        : { kind: "first-reading" };

  return (
    <div className="grid gap-6 @5xl/page:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="stagger-children flex min-w-0 flex-col gap-6">
        <PatientPageHeader
          eyebrow="MedSync · Your space"
          title={firstName ? `Hello, ${firstName}.` : "Hello."}
          description={
            scope.primaryHospitalName
              ? // "…and book when you need to" is gone: ADR 0084 §2's no-jargon
                // rule runs to confirmation, not just to the buttons, and the
                // doors immediately below now say this better than a clause can.
                `${scope.primaryHospitalName} is your hospital. Track how you're doing and see your visits.`
              : "This is your private space. Track how you're doing day to day; connect to a hospital whenever you're ready."
          }
        />

        {/* The emergency block is the layout's now (ADR 0088 C9); only the
            doors are gated, on having a hospital to walk into. */}
        {hospitalName ? <PatientDoors /> : null}

        <HeroCard variant={hero} />

        {/* The clinics this hospital runs, and who a patient could pick.
            ADR 0085 §4's presentation: a face, a real rating or "No ratings
            yet", and the soonest day the engine actually derived. The one
            filled tile is the clinic open soonest — emphasis carrying a fact,
            not a decoration. */}
        {discovery.lines.length > 0 ? (
          <section aria-labelledby="find-care" className="flex flex-col gap-3">
            <SectionHead
              id="find-care"
              title="Find care"
              linkHref="/patient/book"
              linkLabel="Book a visit"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {discovery.lines.slice(0, 4).map((line) => (
                <ServiceLineCard
                  key={line.id}
                  line={line}
                  emphasis={line.id === soonestLineId(discovery.lines)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {discovery.providers.length > 0 ? (
          <section aria-labelledby="find-doctor" className="flex flex-col gap-3">
            <SectionHead
              id="find-doctor"
              title="Your clinicians"
              linkHref="/patient/book"
              linkLabel="See all"
            />
            {/* A scroller, not a grid: the reference's carousel, and on a
                narrow phone it keeps the first card whole rather than
                shrinking four into a row nobody can read. */}
            <ul className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
              {discovery.providers.slice(0, 8).map((p) => (
                <li key={p.userId} className="snap-start">
                  <ProviderCard provider={p} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* The hero already *is* today's doses in that branch; a second
            copy of the same ratio underneath it would say nothing new. */}
        {hero.kind === "doses" ? null : (
          <section className="flex flex-col gap-3">
            <SectionHead
              title="Today's doses"
              linkHref="/patient/track/medications"
              linkLabel="All medicines"
            />
            <ul className="stagger-children flex flex-col gap-2">
              {doses.total > 0 ? (
                <TintedRow
                  tint="brand"
                  iconKey="pill"
                  title="Doses today"
                  subtitle={doseSubtitle(doses)}
                  href="/patient/track/doses"
                  trailing={
                    <span className="text-foreground text-body-m font-mono tabular-nums">
                      {doses.taken}/{doses.total}
                    </span>
                  }
                />
              ) : (
                <TintedRow
                  tint="brand"
                  iconKey="pill"
                  title="Nothing scheduled today"
                  subtitle="Add a medicine and its times to see them here"
                  href="/patient/track/medications"
                />
              )}
            </ul>
          </section>
        )}

        {/* Hidden entirely when unaffiliated: there is nowhere to book yet,
            so an empty "Upcoming visits" would be a dead section. */}
        {scope.primaryHospitalId ? (
          <section className="flex flex-col gap-3">
            <SectionHead
              title="Upcoming visits"
              linkHref="/patient/appointments"
              linkLabel="View all"
            />
            {/* The empty line is not "when you book a visit or join a queue":
                this section reads appointments only, so a declared intake has
                never landed here — and ADR 0084 §2 retires both words anyway. */}
            {upcoming.length === 0 ? (
              <EmptyLine>Nothing yet. A visit you have asked for shows up here.</EmptyLine>
            ) : (
              <ul className="stagger-children flex flex-col gap-2">
                {upcoming.map((visit) => (
                  <VisitRow key={visit.id} visit={visit} />
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <SectionHead title="Recent readings" linkHref="/patient/track" linkLabel="See readings" />
          {readings.length === 0 ? (
            <EmptyLine>
              Nothing logged yet. A glucose, blood-pressure or weight reading takes a moment.
            </EmptyLine>
          ) : (
            <ul className="stagger-children flex flex-col gap-2">
              {readings.map((reading) => (
                <ReadingRowItem key={reading.id} reading={reading} now={now} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Named, because at desktop the rail's <nav> is not the only landmark
          in the document and an unnamed `complementary` is unnavigable. */}
      <aside
        aria-labelledby="quick-actions"
        className="flex min-w-0 flex-col gap-3 @5xl/page:sticky @5xl/page:top-17 @5xl/page:self-start"
      >
        <h2 id="quick-actions" className="text-heading-s font-medium">
          Quick actions
        </h2>
        {/* The two doors are not here any more (ADR 0084 §1b) — what remains
            is the same two rows either way, so the affiliated fork went with
            them. Mint on the hospital row keeps the pair from reading as two
            identical brand rows; tint is recognition only, never meaning. */}
        <ul className="stagger-children flex flex-col gap-2">
          <TintedRow
            tint="brand"
            iconKey="activity"
            title="Log a reading"
            subtitle="Glucose, blood pressure, weight…"
            href="/patient/track/log"
          />
          <TintedRow
            tint="mint"
            iconKey="hospital"
            title={hospitalName ?? "Find your hospital"}
            subtitle={hospitalName ? "Your hospital — change it here" : "Browse MedSync hospitals"}
            href="/patient/hospitals"
          />
        </ul>
      </aside>
    </div>
  );
}

/* ── Sections ──────────────────────────────────────────────────── */

function SectionHead({
  id,
  title,
  linkHref,
  linkLabel,
}: {
  /** Set when a `<section aria-labelledby>` names this heading. */
  id?: string;
  title: string;
  linkHref: string;
  linkLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="text-heading-s font-medium">
        {title}
      </h2>
      {/* No underline at rest — blue-underlined "view all" is not in the
          system; the negative margin keeps the 44px target invisible. */}
      <Link
        href={linkHref}
        className="text-primary text-body-s duration-fast ease-expo-out -my-2 inline-flex min-h-11 shrink-0 items-center rounded-md underline-offset-4 transition-colors hover:underline focus-visible:underline"
      >
        {linkLabel}
      </Link>
    </div>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground bg-card text-body-s dark:shadow-card rounded-xl p-4 leading-relaxed shadow-xs">
      {children}
    </p>
  );
}

function VisitRow({ visit }: { visit: AppointmentRow }) {
  return (
    <li>
      {/* The list is the detail view — there is no per-appointment route,
          so the row anchors into the visits list instead of inventing one. */}
      <Link
        href={`/patient/appointments#visit-${visit.id}`}
        className="bg-card dark:shadow-card tap flex flex-col gap-1.5 rounded-lg p-4 shadow-xs md:hover:brightness-[0.98] dark:md:hover:brightness-110"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="text-foreground text-body-m min-w-0 flex-1 truncate font-medium">
            {visit.clinicianName}
          </span>
          <Pill tone={STATUS_TONES[visit.status] ?? "neutral"} className="shrink-0">
            {STATUS_LABEL[visit.status] ?? visit.status}
          </Pill>
        </span>
        <span className="text-muted-foreground text-body-s truncate">
          {visit.departmentName} · {visit.type === "virtual" ? "Virtual" : "In person"}
        </span>
        <span className="text-foreground text-body-s">{formatWhen(visit.startsAtIso)}</span>
      </Link>
    </li>
  );
}

function ReadingRowItem({ reading, now }: { reading: ReadingRow; now: Date }) {
  const value = formatReadingValue(reading);

  return (
    <li className="bg-card dark:shadow-card flex min-h-16 items-center justify-between gap-3 rounded-lg px-4 py-3 shadow-xs">
      <span className="min-w-0">
        <span className="text-muted-foreground text-body-s block">
          {READING_KIND_LABEL[reading.kind] ?? "Reading"}
        </span>
        {/* A note or a symptom has no numeric value, and an empty mono slot
            reads as a missing number rather than a written entry — so the
            prose stands in for it, clipped by the row, not by a slice. */}
        {value ? (
          <span className="text-foreground text-body-m block font-mono tabular-nums">{value}</span>
        ) : reading.note ? (
          <span className="text-foreground text-body-m block truncate">{reading.note}</span>
        ) : reading.severity !== null ? (
          <span className="text-foreground text-body-m block">
            Severity <span className="font-mono tabular-nums">{reading.severity}</span> of 5
          </span>
        ) : (
          <span className="text-muted-foreground text-body-m block">No value recorded</span>
        )}
      </span>
      <time
        dateTime={reading.recordedAtIso}
        className="text-muted-foreground text-caption shrink-0 font-mono tabular-nums"
      >
        {formatReadingWhen(reading.recordedAtIso, now)}
      </time>
    </li>
  );
}

/* ── Data + format helpers ─────────────────────────────────────── */

/**
 * Home must survive a scheduling outage. Every other card on this page
 * comes from self-tracking, so a failed appointments read renders the
 * "nothing yet" line rather than taking the whole screen down with it.
 */
async function fetchUpcomingVisits(patientUserId: string): Promise<AppointmentRow[]> {
  try {
    return await fetchAppointments(patientUserId, "upcoming-active", 3);
  } catch {
    return [];
  }
}

/**
 * Never "all taken" when slots are still unrecorded: `next` is only the
 * earliest slot still within its grace window, so a day with a missed
 * 08:00 and nothing else due has no next dose and is not complete either.
 * Naming the state is the timeline's job — this line only points at it.
 */
function doseSubtitle(doses: TrackingGlance["todaySlots"]): string {
  if (doses.next) return `Next · ${doses.next.name} at ${doses.next.timeLabel}`;
  if (doses.taken >= doses.total) return "Everything recorded for today";
  return "Some doses have no entry yet";
}

/**
 * The clinic with something open soonest — the one tile drawn filled. Null
 * when nothing is open anywhere, in which case no tile is emphasised rather
 * than an arbitrary one being singled out.
 */
function soonestLineId(lines: ReadonlyArray<LineCard>): string | null {
  const open = lines.filter((l) => l.soonest !== null);
  if (open.length === 0) return null;
  return open.reduce((best, l) =>
    (l.soonest as { dateKey: string }).dateKey < (best.soonest as { dateKey: string }).dateKey
      ? l
      : best,
  ).id;
}
