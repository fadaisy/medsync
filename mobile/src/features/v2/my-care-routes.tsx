/**
 * Care mode routes, part 2 (Step 8), behind `careMode`: My care, Messages, Wellness and the
 * v2 danger flow. They load the patient's own rows and hand them to the props-driven screens in `my-care.tsx`.
 */
import type { CareMessage, MyCareData } from "@/data/my-care";
import type { DangerKind, FlowStep } from "@patient-core/danger-flow";
import type { ReadingInput } from "@patient-core/readings";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { CARE_V2_COPY } from "@content/patient-app/care";
import { nextStep, startFlow } from "@patient-core/danger-flow";
import { checksThisYear, teamCards } from "@patient-core/my-care";

import { loadCare } from "@/data/care-v2";
import { loadMyCare, sendCareMessage } from "@/data/my-care";
import { readingsRepo } from "@/data/readings";
import { useNow } from "@/lib/use-now";
import { newId } from "@/offline/outbox";

import { DangerFlowV2, helpInPageFor, MessagesV2, MyCareV2, WellnessV2 } from "./my-care";

function useMyCare() {
  const [data, setData] = useState<MyCareData | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const care = await loadCare();
      const mine = care ? await loadMyCare(care.enrolmentId) : null;
      if (live) setData(mine);
    })();
    return () => {
      live = false;
    };
  }, []);
  return [data, setData] as const;
}

export function MyCareBody() {
  const router = useRouter();
  const now = useNow();
  const [data] = useMyCare();
  if (!data) return null;
  const lastMine = data.messages.filter((m) => m.fromPatient).at(-1)?.atIso ?? "";
  const unread = data.messages.filter((m) => !m.fromPatient && m.kind !== "auto_reply" && m.atIso > lastMine).length;
  return (
    <MyCareV2
      team={teamCards(data.team, data.names)}
      // Done dates arrive with the results link (a later slice): until then every check reads Due, never Done.
      checks={checksThisYear(data.intervals, new Map(), now)}
      unread={unread}
      onBook={() => router.push("/book")}
      onMessages={() => router.push("/care/messages")}
    />
  );
}

export function MessagesBody() {
  const router = useRouter();
  const [data, setData] = useMyCare();
  if (!data) return null;
  const onSend = async (body: string) => {
    const mine: CareMessage = { id: newId(), fromPatient: true, kind: "text", body, atIso: new Date().toISOString() };
    setData((d) => (d ? { ...d, messages: [...d.messages, mine] } : d));
    const r = await sendCareMessage(body, mine.id);
    setData((d) =>
      d
        ? {
            ...d,
            messages:
              r === "failed"
                ? d.messages.filter((m) => m.id !== mine.id)
                : d.messages.map((m) => (m.id === mine.id ? { ...m, queued: r === "queued" } : m)),
          }
        : d,
    );
  };
  return <MessagesV2 messages={data.messages} onSend={(b) => void onSend(b)} onHelp={() => router.push("/help")} />;
}

export function WellnessBody() {
  const router = useRouter();
  return (
    <WellnessV2
      onOpen={(w) => router.push(w === "move" ? "/care/activity" : w === "mood" ? "/mood" : { pathname: "/care/activity", params: { tab: "eat" } })}
    />
  );
}

/**
 * The v2 danger flow, from the reading that opened it. Each recheck is saved the usual way (care mode: the team
 * is told when online, S19); the flow itself needs no network.
 */
export function DangerFlowBody({
  kind,
  onHelpInPage,
}: {
  kind: DangerKind;
  /** Told whether this step draws its own red Help (`helpInPageFor`), so the screen can hide its header one. */
  onHelpInPage?: (inPage: boolean) => void;
}) {
  const router = useRouter();
  const now = useNow(1000);
  const [step, setStep] = useState<FlowStep>(() => startFlow(kind));
  const [teamNote, setTeamNote] = useState<string | null>(null);
  const inPage = helpInPageFor(step);
  useEffect(() => {
    onHelpInPage?.(inPage);
  }, [inPage, onHelpInPage]);
  return (
    <DangerFlowV2
      step={step}
      now={now}
      onNext={() => setStep((s) => nextStep(s, { type: "next", now: new Date() }))}
      onWarningSign={() => setStep((s) => nextStep(s, { type: "warning_sign" }))}
      onHelp={() => router.push("/help")}
      onDone={() => router.replace("/care")}
      teamNote={teamNote}
      onReading={(a, b) => {
        const input: ReadingInput =
          step.flow === "very_high_bp" ? { kind: "bp", top: a, bottom: b } : { kind: "sugar", value: a, context: "random" };
        setStep((s) => nextStep(s, { type: "reading", input }));
        void readingsRepo.save(input, { entry: "page", taps: 0 }).then((r) => {
          if (r !== "failed") setTeamNote(CARE_V2_COPY.danger.teamTold);
        });
      }}
    />
  );
}
