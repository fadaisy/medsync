"use client";

import { useState, useTransition } from "react";
import { MoreVerticalIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteReadingAction } from "../actions";

/**
 * Row-level actions for a logged reading. Removing one is destructive and
 * irreversible from the patient's side, so it sits behind an overflow menu
 * and then behind a confirm — two deliberate steps, not one stray tap on a
 * list you scroll with your thumb.
 *
 * The confirm button is `secondary`, never `emergency`: red on a MedSync
 * surface means a clinician has declared a life threat, and deleting your
 * own glucose entry is not one.
 */
export function ReadingActions({ readingId, label }: { readingId: string; label: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="iconLg" aria-label={`Options for ${label}`} />}
        >
          <MoreVerticalIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-body-s min-h-11 px-3"
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
          >
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirming} onOpenChange={(open) => setConfirming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this reading?</DialogTitle>
            <DialogDescription>
              {label} will stop showing in your tracking. Nothing else about your record changes.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-destructive ncd-reveal text-body-s">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Keep it</DialogClose>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const res = await deleteReadingAction(readingId);
                  if (res.ok) {
                    setConfirming(false);
                    return;
                  }
                  setError(res.error ?? "Couldn't remove that reading.");
                });
              }}
            >
              {pending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
