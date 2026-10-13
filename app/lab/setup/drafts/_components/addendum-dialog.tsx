"use client";

import type { ResearchDrafts } from "@/lib/lab/drafts-read";
import { useState } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  draftAddendumAction,
  importResearchAction,
  signConfigAsLeadAction,
} from "@/lib/lab/catalogue-v2-actions";
import { DRAFTS } from "../_lib/copy";
import { Said, useAct } from "../../criticals/_components/setup-forms";
import { SignButton } from "./sign-button";

const C = DRAFTS.addendum;
const th = "border-border h-[34px] border-b px-3 font-medium";
const td = "px-3 py-2 align-top";

/** CC-1: the addendum's state in words; amber while it waits on someone. */
export function AddendumState({ config }: { config: ResearchDrafts["addendum"]["config"] }) {
  if (!config) return <StatusWord tone="caution">{C.state.none}</StatusWord>;
  if (config.state === "signed") return <StatusWord>{C.state.signed}</StatusWord>;
  return <StatusWord tone="caution">{C.state[config.state]}</StatusWord>;
}

/** §5.13 "Review the addendum": every new result and test, then the draft and the lead's signature. */
export function AddendumDialog({ addendum }: { addendum: ResearchDrafts["addendum"] }) {
  const [open, setOpen] = useState(false);
  const { pending, message, act } = useAct();
  const config = addendum.config;
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="min-h-11 sm:min-h-8"
      >
        {C.open}
      </Button>
      <EditorDialog open={open} onOpenChange={setOpen} width="wide">
        <SheetHeader>
          <SheetTitle>{C.title}</SheetTitle>
          <SheetDescription>{C.description}</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-6">
          <section aria-labelledby="addendum-concepts" className="flex flex-col gap-2">
            <h3 id="addendum-concepts" className="text-heading-s font-medium">
              {C.concepts} ({addendum.concepts.length})
            </h3>
            <div className="border-border overflow-auto rounded-lg border">
              <table className="text-body-s w-full border-collapse text-left">
                <thead>
                  <tr className="bg-muted text-ink-600 text-caption">
                    {C.columns.map((h) => (
                      <th key={h} scope="col" className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {addendum.concepts.map((c) => (
                    <tr key={c.id} className="border-ink-150 border-b last:border-b-0">
                      <td className={`${td} font-mono`}>{c.id}</td>
                      <td className={td}>{c.display}</td>
                      <td className={td}>{c.valueType}</td>
                      <td className={`${td} font-mono`}>{c.unit ?? "—"}</td>
                      <td className={td}>
                        {c.answers.length
                          ? c.answers.map((a, i) => (
                              <span key={a.code}>
                                {i ? ", " : ""}
                                <span className="font-mono">{a.code}</span>
                                {a.abnormal ? (
                                  <span className="text-muted-foreground"> ({C.abnormal})</span>
                                ) : null}
                              </span>
                            ))
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section aria-labelledby="addendum-tests" className="flex flex-col gap-2">
            <h3 id="addendum-tests" className="text-heading-s font-medium">
              {C.tests} ({addendum.tests.length})
            </h3>
            <div className="border-border overflow-auto rounded-lg border">
              <table className="text-body-s w-full border-collapse text-left">
                <thead>
                  <tr className="bg-muted text-ink-600 text-caption">
                    {C.testColumns.map((h) => (
                      <th key={h} scope="col" className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {addendum.tests.map((t) => (
                    <tr key={t.id} className="border-ink-150 border-b last:border-b-0">
                      <td className={`${td} font-mono`}>{t.id}</td>
                      <td className={td}>{t.display}</td>
                      <td className={`${td} font-mono`}>{t.components.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </SheetBody>
        <SheetFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
          <AddendumState config={config} />
          <div className="flex flex-col items-end gap-2">
            {!config ? (
              <>
                <Button
                  type="button"
                  onClick={() => act(() => draftAddendumAction({ hash: addendum.hash }), C.drafted)}
                  disabled={pending}
                  className="min-h-11 sm:min-h-8"
                >
                  {C.draft}
                </Button>
                <Said message={message} />
              </>
            ) : config.state === "draft" ? (
              <SignButton
                label={C.sign}
                okText={C.signed}
                authoredByMe={config.authoredByMe}
                noteLabel={C.note}
                onSign={(exceptionNote) =>
                  signConfigAsLeadAction({ configId: config.id, exceptionNote })
                }
              />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="min-h-11 sm:min-h-8"
            >
              {DRAFTS.close}
            </Button>
          </div>
        </SheetFooter>
      </EditorDialog>
    </>
  );
}

/** RI-1: one import per file per hospital. */
export function ImportButton() {
  const { pending, message, act } = useAct();
  return (
    <div className="flex flex-col gap-1">
      <div>
        <Button
          type="button"
          onClick={() => act(() => importResearchAction(), DRAFTS.import.done)}
          disabled={pending}
          className="min-h-11 sm:min-h-8"
        >
          {DRAFTS.import.button}
        </Button>
      </div>
      <Said message={message} />
    </div>
  );
}
