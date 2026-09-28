"use client";

import type { DeskPayload } from "@/components/emr/desk/model";
import type { NoteContent } from "@/lib/emr/note-rules";
import { useState } from "react";

import { ClerkingDesk } from "@/components/clerking/clerking-desk";
import {
  useCatalogue,
  useDxCatalogue,
  useExamCatalogue,
} from "@/components/clerking/use-catalogue";

/** The desk over local state: every write stays in the page (a fixture, D-SI-29). */
export function FixtureDesk({ p, step }: { p: DeskPayload; step: string }) {
  const [content, setContent] = useState<NoteContent>(p.draft!.content);
  const [current, setCurrent] = useState(step);
  const { cat } = useCatalogue(p.clerking?.catalogueUrl);
  const { cat: ecat } = useExamCatalogue(p.clerking?.exam.catalogueUrl);
  const { cat: dx, failed } = useDxCatalogue(p.clerking?.dx?.catalogueUrl);
  return (
    <div className="flex h-dvh flex-col">
      <ClerkingDesk
        p={p}
        cat={cat}
        ecat={ecat}
        dx={dx}
        dxFailed={failed}
        actor="Fixture clinician"
        content={content}
        current={current}
        save={{ tone: "neutral", text: "Saved 11:32" }}
        on={{ onContent: setContent, onSection: setCurrent }}
        loaders={{ findings: async () => [], terms: async () => [] }}
      />
    </div>
  );
}
