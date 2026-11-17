"use client";

/**
 * "Set up Tether" on Today (ADR 0522): seven steps, each done only when the hospital's own records say so (read on
 * the server, best-effort: a fact that could not be read stays To do). Each step opens its page; its ? starts the
 * walkthrough that shows how. Done and To do are neutral square tags in words, never a colour on its own.
 */
import type { SetupFacts } from "@/lib/hospital-admin/guide/setup";
import Link from "next/link";

import { Icon, k } from "@/components/clinics-schedule/shared";
import { GUIDE, SETUP_TASKS } from "@/content/hospital-admin/guide";
import { fill } from "@/content/lab-workspace-v2";
import { doneCount, setupDone } from "@/lib/hospital-admin/guide/setup";
import { useGuide } from "./guide-provider";
import g from "./guide.module.css";

const S = GUIDE.setup;

export function SetupCard({ facts }: { facts: SetupFacts }) {
  const guide = useGuide();
  if (!guide || guide.setupHidden) return null;
  const done = setupDone(facts, guide.profileVisited);
  const n = doneCount(done);
  const m = SETUP_TASKS.length;
  return (
    <section className={`${k("su-card")} ${g.setup}`} data-tour="wt-setup" aria-label={S.title}>
      <div className={g.sh}>
        <div>
          <h2>{S.title}</h2>
          <small>
            {fill(S.sub, { n, m })}
            {n === m ? S.ready : ""}
          </small>
        </div>
        <span className={k("grow")} />
        <button type="button" className={k("btn", "sm")} onClick={() => guide.startWalk("menu")}>
          {S.tour}
        </button>
        <button
          type="button"
          className={k("btn", "sm", "q")}
          onClick={() => guide.setSetupHidden(true)}
        >
          {S.hide}
        </button>
      </div>
      <div className={g.sbar} aria-hidden="true">
        <i style={{ width: `${Math.round((n / m) * 100)}%` }} />
      </div>
      <ol className={g.sl}>
        {SETUP_TASKS.map(([key, title, sub, href, walk], i) => {
          const ok = done[key];
          return (
            <li key={key} className={`${g.gi} ${ok ? g.done : ""}`}>
              <Link href={href} className={g.go}>
                <span className={g.ck} aria-hidden="true">
                  {ok ? <Icon n="tick" size={14} w={3} /> : i + 1}
                </span>
                <span className={g.tx}>
                  <b>{title}</b>
                  <small>{sub}</small>
                </span>
                <span className={g.st}>{ok ? S.done : S.todo}</span>
              </Link>
              <button
                type="button"
                className={g.show}
                onClick={() => guide.startWalk(walk)}
                aria-label={fill(S.show, { item: title })}
                title={S.showTitle}
              >
                <Icon n="help" size={18} w={1.9} />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
