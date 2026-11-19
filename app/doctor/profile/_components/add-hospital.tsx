"use client";

import type { HospitalOption } from "@/app/signup/_components/staff-work";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PlusIcon, TriangleAlertIcon } from "lucide-react";
import { FormProvider, useForm, useWatch } from "react-hook-form";

import { WorkFields } from "@/app/signup/_components/staff-work";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { STAFF_COMMON } from "@/content/onboarding";
import { requestHospitalAction } from "../actions";

/**
 * "Add a hospital" on the doctor's profile (ADR 0530): the sign-up's "Where you work" fields in a
 * centred dialog. The request goes to that hospital's admin; nothing changes here until they approve.
 */
export function AddHospital({
  hospitals,
  exclude,
}: {
  hospitals: readonly HospitalOption[];
  /** Hospitals already held or waiting: not offered. */
  exclude: readonly string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const methods = useForm({
    defaultValues: { hospitalId: "", departmentId: "", employmentType: "visiting" },
  });
  const close = (o: boolean) => {
    if (pending) return;
    setOpen(o);
    if (!o) {
      methods.reset();
      setError(null);
    }
  };
  const send = methods.handleSubmit((v) =>
    start(async () => {
      const r = await requestHospitalAction(v);
      if (r.error) return setError(r.error);
      close(false);
      router.refresh();
    }),
  );
  const [hospitalId, departmentId] = useWatch({
    control: methods.control,
    name: ["hospitalId", "departmentId"],
  });
  const ready = !!hospitalId && !!departmentId;

  return (
    <>
      <Button type="button" variant="secondary" className="w-fit" onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden className="size-4" />
        Add a hospital
      </Button>
      <EditorDialog open={open} onOpenChange={close} width="medium">
        <FormProvider {...methods}>
          <form onSubmit={(e) => void send(e)} className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-col gap-1 px-6 pt-5">
              <DialogTitle>Add a hospital</DialogTitle>
              <p className="text-body-s text-muted-foreground">
                Your request goes to that hospital&rsquo;s admin, in the same post you hold now. You
                can work there once they approve it.
              </p>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
              <WorkFields
                hospitals={hospitals}
                exclude={exclude}
                departmentLabel={STAFF_COMMON.department}
              />
              {error ? (
                <p
                  role="alert"
                  className="text-body-s flex items-start gap-1.5 text-amber-800 dark:text-amber-300"
                >
                  <TriangleAlertIcon aria-hidden className="mt-[3px] size-3.5 shrink-0" />
                  {error}
                </p>
              ) : null}
            </div>
            <div className="border-border flex justify-end gap-2 border-t px-6 py-4">
              <Button type="button" variant="ghost" disabled={pending} onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!ready || pending}>
                {pending ? "Sending…" : "Send request"}
              </Button>
            </div>
          </form>
        </FormProvider>
      </EditorDialog>
    </>
  );
}
