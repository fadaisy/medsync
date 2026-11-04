"use client";

import type { ReceiveDelivery } from "@/lib/pharmacy/derive/receive";
import { useEffect, useRef, useState } from "react";

import { addPhotoAction, photoUploadAction } from "@/app/pharmacy/stock/store/receive-actions";
import { RC } from "@/content/pharmacy-receive";
import { RCT } from "@/content/pharmacy-receive-count";
import { cn } from "@/lib/utils";
import { useReceive } from "../provider";
import { labelCls } from "./parts";

type Kind = ReceiveDelivery["photos"][number]["kind"];
const KINDS: Kind[] = ["note", "invoice", "damage"];
const MAX_SIDE = 1600;

/** Shrinks a camera photo on the device: about 1600 px on the long side, JPEG. Never kept as base64. */
async function compress(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(bmp.width * k));
  cv.height = Math.max(1, Math.round(bmp.height * k));
  cv.getContext("2d")?.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close();
  return new Promise((ok, no) =>
    cv.toBlob((b) => (b ? ok(b) : no(new Error("jpeg"))), "image/jpeg", 0.8),
  );
}

/** "Photos" (RECEIVE §D2): attachments on the delivery. The camera opens on phones. */
export function Photos({ d, newId }: { d: ReceiveDelivery; newId: () => string }) {
  const { online, say, refresh } = useReceive();
  const [mine, setMine] = useState<{ id: string; kind: Kind; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const urls = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const u of urls.current) URL.revokeObjectURL(u);
    },
    [],
  );

  const add = async (kind: Kind, file: File) => {
    if (!online || !navigator.onLine) return say(RCT.card.photoOffline);
    setBusy(true);
    try {
      const id = newId();
      const blob = await compress(file);
      const up = await photoUploadAction({ deliveryId: d.id, id });
      if (!up.ok) return say(up.error);
      const put = await fetch(up.signedUrl, {
        method: "PUT",
        headers: { "content-type": "image/jpeg" },
        body: blob,
      });
      if (!put.ok) return say(RC.says.photo);
      const r = await addPhotoAction({ id, deliveryId: d.id, kind, file: up.path });
      if (!r.ok) return say(r.error);
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      setMine((x) => [...x, { id, kind, url }]);
      say(RCT.card.photoAdded(RCT.card.photoKind[kind], d.note));
      refresh();
    } catch {
      say(RC.says.photo);
    } finally {
      setBusy(false);
    }
  };

  // This session's thumbnails until the server's own copy (a signed link) arrives.
  const shown = [...d.photos, ...mine.filter((m) => !d.photos.some((p) => p.id === m.id))];
  return (
    <div className="flex flex-col gap-2">
      <span className={labelCls}>{RCT.card.photos}</span>
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <label
            key={k}
            className={cn(
              "border-ink-300 bg-card text-foreground hover:bg-ink-50 has-[:focus-visible]:ring-primary/30 inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-[14px] leading-5 font-semibold has-[:focus-visible]:ring-2 sm:min-h-9 sm:text-[13px]",
              busy && "pointer-events-none opacity-60",
            )}
          >
            {RCT.card.photoPlus(RCT.card.photoKind[k])}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void add(k, f);
              }}
            />
          </label>
        ))}
      </div>
      {shown.length ? (
        <div className="flex flex-wrap gap-2">
          {shown.map((p, n) => {
            const label = RCT.card.photoKind[p.kind];
            return (
              <figure key={p.id} className="m-0 flex w-20 flex-col gap-1">
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a signed link or a blob from this device
                  <img
                    src={p.url}
                    alt={RCT.card.photoAlt(label, n + 1)}
                    className="bg-tide-sunken size-20 rounded-lg object-cover"
                  />
                ) : (
                  <span className="bg-tide-sunken size-20 rounded-lg" />
                )}
                <figcaption className="text-ink-600 text-[12px] leading-4">{label}</figcaption>
              </figure>
            );
          })}
        </div>
      ) : null}
      <p className="text-ink-600 m-0 text-[12.5px] leading-[18px]">{RCT.card.photoNote}</p>
    </div>
  );
}
