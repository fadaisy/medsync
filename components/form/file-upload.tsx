"use client";

import * as React from "react";
import { FileTextIcon, ImageIcon, UploadCloudIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * FileUpload — drag/drop + click to browse, with optional client-side
 * validation (accept, max size, max count).
 *
 * Used in onboarding for: clinical license certificate (PDF/JPG/PNG),
 * national ID photo, hospital registration certificate.
 *
 * Caller is responsible for actually uploading the bytes. This
 * component manages the picked-file state and tells you which files
 * the user has chosen via onFilesChange.
 *
 * Accessibility: real <input type="file"> hidden behind a labelled
 * drop region. Keyboard users press Enter/Space on the drop region or
 * tab to the input directly.
 */

export interface PickedFile {
  id: string;
  file: File;
  /** Object URL for image previews. Caller revokes on unmount. */
  previewUrl?: string;
}

interface FileUploadProps {
  id?: string;
  name?: string;
  /** Comma-separated accept, e.g. ".pdf,image/jpeg,image/png" */
  accept?: string;
  multiple?: boolean;
  /** Max file size in bytes. */
  maxSize?: number;
  /** Max number of files (only meaningful when multiple=true). */
  maxFiles?: number;
  disabled?: boolean;
  required?: boolean;
  value: PickedFile[];
  onFilesChange: (files: PickedFile[]) => void;
  onReject?: (reason: string, file: File) => void;
  /** Help line shown under the drop region. */
  hint?: string;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(file: File) {
  if (file.type.startsWith("image/")) {
    return <ImageIcon className="size-4" strokeWidth={1.75} />;
  }
  return <FileTextIcon className="size-4" strokeWidth={1.75} />;
}

function matchesAccept(file: File, accept?: string) {
  if (!accept) return true;
  const tokens = accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith(".")) return name.endsWith(token);
    if (token.endsWith("/*")) return mime.startsWith(token.slice(0, -1));
    return mime === token;
  });
}

export function FileUpload({
  id,
  name,
  accept,
  multiple = false,
  maxSize,
  maxFiles,
  disabled,
  required,
  value,
  onFilesChange,
  onReject,
  hint,
  className,
  ...ariaProps
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const idCounter = React.useRef(0);

  function makePicked(file: File): PickedFile {
    idCounter.current += 1;
    const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
    return { id: `${Date.now()}-${idCounter.current}`, file, previewUrl };
  }

  React.useEffect(() => {
    return () => {
      for (const picked of value) {
        if (picked.previewUrl) URL.revokeObjectURL(picked.previewUrl);
      }
    };
    // Intentionally only on unmount; runtime URL revocation on removal
    // is handled in removeAt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ingest(files: FileList | File[]) {
    const incoming = Array.from(files);
    const accepted: PickedFile[] = [];

    for (const file of incoming) {
      if (maxSize != null && file.size > maxSize) {
        onReject?.(`File is larger than ${formatBytes(maxSize)}`, file);
        continue;
      }
      if (!matchesAccept(file, accept)) {
        onReject?.("File type not allowed", file);
        continue;
      }
      accepted.push(makePicked(file));
    }

    if (accepted.length === 0) return;

    let next: PickedFile[];
    if (multiple) {
      next = [...value, ...accepted];
      if (maxFiles != null && next.length > maxFiles) {
        // Trim from the new end, revoke their URLs.
        const trimmed = next.slice(0, maxFiles);
        for (const dropped of next.slice(maxFiles)) {
          if (dropped.previewUrl) URL.revokeObjectURL(dropped.previewUrl);
          onReject?.(`Only ${maxFiles} file${maxFiles === 1 ? "" : "s"} allowed`, dropped.file);
        }
        next = trimmed;
      }
    } else {
      // Single-file mode: replace existing.
      for (const old of value) {
        if (old.previewUrl) URL.revokeObjectURL(old.previewUrl);
      }
      const first = accepted[0];
      next = first ? [first] : [];
    }

    onFilesChange(next);
  }

  function removeAt(index: number) {
    const removed = value[index];
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    const next = value.filter((_, i) => i !== index);
    onFilesChange(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  function openPicker() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (disabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (disabled) return;
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) ingest(e.dataTransfer.files);
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaProps["aria-label"] ?? "Upload files"}
        aria-describedby={ariaProps["aria-describedby"]}
        aria-disabled={disabled}
        onClick={openPicker}
        onKeyDown={onKeyDown}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500",
          isDragging
            ? "border-teal-500 bg-teal-50/60 dark:bg-teal-500/5"
            : "border-border bg-muted/30 hover:border-gray-300 dark:hover:border-gray-700",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex size-9 items-center justify-center rounded-full",
            isDragging ? "bg-teal-500 text-white" : "bg-card text-muted-foreground",
          )}
        >
          <UploadCloudIcon className="size-4" strokeWidth={1.75} />
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-foreground text-[13px] font-medium">
            {isDragging ? "Drop to upload" : "Click to upload, or drag and drop"}
          </span>
          {hint ? <span className="text-muted-foreground text-[11px]">{hint}</span> : null}
        </div>
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          required={required && value.length === 0}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              ingest(e.target.files);
            }
          }}
        />
      </div>

      {value.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {value.map((picked, i) => (
            <li
              key={picked.id}
              className="border-border bg-card flex items-center gap-2.5 rounded-md border px-2.5 py-2"
            >
              {picked.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={picked.previewUrl}
                  alt=""
                  className="size-8 shrink-0 rounded object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded"
                >
                  {fileIcon(picked.file)}
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-foreground truncate text-[12px] font-medium">
                  {picked.file.name}
                </span>
                <span className="text-muted-foreground text-[11px]">
                  {formatBytes(picked.file.size)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={`Remove ${picked.file.name}`}
                className="text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
              >
                <XIcon className="size-3.5" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
