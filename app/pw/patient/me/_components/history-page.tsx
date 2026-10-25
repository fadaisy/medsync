import type { Section } from "@patient-core/me-health";
import { SECTION_WORDS, splitHistory } from "@patient-core/me-health";

import { PageHeader } from "@/components/tide/shell";
import { ME_COPY as C } from "@/content/patient/me";
import { PATIENT_WEB_COPY as W } from "@/content/patient/web";
import { loadCardIdentity, loadHistory } from "@/lib/patient-web/me-data";
import { countUnseenNotifications } from "@/lib/patient-web/notifications";
import { requirePatientScope } from "@/lib/patient/scope";
import { HistoryEditorView } from "./history-editor";

/**
 * My conditions, Allergies and Family history (the phone's (app)/history.tsx, ADR 0414): one page per
 * section, picked from the clinician's own catalogue. What the patient adds is theirs to change or remove;
 * their care team sees it, unconfirmed (D-PW-04), until a clinician confirms it at the next visit.
 */
export async function HistoryPage({ section }: { section: Section }) {
  const scope = await requirePatientScope();
  const [history, id, unseen] = await Promise.all([
    loadHistory(scope.userId).catch(() => ({ status: "error" as const })),
    loadCardIdentity(scope.userId).catch(() => null),
    countUnseenNotifications(scope.userId).catch(() => 0),
  ]);
  const h = splitHistory(history.status === "ready" ? history.value : []);
  const items =
    section === "conditions" ? h.conditions : section === "allergies" ? h.allergies : h.family;
  return (
    <>
      <PageHeader
        back={{ href: "/patient/me", label: C.backToMe }}
        overline={C.myHealth}
        area="me"
        title={SECTION_WORDS[section].title}
        subtitle={`${section === "family" ? C.historyIntro.family : C.historyIntro.other} ${C.historyIntro.tail}`}
        unseen={unseen}
      />
      <div className="flex max-w-2xl flex-col gap-3">
        <HistoryEditorView
          section={section}
          items={items}
          noKnownAllergies={h.noKnownAllergies}
          nkaId={
            history.status === "ready"
              ? (history.value.find((i) => i.kind === "no_known_allergies")?.id ?? null)
              : null
          }
          status={history.status}
          legacy={section === "conditions" ? (id?.conditions ?? []) : []}
          sex={id?.sex ?? null}
          whoSees={W.whoSeesHistory}
        />
      </div>
    </>
  );
}
