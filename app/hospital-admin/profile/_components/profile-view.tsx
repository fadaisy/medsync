"use client";

import type { EmergencySettings } from "@/lib/emergency/queries";
import Link from "next/link";

import { k } from "@/components/clinics-schedule/shared";
import { PROFILE as P } from "@/content/hospital-admin/profile-reports";
import { EmergencyCard } from "./emergency-card";
import { OutbreakCard } from "./outbreak-card";
import v from "./profile-view.module.css";

/**
 * Hospital profile (ADR 0516, phase 2) in the Tether desk look: identity, the emergency settings with the
 * facility's location, and outbreak mode. Settings, not an emergency: nothing here is red.
 */
export function ProfileView({
  identity,
  settings,
  outbreak,
}: {
  identity: { name: string; level: string; state: string; slug: string };
  settings: EmergencySettings | null;
  outbreak: { on: boolean | null; reason: string | null };
}) {
  const rows: [string, string][] = [
    [P.identity.name, identity.name],
    [P.identity.level, P.levels[identity.level] ?? identity.level],
    [P.identity.state, P.states[identity.state] ?? identity.state],
    [P.identity.slug, identity.slug],
  ];
  return (
    <div className={k("su-wrap")}>
      <div className={k("su-page")}>
        <div className={k("ahead")}>
          <div className={k("ahl")}>
            <h1>{P.title}</h1>
            <span className={k("adate")}>{P.lead}</span>
          </div>
        </div>
        <div className={v.g2}>
          <div className={v.col}>
            <div className={k("su-card")}>
              <div className={k("su-ch")}>
                <b>{P.identity.title}</b>
                <small>{P.identity.sub}</small>
              </div>
              <div className={`${k("su-sec")} ${v.pad}`}>
                <div className={`${k("su-sum2")} ${v.sum}`}>
                  {rows.map(([term, value]) => (
                    <div key={term}>
                      <span>{term}</span>
                      <b>{value}</b>
                    </div>
                  ))}
                </div>
                <p className={k("su-note")}>{P.identity.note}</p>
                <Link
                  className={`${k("btn", "sm", "q")} ${v.start}`}
                  href="/hospital-admin/staff?tab=admins"
                >
                  {P.identity.admins}
                </Link>
              </div>
            </div>
            <OutbreakCard on={outbreak.on} reason={outbreak.reason} />
          </div>
          <EmergencyCard settings={settings} />
        </div>
      </div>
    </div>
  );
}
