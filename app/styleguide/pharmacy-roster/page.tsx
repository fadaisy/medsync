import type { Cadre, Place } from "@/lib/pharmacy/derive/roster";
import type { RosterView } from "@/lib/pharmacy/roster/view";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RosterTab } from "@/components/pharmacy/roster/roster-tab";
import {
  addDays,
  fillGaps,
  holidays,
  ROSTER_DEFAULTS,
  weekStart,
} from "@/lib/pharmacy/derive/roster";
import { kampalaNow } from "@/lib/pharmacy/roster/read";

/**
 * Development fixture: Set-up › People and roster on synthetic data (no database, no real people), for the 1440 and
 * 390 px pass and axe. 404 outside development. Actions fail here (no database); the page only renders.
 */
export const metadata: Metadata = { title: "Roster fixture", robots: { index: false } };

const P = (id: string, name: string, kind: Place["kind"], shifts: Place["shifts"]): Place => ({
  id: `00000000-0000-4000-8000-00000000000${id}`,
  name,
  kind,
  shifts,
});
const PLACES = [
  P("a", "Main store", "store", ["day", "call"]),
  P("b", "OPD dispensary", "dispensing_point", ["day"]),
  P("c", "Inpatient dispensary", "dispensing_point", ["day"]),
];
const uid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export default async function Page({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const now = kampalaNow(new Date());
  const start =
    sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? weekStart(sp.week) : weekStart(now.date);
  const all = PLACES.map((p) => p.id);
  const people: RosterView["people"] = (
    [
      ["Pharmacist A", "pharmacist", all, 400],
      ["Pharmacist B", "pharmacist", all, 20],
      ["Technician C", "technician", [all[1]!, all[2]!], 300],
      ["Technician D", "technician", all, -3],
      ["Dispenser E", "dispenser", [all[1]!], 200],
      ["Technician F", "technician", [all[2]!], 250],
      ["Store keeper G", "store_keeper", [all[0]!], 0],
    ] as const
  ).map(([name, cadre, places, days], i) => ({
    userId: uid(i + 1),
    rowId: uid(100 + i),
    name,
    cadre: cadre as Cadre,
    places,
    licence:
      cadre === "store_keeper"
        ? null
        : {
            body: (cadre === "pharmacist" ? "PSU" : "AHPC") as "PSU" | "AHPC",
            number: `T/${i}`,
            expiresOn: addDays(now.date, days),
          },
    avatarPath: null,
    phone: i % 2 ? "0772000000" : null,
    photo: null,
  }));
  let duties: { userId: string; placeId: string; date: string; shift: "day" | "night" | "call" }[] =
    [];
  for (let w = -4; w <= 1; w++) {
    const f = fillGaps(
      duties,
      { people, leaves: [], params: ROSTER_DEFAULTS },
      addDays(start, w * 7),
      addDays(start, -35),
      PLACES,
    );
    if (!f.over) duties = [...duties, ...f.added];
  }
  // Leave gaps on Saturday so the coverage line and Fill gaps have something to show.
  duties = duties.filter((d) => d.date !== addDays(start, 5) || d.placeId !== all[2]);
  const hol: RosterView["holidays"] = {};
  for (const [d, h] of holidays(Number(start.slice(0, 4)))) hol[d] = h;
  const view: RosterView = {
    ready: true,
    now,
    weekStart: start,
    range: { from: addDays(start, -28), to: addDays(start, 13) },
    params: ROSTER_DEFAULTS,
    rules: [],
    proposals: [],
    inCharge: true,
    viewerId: uid(1),
    places: PLACES,
    people,
    duties: duties.map((d, i) => ({
      ...d,
      id: `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    })),
    leaves: [
      {
        id: "l1",
        userId: uid(3),
        kind: "annual",
        from: addDays(start, 9),
        to: addDays(start, 11),
        status: "pending",
        reason: "Family",
        late: false,
        decidedBy: null,
        decidedAt: null,
        note: null,
        createdAt: new Date().toISOString(),
      },
    ],
    requests: [
      {
        id: "r1",
        fromUser: uid(5),
        toUser: uid(3),
        kind: "cover",
        give: duties.find((d) => d.userId === uid(5) && d.date > now.date) ?? {
          placeId: all[1]!,
          date: addDays(start, 8),
          shift: "day",
        },
        take: null,
        reason: "Clinic appointment",
        status: "colleague",
        events: [],
      },
    ],
    delegations: [],
    publishedWeeks: [addDays(start, -7)],
    weekPublished: false,
    attendance: [],
    reminders: { eveOn: true, eveTime: "18:00", changeOn: true, unpubOn: true, licOn: true },
    gazetted: [],
    editable: all,
    canPublish: true,
    holidays: hol,
    month: start.slice(0, 7),
    staff: [{ userId: uid(50), name: "Dispenser H" }],
  };
  const can = {
    edit: true,
    levels: true,
    review: true,
    propose: true,
    signInCharge: true,
    signSecond: true,
    request: true,
  };
  return (
    <main data-ds="tide" className="bg-background mx-auto w-full max-w-[1400px] p-4">
      <RosterTab view={view} prescribers={[]} can={can} />
    </main>
  );
}
