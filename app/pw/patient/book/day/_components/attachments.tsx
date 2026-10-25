"use client";

import type { AttachmentKind } from "@patient-core/book-attachments";
import { useEffect, useRef, useState } from "react";
import { attachmentPath, MAX_MEDIA, MAX_VOICE, storedMime } from "@patient-core/book-attachments";
import { CameraIcon, ImageIcon, MicIcon, SquareIcon, XIcon } from "lucide-react";

import { ICON } from "@/components/tide/kit";
import { DAY_COPY as D } from "@/content/patient/book";
import { recordAttachmentAction } from "@/lib/patient-web/book-actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Say it or show it, under the note on Ask for a day (the phone's features/visits/attachments.tsx): a voice
 * note (`MediaRecorder` where the browser has it, §3), photos or a short video from this device, or a photo
 * taken now (`capture`). Nothing leaves the browser until the request is made (`sendAttachments`); nothing is
 * written to browser storage (W3).
 */
export interface Attachment {
  id: string;
  kind: AttachmentKind;
  file: Blob;
  mime: string;
  durationMs: number | null;
  url: string;
}

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pw-focus";
const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function AttachmentTools({
  value,
  onAdd,
  onRemove,
}: {
  value: Attachment[];
  onAdd: (list: Attachment[]) => void;
  onRemove: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const voices = value.filter((a) => a.kind === "voice");
  const media = value.filter((a) => a.kind !== "voice");

  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  const take = (files: FileList | null) => {
    setError(null);
    const room = MAX_MEDIA - media.length;
    if (room <= 0) return setError(D.maxMedia(MAX_MEDIA));
    const list = [...(files ?? [])].slice(0, room).flatMap((f): Attachment[] => {
      const kind: AttachmentKind = f.type.startsWith("video/") ? "video" : "photo";
      const mime = storedMime(kind, f.type);
      if (!mime) return [];
      return [
        {
          id: crypto.randomUUID(),
          kind,
          file: f,
          mime,
          durationMs: null,
          url: URL.createObjectURL(f),
        },
      ];
    });
    if (list.length < Math.min(files?.length ?? 0, room)) setError(D.badType);
    if (list.length) onAdd(list);
  };

  const toggleVoice = async () => {
    setError(null);
    if (recording) return recorder.current?.stop();
    if (voices.length >= MAX_VOICE) return setError(D.maxVoice(MAX_VOICE));
    if (!("MediaRecorder" in window)) return setError(D.didntRecord);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const started = Date.now();
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const mime = storedMime("voice", rec.mimeType);
        if (!mime) return setError(D.didntRecord);
        const file = new Blob(chunks, { type: mime });
        onAdd([
          {
            id: crypto.randomUUID(),
            kind: "voice",
            file,
            mime,
            durationMs: Date.now() - started,
            url: URL.createObjectURL(file),
          },
        ]);
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch (e) {
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? D.noMic : D.didntRecord);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {recording ? (
          <Tool Icon={SquareIcon} label={D.stop} onClick={() => void toggleVoice()} on />
        ) : (
          <Tool Icon={MicIcon} label={D.voiceNote} onClick={() => void toggleVoice()} />
        )}
        <Tool Icon={ImageIcon} label={D.addPhoto} onClick={() => pickRef.current?.click()} />
        <Tool Icon={CameraIcon} label={D.camera} onClick={() => cameraRef.current?.click()} />
      </div>
      <input
        ref={pickRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
      <p className="text-pw-ink-3 text-[13px] font-medium">
        {recording ? D.recording : D.voiceHint}
      </p>
      {voices.map((v) => (
        <div key={v.id} className="bg-pw-surface-2 rounded-pw-row flex items-center gap-2 p-2">
          <audio controls src={v.url} className="h-10 min-w-0 flex-1" />
          <span className="text-[15px] font-semibold tabular-nums">{clock(v.durationMs ?? 0)}</span>
          <RemoveButton label={D.removeVoice} onClick={() => onRemove(v.id)} />
        </div>
      ))}
      {media.length ? (
        <ul className="flex flex-wrap gap-2">
          {media.map((m) => (
            <li
              key={m.id}
              className="bg-pw-surface-3 rounded-pw-row relative size-24 overflow-hidden"
            >
              {m.kind === "photo" ? (
                // A local object URL: nothing to optimise.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt="" className="size-full object-cover" />
              ) : (
                <span className="text-pw-ink-2 grid size-full place-items-center text-[13px] font-semibold">
                  {D.video}
                </span>
              )}
              <span className="absolute top-1 right-1">
                <RemoveButton
                  label={m.kind === "photo" ? D.removePhoto : D.removeVideo}
                  onClick={() => onRemove(m.id)}
                />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="text-pw-ink text-[15px] font-semibold">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Tool({
  Icon,
  label,
  onClick,
  on = false,
}: {
  Icon: typeof MicIcon;
  label: string;
  onClick: () => void;
  on?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on || undefined}
      className={cn(
        "inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-[15px] font-semibold",
        FOCUS,
        on ? "bg-pw-act text-pw-on-act" : "bg-pw-surface-3 text-pw-ink",
      )}
    >
      <Icon className="size-[18px]" {...ICON} />
      {label}
    </button>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn("bg-pw-surface grid size-12 place-items-center rounded-full", FOCUS)}
    >
      <XIcon className="size-4" {...ICON} />
    </button>
  );
}

/**
 * Send each file after the request exists, the phone's path: the private `appointment-attachments` bucket under
 * `<uploader>/<appointment>/`, then one row each under RLS. One failing does not stop the others; the count of
 * those that did not go is what the sent page says.
 */
export async function sendAttachments(
  userId: string,
  appointmentId: string,
  list: readonly Attachment[],
): Promise<{ failed: number }> {
  if (!list.length) return { failed: 0 };
  const supabase = createClient();
  let failed = 0;
  for (const a of list) {
    try {
      const path = attachmentPath(userId, appointmentId, a.mime, crypto.randomUUID());
      const up = await supabase.storage
        .from("appointment-attachments")
        .upload(path, a.file, { contentType: a.mime, upsert: false });
      if (up.error) throw up.error;
      const row = await recordAttachmentAction({
        appointmentId,
        kind: a.kind,
        storagePath: path,
        mime: a.mime,
        bytes: a.file.size,
        durationMs: a.durationMs,
      });
      if (!row.ok) throw new Error(row.error);
    } catch {
      failed++;
    }
  }
  return { failed };
}
