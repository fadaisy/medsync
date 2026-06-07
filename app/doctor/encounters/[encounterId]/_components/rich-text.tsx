"use client";

import type { ComponentType } from "react";
import { useRef, useState } from "react";
import {
  BoldIcon,
  Heading1Icon,
  Heading2Icon,
  ItalicIcon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  Redo2Icon,
  StrikethroughIcon,
  UnderlineIcon,
  Undo2Icon,
} from "lucide-react";

/**
 * True WYSIWYG editor for the clerkship free-text fields. Bold / italic /
 * underline / etc. actually format the text (contentEditable + execCommand). On
 * every edit the DOM is re-serialised through a strict ALLOWLIST (tags rebuilt
 * from scratch, only `href` kept on links) — so what we persist is a safe HTML
 * subset (no scripts, no inline handlers, no style injection). Controlled by
 * value/onChange; the field is the only writer, so it round-trips losslessly.
 */

const ALLOWED = new Set([
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "STRIKE",
  "H1",
  "H2",
  "H3",
  "P",
  "DIV",
  "BR",
  "UL",
  "OL",
  "LI",
  "BLOCKQUOTE",
  "A",
  "CODE",
]);

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? "");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName;
  if (tag === "BR") return "<br>";
  const inner = Array.from(el.childNodes).map(serializeNode).join("");
  if (!ALLOWED.has(tag)) return inner; // unknown tag → drop wrapper, keep contents
  if (tag === "A") {
    const href = el.getAttribute("href") ?? "";
    if (/^(https?:|mailto:)/i.test(href)) {
      return `<a href="${escapeHtml(href).replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
    }
    return inner;
  }
  const t = tag.toLowerCase();
  return `<${t}>${inner}</${t}>`;
}

/** Rebuild a safe HTML string from the editor DOM. Empty content → "". */
function serialize(root: HTMLElement): string {
  if (!root.textContent?.trim()) return "";
  return Array.from(root.childNodes).map(serializeNode).join("").trim();
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const init = useRef(false);
  const [empty, setEmpty] = useState(!value?.trim());

  // Seed the editor's HTML once on mount (callback ref — no effect, no re-sync).
  function setEl(node: HTMLDivElement | null) {
    elRef.current = node;
    if (node && !init.current) {
      node.innerHTML = value || "";
      init.current = true;
    }
  }

  function emit() {
    const el = elRef.current;
    if (!el) return;
    setEmpty(!el.textContent?.trim());
    onChange(serialize(el));
  }

  function exec(cmd: string, arg?: string) {
    const el = elRef.current;
    if (!el) return;
    el.focus();
    try {
      document.execCommand("styleWithCSS", false, "false");
    } catch {
      /* older browsers */
    }
    document.execCommand(cmd, false, arg);
    emit();
  }

  function link() {
    const url = window.prompt("Link URL (https://…)");
    if (url) exec("createLink", url);
  }

  return (
    <div className="border-input bg-card focus-within:ring-ring/25 rounded-lg border transition-colors focus-within:border-teal-500 focus-within:ring-2">
      <div className="border-border/60 flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
        <Tool icon={BoldIcon} label="Bold" onClick={() => exec("bold")} />
        <Tool icon={ItalicIcon} label="Italic" onClick={() => exec("italic")} />
        <Tool icon={UnderlineIcon} label="Underline" onClick={() => exec("underline")} />
        <Tool
          icon={StrikethroughIcon}
          label="Strikethrough"
          onClick={() => exec("strikeThrough")}
        />
        <Sep />
        <Tool icon={Heading1Icon} label="Heading 1" onClick={() => exec("formatBlock", "H1")} />
        <Tool icon={Heading2Icon} label="Heading 2" onClick={() => exec("formatBlock", "H2")} />
        <Sep />
        <Tool icon={ListIcon} label="Bulleted list" onClick={() => exec("insertUnorderedList")} />
        <Tool
          icon={ListOrderedIcon}
          label="Numbered list"
          onClick={() => exec("insertOrderedList")}
        />
        <Tool icon={QuoteIcon} label="Quote" onClick={() => exec("formatBlock", "BLOCKQUOTE")} />
        <Tool icon={Link2Icon} label="Link" onClick={link} />
        <div className="ml-auto flex items-center gap-0.5">
          <Tool icon={Undo2Icon} label="Undo" onClick={() => exec("undo")} />
          <Tool icon={Redo2Icon} label="Redo" onClick={() => exec("redo")} />
        </div>
      </div>
      <div className="relative">
        {empty && placeholder ? (
          <span className="text-muted-foreground pointer-events-none absolute top-2.5 left-3 text-[13px]">
            {placeholder}
          </span>
        ) : null}
        <div
          ref={setEl}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder}
          onInput={emit}
          onBlur={emit}
          style={{ minHeight: `${rows * 1.6}rem` }}
          className="text-foreground [&_blockquote]:border-border [&_blockquote]:text-muted-foreground w-full px-3 py-2.5 text-[13px] leading-relaxed outline-none [&_a]:text-teal-600 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_h1]:text-[15px] [&_h1]:font-semibold [&_h2]:text-[14px] [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        />
      </div>
    </div>
  );
}

function Tool({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()} // keep the selection while clicking
      onClick={onClick}
      className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1.5 transition-colors"
    >
      <Icon className="size-3.5" />
    </button>
  );
}

function Sep() {
  return <span className="bg-border/70 mx-1 h-4 w-px shrink-0" aria-hidden />;
}
