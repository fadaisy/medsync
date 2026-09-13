"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { AvatarUpload } from "./avatar-upload";

/** What a photo action returns — mirrors the profile form's shape. */
export type PhotoState = { ok?: boolean; error?: string };

/**
 * The "Photo" card body shared by the patient profile and the doctor
 * profile: picker + Save + one line of feedback. The page owns the
 * card chrome and the action; this owns the pending/result plumbing.
 */
export function PhotoForm({
  action,
  currentUrl,
  personName,
}: {
  action: (prev: PhotoState, formData: FormData) => Promise<PhotoState>;
  currentUrl: string | null;
  personName: string | null;
}) {
  const [state, formAction, pending] = useActionState<PhotoState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <AvatarUpload
        name="photo"
        currentUrl={currentUrl}
        personName={personName}
        disabled={pending}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save photo"}
        </Button>
        {state.error ? (
          <p role="alert" className="text-destructive text-body-s">
            {state.error}
          </p>
        ) : null}
        <span aria-live="polite" className="text-muted-foreground text-body-s">
          {state.ok ? "Saved." : ""}
        </span>
      </div>
    </form>
  );
}
