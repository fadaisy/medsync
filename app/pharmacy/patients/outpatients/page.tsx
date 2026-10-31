import { PageTabs } from "@/app/pharmacy/_components/page-tabs";
import { EmptyState, LatePill, Panel, Pill } from "@/components/tide/work/kit";
import { fill, PRW } from "@/content/pharmacy-rework-patients";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyTiersFor } from "@/lib/pharmacy/feature";
import { tabOf } from "@/lib/pharmacy/ia";
import { opCourse, opRefill, pillCount } from "@/lib/pharmacy/op/derive";
import { outpatientsData } from "@/lib/pharmacy/op/read";
import { CheckInButton, RefillButton } from "./_components/op-client";

export const dynamic = "force-dynamic";

const O = PRW.outpatients;
const date = (ms: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", day: "numeric", month: "short" }).format(ms);

/** Outpatients (rework PRD §6.3): chronic refills with the pill count, and antibiotic courses with check-ins. */
export default async function OutpatientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tab = tabOf("outpatients", sp.tab);
  const actor = await requirePharmacyActor();
  if (!pharmacyTiersFor(actor.hospitalId).core) return <EmptyState title={PRW.common.tierOff} />;
  const d = await outpatientsData({ userId: actor.userId, hospitalId: actor.hospitalId }, tab);
  const now = new Date().getTime();
  const who = (id: string) => d.ids.get(id);
  return (
    <div className="flex flex-col gap-4">
      <PageTabs page="outpatients" current={tab} />
      {d.tab === "refills" ? (
        !d.refills.length ? (
          <EmptyState title={O.noRefills} next={O.noRefillsNext} />
        ) : (
          <Panel>
            <ul className="divide-border flex flex-col divide-y">
              {d.refills
                .map((r) => ({ r, s: opRefill(r.hist, r.daily, now), c: pillCount(r.hist.at(-1)!, r.daily, null, now) }))
                .sort((a, b) => a.s.runOut - b.s.runOut)
                .map(({ r, s, c }) => {
                  const until = Math.round((s.runOut - now) / 86_400_000);
                  return (
                    <li key={r.rxId} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium">
                          {who(r.patientId)?.name ?? PRW.common.noName}{" "}
                          <span className="text-body-s text-muted-foreground font-normal">{who(r.patientId)?.mrn}</span>
                        </span>
                        <span className="text-body-s">
                          {r.med} · {fill(O.perDay, { n: Math.round(r.daily * 10) / 10 })}
                        </span>
                      </div>
                      <dl className="text-body-s grid grid-cols-2 gap-x-4 gap-y-0.5 tabular-nums sm:grid-cols-4">
                        <div>
                          <dt className="text-muted-foreground text-caption">{O.lastRefill}</dt>
                          <dd>{date(s.last.at)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground text-caption">{O.runsOut}</dt>
                          <dd>{date(s.runOut)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground text-caption">{O.adherence}</dt>
                          <dd>{s.lastPct == null ? "–" : `${s.lastPct}%`}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground text-caption">{O.mpr}</dt>
                          <dd>{s.mpr}%</dd>
                        </div>
                      </dl>
                      <div className="flex items-center gap-2">
                        {s.k === "overdue" ? (
                          <LatePill>{fill(O.overdue, { n: s.late })}</LatePill>
                        ) : s.k === "due" ? (
                          <Pill>{until <= 0 ? O.dueToday : fill(O.due, { n: until })}</Pill>
                        ) : (
                          <Pill tone="passed">{O.ok}</Pill>
                        )}
                        {r.pending !== undefined ? (
                          <Pill>{O.countSaved}</Pill>
                        ) : (
                          <RefillButton
                            rxId={r.rxId}
                            med={r.med}
                            since={c.since}
                            daily={r.daily}
                            expectLeft={c.expectLeft}
                            should={c.should}
                            lastQty={s.last.qty}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
            </ul>
          </Panel>
        )
      ) : d.courses === null ? (
        <EmptyState title={O.noCourses} why={O.coursesUnsigned} />
      ) : !d.courses.length ? (
        <EmptyState title={O.noCourses} next={O.noCoursesNext} />
      ) : (
        <Panel>
          <ul className="divide-border flex flex-col divide-y">
            {d.courses.map((c) => {
              const s = opCourse(c.start, c.days, c.checks, now);
              return (
                <li key={c.rxId} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">
                      {who(c.patientId)?.name ?? PRW.common.noName}{" "}
                      <span className="text-body-s text-muted-foreground font-normal">{who(c.patientId)?.mrn}</span>
                    </span>
                    <span className="text-body-s">
                      {c.med} · {s.done ? O.done : fill(O.dayOf, { n: s.dayN, total: c.days })}
                    </span>
                    <span className="text-caption text-muted-foreground">
                      {s.lastC ? fill(O.lastCheck, { when: date(s.lastC.at), status: O.status_[s.lastC.status]! }) : O.noCheck}
                      {s.missed ? ` · ${O.missedDoses} ${s.missed}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.flag ? <LatePill>{O.status_[s.lastC!.status]!}</LatePill> : null}
                    {s.needCheck ? <Pill>{O.checkDue}</Pill> : null}
                    {!s.done ? <CheckInButton rxId={c.rxId} med={c.med} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
