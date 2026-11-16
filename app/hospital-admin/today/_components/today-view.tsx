"use client";

import type { TodayStat, TodayTodo } from "@/lib/hospital-admin/today";
import Link from "next/link";

import { Icon, k } from "@/components/clinics-schedule/shared";
import { TODAY } from "@/content/hospital-admin/admin-nav";
import { fill } from "@/content/lab-workspace-v2";

/** Today (ADR 0521) in the Tether desk look. Every tile is neutral: a count is a workflow state, never red, amber or green. */
export function TodayView({
  date,
  stats,
  todo,
}: {
  date: string;
  stats: readonly TodayStat[];
  todo: readonly TodayTodo[];
}) {
  return (
    <div className={k("su-wrap")}>
      <div className={k("su-page")}>
        <div className={k("ahead")}>
          <div className={k("ahl")}>
            <h1>{TODAY.title}</h1>
            <span className={k("adate")}>{fill(TODAY.lead, { date })}</span>
          </div>
        </div>
        <div
          className={k("su-dst")}
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
        >
          {stats.map((s) => (
            <Link key={s.key} href={s.href} className={k("su-dsc", "mid")}>
              <span className={k("su-dsd")} aria-hidden="true" />
              <div>
                <b>{s.value}</b>
                <span>{s.label}</span>
                <small>{s.sub}</small>
              </div>
            </Link>
          ))}
        </div>
        <div className={k("su-hero")}>
          <div className={k("su-card", "su-todo")}>
            <div className={k("su-ch")}>
              <b>{TODAY.doNext}</b>
              <small>{TODAY.doNextSub}</small>
            </div>
            {todo.length ? (
              todo.map((t) => (
                <div key={t.key} className={k("su-td")}>
                  <span className={k("su-tdi")} aria-hidden="true">
                    <Icon n={t.icon} size={16} />
                  </span>
                  <span className={k("su-tdt")}>
                    <b>{t.title}</b>
                    <small>{t.sub}</small>
                  </span>
                  <Link className={k("btn", "sm")} href={t.href}>
                    {t.btn}
                  </Link>
                </div>
              ))
            ) : (
              <p className={k("su-none")}>{TODAY.none}</p>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              [TODAY.launch, "/hospital-admin/clinics?view=ready"],
              [TODAY.desk, "/reception"],
            ].map(([c, href]) => (
              <div key={String(href)} className={k("su-card")}>
                <div className={k("su-ch")}>
                  <b>{(c as readonly string[])[0]}</b>
                </div>
                <div className={k("su-sec")} style={{ padding: "14px 16px" }}>
                  <p className={k("su-note")}>{(c as readonly string[])[1]}</p>
                  <Link className={k("btn", "sm")} href={String(href)}>
                    {(c as readonly string[])[2]}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
