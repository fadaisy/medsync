"use client";

import { useState } from "react";
import { PaperclipIcon } from "lucide-react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/** One file sent with a booking, ready to show or play (ADR 0345, 0347). */
export interface BookingAttachment {
  id: string;
  kind: "photo" | "video" | "voice";
  /** A signed URL that expires; minted server-side for this page load. */
  url: string;
  mime: string;
  durationMs: number | null;
}

/** "2 photos · 1 voice note": what came with the booking, in words. */
export function attachmentSummary(items: ReadonlyArray<BookingAttachment>): string {
  const words: [BookingAttachment["kind"], string, string][] = [
    ["photo", "photo", "photos"],
    ["video", "video", "videos"],
    ["voice", "voice note", "voice notes"],
  ];
  return words
    .map(([kind, one, many]) => {
      const n = items.filter((a) => a.kind === kind).length;
      return n ? `${n} ${n === 1 ? one : many}` : null;
    })
    .filter(Boolean)
    .join(" · ");
}

const clock = (ms: number | null) => {
  if (ms === null) return null;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * What the patient sent with the booking, on the staff scheduling surfaces:
 * a line that says what came, and a button that opens it in the centred
 * dialog (ADR 0161) — photos at size, videos and voice notes with the
 * browser's own player. `interactive={false}` where the card sits inside a
 * button: the words only. Descriptive like the complaint (ADR 0095): nothing
 * here orders or flags a booking.
 */
export function BookingAttachments({
  items,
  interactive = true,
}: {
  items: ReadonlyArray<BookingAttachment>;
  interactive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const summary = attachmentSummary(items);
  const photos = items.filter((a) => a.kind === "photo");
  const videos = items.filter((a) => a.kind === "video");
  const voices = items.filter((a) => a.kind === "voice");

  if (!interactive) {
    return (
      <span className="text-muted-foreground text-caption inline-flex items-center gap-1">
        <PaperclipIcon className="size-3" aria-hidden />
        Sent {summary}
      </span>
    );
  }

  return (
    <EditorDialog
      width="wide"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <DialogTrigger
          render={
            <Button
              variant="link"
              size="sm"
              className="text-caption h-auto justify-start gap-1 self-start"
            />
          }
        >
          <PaperclipIcon className="size-3" aria-hidden />
          {`Sent ${summary} · View`}
        </DialogTrigger>
      }
    >
      <SheetHeader>
        <SheetTitle>What the patient sent</SheetTitle>
        <SheetDescription>
          {summary}. Sent with the booking, as the patient chose. The links expire.
        </SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-6">
        {voices.length ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-heading-s text-foreground">Voice notes</h3>
            {voices.map((v, i) => (
              <div key={v.id} className="flex flex-wrap items-center gap-3">
                <span className="text-body-s text-foreground w-28 tabular-nums">
                  {`Voice note ${i + 1}`}
                  {clock(v.durationMs) ? (
                    <span className="text-muted-foreground"> · {clock(v.durationMs)}</span>
                  ) : null}
                </span>
                <audio controls preload="metadata" src={v.url} className="h-10 min-w-0 flex-1">
                  <a href={v.url}>Download voice note {i + 1}</a>
                </audio>
              </div>
            ))}
          </section>
        ) : null}
        {photos.length ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-heading-s text-foreground">Photos</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {photos.map((p, i) => (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="border-border bg-muted block overflow-hidden rounded-lg border"
                >
                  {/* A signed Storage URL that expires: next/image would cache it past its life. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={`Photo ${i + 1} the patient sent`}
                    className="aspect-square w-full object-cover"
                  />
                </a>
              ))}
            </div>
          </section>
        ) : null}
        {videos.length ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-heading-s text-foreground">Videos</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {videos.map((v, i) => (
                <video
                  key={v.id}
                  controls
                  preload="metadata"
                  src={v.url}
                  aria-label={`Video ${i + 1} the patient sent`}
                  className="bg-muted w-full rounded-lg"
                />
              ))}
            </div>
          </section>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Close
        </Button>
      </SheetFooter>
    </EditorDialog>
  );
}
