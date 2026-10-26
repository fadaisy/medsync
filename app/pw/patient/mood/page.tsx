import type { Metadata } from "next";
import { lastDays, monthDays, moodsFor, yearMix } from "@patient-core/log";

import { Note } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { MOOD_COPY as M } from "@/content/patient/home";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { loadLog } from "@/lib/patient-web/day";
import { countUnseenNotifications } from "@/lib/patient-web/notifications";
import { requirePatientScope } from "@/lib/patient/scope";
import { RetryButton } from "../_components/home-bits";
import { MoodViews } from "./_components/mood-views";

export const metadata: Metadata = { title: "How you have felt" };
export const dynamic = "force-dynamic";

/**
 * How you have felt (the phone's (app)/mood.tsx): the week, the month as a calendar of faces, and the year as
 * good / okay / not well bars, from the faces picked on Home (kind 'mood' in the patient's own log).
 */
export default async function MoodPage() {
  const scope = await requirePatientScope();
  const now = new Date();
  const [rows, unseen] = await Promise.all([
    // Enough for the year view, as the phone reads it.
    loadLog(scope.userId, 400).catch(() => null),
    countUnseenNotifications(scope.userId).catch(() => 0),
  ]);
  const moods = rows?.filter((r) => r.kind === "mood") ?? [];

  return (
    <>
      <PageHeader
        back={{ href: "/patient/me", label: M.back }}
        overline={M.overline}
        area="me"
        title={M.title}
        unseen={unseen}
      />
      {!rows ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-pw-ink-2 text-[17px]">{M.failed}</p>
          <RetryButton />
        </div>
      ) : (
        <MoodViews
          week={moodsFor(moods, lastDays(now))}
          weekdays={lastDays(now).map((d) => d.getDay())}
          month={moodsFor(moods, monthDays(now))}
          year={yearMix(moods, now)}
          none={moods.length === 0}
        />
      )}
      <div className="flex max-w-2xl flex-col gap-3">
        <Note>{PATIENT_WEB_COPY.whoSeesLog}</Note>
        <Note>{M.notWellNote}</Note>
      </div>
    </>
  );
}
