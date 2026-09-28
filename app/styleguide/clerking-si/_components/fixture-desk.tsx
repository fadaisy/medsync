"use client";

import type { ImpressionHandlers } from "@/components/clerking/impression/impression-step";
import type { DeskDx } from "@/components/clerking/si-model";
import type { DeskPayload } from "@/components/emr/desk/model";
import type { DxPick } from "@/components/emr/desk/pickers";
import type { DxOptions } from "@/components/emr/desk/sections";
import type { NoteContent } from "@/lib/emr/note-rules";
import { useRef, useState } from "react";

import { ClerkingDesk } from "@/components/clerking/clerking-desk";
import {
  useCatalogue,
  useDxCatalogue,
  useExamCatalogue,
} from "@/components/clerking/use-catalogue";

/**
 * The desk over local state: every write stays in the page (a fixture, D-SI-29). Diagnoses and
 * orders are kept here the way the server would return them, so the Impression step can be walked
 * end to end without a database.
 */
export function FixtureDesk({ p, step }: { p: DeskPayload; step: string }) {
  const [content, setContent] = useState<NoteContent>(p.draft!.content);
  const [current, setCurrent] = useState(step);
  const [diagnoses, setDiagnoses] = useState<DeskDx[]>(p.diagnoses as DeskDx[]);
  const [orders, setOrders] = useState(p.orders);
  const seq = useRef(10);
  const { cat } = useCatalogue(p.clerking?.catalogueUrl);
  const { cat: ecat } = useExamCatalogue(p.clerking?.exam.catalogueUrl);
  const { cat: dx, failed } = useDxCatalogue(p.clerking?.dx?.catalogueUrl);

  const nextId = () => `00000000-0000-4000-8000-${String(++seq.current).padStart(12, "0")}`;
  // A write makes a new version under the same logical id, as the server does.
  const revise = (logicalId: string, patch: Partial<DeskDx>) =>
    setDiagnoses((ds) =>
      ds.map((d) => ((d.logicalId ?? d.id) === logicalId ? { ...d, ...patch, id: nextId() } : d)),
    );
  const onDiagnosis = (pick: DxPick, opts: DxOptions) => {
    const id = nextId();
    const termId = "term" in pick ? pick.term.id : undefined;
    const row: DeskDx = {
      id,
      logicalId: `${id}-l`,
      display: "term" in pick ? pick.term.display : pick.typed,
      code: "term" in pick && pick.term.verified ? pick.term.icd11 : null,
      verification: opts.verification,
      rank: opts.primary ? "primary" : "secondary",
      termId,
      onProblemList: !!opts.addToProblemList,
    };
    setDiagnoses((ds) => [
      ...ds.map((d) =>
        opts.primary && d.rank === "primary" ? { ...d, rank: "secondary" as const } : d,
      ),
      row,
    ]);
  };
  const on: ImpressionHandlers & { onContent: typeof setContent; onSection: typeof setCurrent } = {
    onContent: setContent,
    onSection: setCurrent,
    onDiagnosis,
    onLeading: (row) =>
      setDiagnoses((ds) =>
        ds.map((d) =>
          (d.logicalId ?? d.id) === row.dx.logicalId
            ? {
                ...d,
                rank: "primary",
                verification: d.verification === "confirmed" ? "confirmed" : "provisional",
              }
            : d.rank === "primary"
              ? { ...d, rank: "secondary", verification: "differential" }
              : d,
        ),
      ),
    onToDifferential: (row) =>
      revise(row.dx.logicalId, { rank: "secondary", verification: "differential" }),
    onDxStatus: (row, to) =>
      revise(row.dx.logicalId, { verification: to === "final" ? "confirmed" : "provisional" }),
    onRemove: (row) =>
      setDiagnoses((ds) => ds.filter((d) => (d.logicalId ?? d.id) !== row.dx.logicalId)),
    onProblemList: (row) => revise(row.dx.logicalId, { onProblemList: true }),
    onAddToPlan: (testId, row) =>
      setOrders((os) => [
        ...os,
        {
          id: nextId(),
          display: dx?.tests[testId] ?? testId,
          statusText: "Ordered",
          at: "11:32",
          open: true,
          ...{ testId: dx?.testIds[testId], reasonConditionIds: [row.dx.versionId] },
        },
      ]),
  };

  return (
    <div className="flex h-dvh flex-col">
      <ClerkingDesk
        p={{ ...p, diagnoses, orders }}
        cat={cat}
        ecat={ecat}
        dx={dx}
        dxFailed={failed}
        actor="Fixture clinician"
        content={content}
        current={current}
        save={{ tone: "neutral", text: "Saved 11:32" }}
        on={on}
        loaders={{
          findings: async () => [],
          terms: async () => (dx ? fixtureTerms(dx) : []),
        }}
      />
    </div>
  );
}

/** The picker's terms from the catalogue's names (the fixture has no term index). */
function fixtureTerms(dx: NonNullable<ReturnType<typeof useDxCatalogue>["cat"]>) {
  return Object.entries(dx.termIds).map(([uuid, id]) => {
    const n = dx.names[id];
    return {
      id: uuid,
      display: n?.display ?? id,
      synonyms: [],
      icd11: null,
      verified: false,
      chronic: false,
      symptomLevel: false,
      restricted: !!n?.restricted,
      notifiable: false,
    };
  });
}
