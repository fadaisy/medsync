"use client";

import type { ComponentType } from "react";
import { useRef } from "react";
import {
  BoldIcon,
  Code2Icon,
  Heading1Icon,
  Heading2Icon,
  ItalicIcon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  Redo2Icon,
  StrikethroughIcon,
  Undo2Icon,
} from "lucide-react";

/**
 * Lightweight rich-text editor for the clerkship free-text fields. The toolbar
 * applies Markdown to a plain-text value — so what we persist stays a safe,
 * human-readable STRING (no HTML, no XSS, no schema change to the clinical
 * record). Controlled: { value, onChange }.
 */
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
  const ref = useRef<HTMLTextAreaElement>(null);
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const lastPush = useRef(0);

  function snapshot() {
    past.current.push(value);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
  }

  function setWithCaret(next: string, selStart: number, selEnd = selStart) {
    onChange(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  }

  function onType(next: string) {
    const now = Date.now();
    if (now - lastPush.current > 400) {
      snapshot();
      lastPush.current = now;
    }
    onChange(next);
  }

  function wrap(before: string, after = before) {
    const el = ref.current;
    if (!el) return;
    snapshot();
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const sel = value.slice(s, e) || "text";
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    setWithCaret(next, s + before.length, s + before.length + sel.length);
  }

  function linePrefix(prefix: string, ordered = false) {
    const el = ref.current;
    if (!el) return;
    snapshot();
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const start = value.lastIndexOf("\n", s - 1) + 1;
    const block = value.slice(start, e) || "";
    const lines = block.length ? block.split("\n") : [""];
    const out = lines.map((ln, i) => (ordered ? `${i + 1}. ` : prefix) + ln).join("\n");
    const next = value.slice(0, start) + out + value.slice(e);
    setWithCaret(next, start, start + out.length);
  }

  function link() {
    const el = ref.current;
    if (!el) return;
    snapshot();
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const sel = value.slice(s, e) || "text";
    const ins = `[${sel}](url)`;
    const next = value.slice(0, s) + ins + value.slice(e);
    const urlAt = s + ins.lastIndexOf("url");
    setWithCaret(next, urlAt, urlAt + 3);
  }

  function undo() {
    if (!past.current.length) return;
    future.current.push(value);
    onChange(past.current.pop()!);
  }
  function redo() {
    if (!future.current.length) return;
    past.current.push(value);
    onChange(future.current.pop()!);
  }

  return (
    <div className="border-input bg-card focus-within:ring-ring/25 rounded-lg border transition-colors focus-within:border-teal-500 focus-within:ring-2">
      <div className="border-border/60 flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
        <Tool icon={BoldIcon} label="Bold" onClick={() => wrap("**")} />
        <Tool icon={ItalicIcon} label="Italic" onClick={() => wrap("_")} />
        <Tool icon={StrikethroughIcon} label="Strikethrough" onClick={() => wrap("~~")} />
        <Sep />
        <Tool icon={Heading1Icon} label="Heading 1" onClick={() => linePrefix("# ")} />
        <Tool icon={Heading2Icon} label="Heading 2" onClick={() => linePrefix("## ")} />
        <Sep />
        <Tool icon={ListIcon} label="Bulleted list" onClick={() => linePrefix("- ")} />
        <Tool icon={ListOrderedIcon} label="Numbered list" onClick={() => linePrefix("", true)} />
        <Tool icon={QuoteIcon} label="Quote" onClick={() => linePrefix("> ")} />
        <Tool icon={Link2Icon} label="Link" onClick={link} />
        <Tool icon={Code2Icon} label="Code" onClick={() => wrap("`")} />
        <div className="ml-auto flex items-center gap-0.5">
          <Tool icon={Undo2Icon} label="Undo" onClick={undo} />
          <Tool icon={Redo2Icon} label="Redo" onClick={redo} />
        </div>
      </div>
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onType(e.target.value)}
        className="text-foreground block min-h-[5rem] w-full resize-y bg-transparent px-3 py-2.5 text-[13px] leading-relaxed outline-none placeholder:text-gray-400"
      />
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
      // keep the textarea selection while clicking the toolbar
      onMouseDown={(e) => e.preventDefault()}
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
