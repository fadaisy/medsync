"use client";

import { useState, useTransition } from "react";

import { Tag } from "@/components/medsync/tag";
import { Button } from "@/components/ui/button";
import { templateAction } from "../actions";

/** One template: its text, status in words, and the next step the viewer may take. */
export function TemplateCard(p: {
  id: string;
  title: string;
  body: string;
  status: string;
  statusLabel: string;
  version: number;
  firstApproved: boolean;
  approvedByMe: boolean;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const [body, setBody] = useState(p.body);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (raw: Record<string, unknown>, done: string) =>
    start(async () => {
      const r = await templateAction(raw);
      setMsg(r.ok ? done : r.message);
    });
  const fieldId = `tpl-${p.id}`;
  const editable = p.canEdit && p.status !== "pending_review";
  const emptySlot = !p.body && p.status === "pending_review";
  return (
    <section className="bg-card border-border flex flex-col gap-3 rounded-xl border p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-body-m font-medium">{p.title}</h2>
        <Tag hue="slate">
          {p.statusLabel}
          {p.status === "pending_review" && p.firstApproved ? " · 1 of 2 approvals" : ""}
        </Tag>
      </div>
      {emptySlot ? (
        <p className="text-body-s text-muted-foreground">Awaiting a translation written and checked by a fluent speaker. The registry does not write translations.</p>
      ) : null}
      <label htmlFor={fieldId} className="text-label">
        Message text <span className="text-muted-foreground font-normal">(version {p.version})</span>
      </label>
      <textarea
        id={fieldId}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        readOnly={!editable && !(p.canEdit && emptySlot)}
        maxLength={160}
        rows={4}
        aria-describedby={`${fieldId}-hint`}
        className="border-input focus-visible:shadow-focus rounded-lg border bg-transparent p-3 font-mono text-[13px] outline-none read-only:bg-muted"
      />
      <p id={`${fieldId}-hint`} className="text-caption text-muted-foreground">
        {body.length} of 160 characters. Placeholders: [HOSPITAL NAME], [DATE], [CLINIC PHONE].
      </p>
      <div className="flex flex-wrap gap-2">
        {p.canEdit && (editable || emptySlot) && body !== p.body ? (
          <Button variant="secondary" disabled={pending} onClick={() => act({ op: "save", id: p.id, body }, "Saved as a draft.")}>
            Save draft
          </Button>
        ) : null}
        {p.canEdit && p.status === "draft" && body === p.body && p.body ? (
          <Button variant="secondary" disabled={pending} onClick={() => act({ op: "submit", id: p.id }, "Submitted for approval.")}>
            Submit for approval
          </Button>
        ) : null}
        {p.canApprove && p.status === "pending_review" && p.body && !p.approvedByMe ? (
          <Button disabled={pending} onClick={() => act({ op: "approve", id: p.id }, p.firstApproved ? "Approved." : "First approval recorded. A second person must approve.")}>
            {p.firstApproved ? "Give second approval" : "Approve"}
          </Button>
        ) : null}
        {p.approvedByMe && p.status === "pending_review" ? <p className="text-caption text-muted-foreground">You gave the first approval. A different person must give the second.</p> : null}
      </div>
      {msg ? (
        <p role="status" className="text-body-s">
          {msg}
        </p>
      ) : null}
    </section>
  );
}
