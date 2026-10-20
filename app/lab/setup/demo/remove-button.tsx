"use client";

import { useState } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LAB_DEMO_REMOVE as C } from "@/content/lab-demo";
import { LabButton } from "../../_components/v2/button";
import { Said, useAct } from "../criticals/_components/setup-forms";
import { removeDemoAction } from "./actions";

/** "Remove the demo": a centred dialog that says what goes, with counts, before anything is deleted. */
export function RemoveDemo({ footprint }: { footprint: Record<string, number> | null }) {
  const [open, setOpen] = useState(false);
  const { pending, message, act } = useAct();
  const lines = Object.entries(footprint ?? {}).filter(([k, n]) => n > 0 && C.counts[k]);
  const reason = !footprint ? C.notApplied : lines.length ? undefined : C.nothing;
  return (
    <div className="flex flex-col gap-2">
      <LabButton
        type="button"
        className="w-fit"
        onClick={() => setOpen(true)}
        disabledReason={reason}
      >
        {C.open}
      </LabButton>
      <Said message={message} />
      <EditorDialog open={open} onOpenChange={setOpen} width="medium">
        <SheetHeader>
          <SheetTitle>{C.title}</SheetTitle>
          <SheetDescription>{C.description}</SheetDescription>
        </SheetHeader>
        <SheetBody className="text-body-s flex flex-col gap-3">
          <h3 className="text-heading-s">{C.what}</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {lines.map(([k, n]) => (
              <li key={k}>{C.counts[k]!.replace("{n}", String(n))}</li>
            ))}
          </ul>
          <p className="text-muted-foreground">{C.kept}</p>
        </SheetBody>
        <SheetFooter>
          <LabButton type="button" onClick={() => setOpen(false)}>
            {C.cancel}
          </LabButton>
          <LabButton
            type="button"
            variant="primary"
            busy={pending}
            onClick={() =>
              act(async () => {
                const r = await removeDemoAction({
                  clientKey: `lab-demo-remove-${crypto.randomUUID()}`,
                });
                setOpen(false);
                return r;
              }, C.done)
            }
          >
            {pending ? C.busy : C.confirm}
          </LabButton>
        </SheetFooter>
      </EditorDialog>
    </div>
  );
}
