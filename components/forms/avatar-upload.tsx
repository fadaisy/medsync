"use client";

import { useEffect, useId, useRef, useState } from "react";
import { UserRoundIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Round photo picker (ADR 0085 §1).
 *
 * Preview order: the file just chosen → the current photo (`currentUrl`,
 * a signed URL) → a neutral person glyph. Never a stock face. The input
 * is a plain `<input type="file">` so the File rides the surrounding
 * form's FormData under `name`; the server does every real check and the
 * downscale (lib/avatars.ts).
 */
export interface AvatarUploadProps {
  name: string;
  /** Signed URL of the photo already on file, if any. */
  currentUrl?: string | null;
  /** Read by the person glyph's label — "Photo of Jane". */
  personName?: string | null;
  disabled?: boolean;
  className?: string;
}

const ACCEPT = "image/jpeg,image/png,image/webp";

export function AvatarUpload({
  name,
  currentUrl,
  personName,
  disabled,
  className,
}: AvatarUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  // Object URLs are revoked when replaced or on unmount.
  useEffect(() => {
    if (!picked) return;
    return () => URL.revokeObjectURL(picked);
  }, [picked]);

  const src = picked ?? currentUrl ?? null;

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPicked(file ? URL.createObjectURL(file) : null);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    setPicked(null);
  }

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div
        className={cn(
          "bg-muted ring-border flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1",
          disabled && "opacity-50",
        )}
      >
        {src ? (
          // Signed Storage URLs are not on next/image's allowlist.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={personName ? `Photo of ${personName}` : "Your photo"}
            className="size-full object-cover"
          />
        ) : (
          <UserRoundIcon
            aria-label="No photo yet"
            role="img"
            className="text-muted-foreground size-10"
            strokeWidth={1.5}
          />
        )}
      </div>

      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          name={name}
          accept={ACCEPT}
          capture="user"
          disabled={disabled}
          onChange={onPick}
          className="sr-only"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            aria-controls={inputId}
          >
            {src ? "Change photo" : "Add photo"}
          </Button>
          {picked ? (
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={clear}>
              Remove
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-caption leading-snug">
          JPEG or PNG, up to 8 MB. Optional.
        </p>
      </div>
    </div>
  );
}
