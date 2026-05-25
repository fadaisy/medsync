"use client";

import type { ReviewState, SignedUrlState } from "../../actions";
import type { ApprovalItem } from "./types";
import { useActionState, useEffect, useState } from "react";
import { CheckIcon, ExternalLinkIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  approveHospitalApplicationAction,
  approveStaffAffiliationAction,
  getEvidenceSignedUrlAction,
  rejectHospitalApplicationAction,
  rejectStaffAffiliationAction,
} from "../../actions";

/**
 * Detail panel for an approval item. Right-anchored Sheet that
 * shows evidence and exposes Approve / Reject in the footer with
 * inline reason capture (≥ 8 chars enforced by the Server Action).
 *
 * Pattern note: the Sheet wraps a content component that's keyed on
 * the item id. When the operator picks a different row, the content
 * fully remounts and local state (view/approve/reject mode) resets
 * naturally — no useEffect reset hooks, no stale form state.
 */

interface SheetProps {
  item: ApprovalItem | null;
  onOpenChange: (open: boolean) => void;
}

type Mode = "view" | "approve" | "reject";

export function ApprovalDetailSheet({ item, onOpenChange }: SheetProps) {
  return (
    <Sheet open={!!item} onOpenChange={onOpenChange}>
      <SheetContent widthClassName="w-full sm:max-w-[560px]">
        {item ? (
          <ApprovalDetailContent
            key={`${item.kind}-${item.id}`}
            item={item}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ApprovalDetailContent({ item, onClose }: { item: ApprovalItem; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("view");

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          <Pill tone={item.kind === "hospital" ? "admitted" : "neutral"}>
            {item.kind === "hospital" ? "Hospital application" : "Staff affiliation"}
          </Pill>
          <Pill tone="pending">Pending</Pill>
        </div>
        <SheetTitle>{item.title}</SheetTitle>
        <SheetDescription>{item.subtitle}</SheetDescription>
      </SheetHeader>

      <SheetBody>
        <EvidenceGrouped evidence={item.evidence} />

        {item.documents && item.documents.length > 0 ? (
          <section className="mt-8 flex flex-col gap-2">
            <h3 className="text-muted-foreground font-mono text-[10.5px] font-semibold tracking-[0.14em] uppercase">
              Documents
            </h3>
            <div className="flex flex-col gap-2">
              {item.documents.map((doc, i) => (
                <div
                  key={i}
                  className="border-border rounded-md border bg-gray-50 p-3 dark:bg-gray-900/40"
                >
                  <EvidenceDocLink label={doc.label} bucket={doc.bucket} path={doc.path} />
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </SheetBody>

      <SheetFooter>
        {mode === "view" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="secondary" onClick={() => setMode("reject")}>
              <XIcon className="size-3.5" />
              Reject…
            </Button>
            <Button variant="primary" onClick={() => setMode("approve")}>
              <CheckIcon className="size-3.5" />
              Approve…
            </Button>
          </>
        ) : (
          <ReasonForm
            item={item}
            mode={mode}
            onCancel={() => setMode("view")}
            onSuccess={onClose}
          />
        )}
      </SheetFooter>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────── */

function ReasonForm({
  item,
  mode,
  onCancel,
  onSuccess,
}: {
  item: ApprovalItem;
  mode: "approve" | "reject";
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const action = pickAction(item.kind, mode);
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(action, {});

  // onSuccess is a prop (parent callback), not direct local setState, so
  // calling it from an effect is the canonical "react to async result"
  // pattern with useActionState.
  useEffect(() => {
    if (state.ok) onSuccess();
  }, [state.ok, onSuccess]);

  return (
    <form action={formAction} className="flex w-full flex-col gap-3">
      <input type="hidden" name="id" value={item.id} />

      <div className="flex flex-col gap-1.5 text-left">
        <Label htmlFor="reason">
          {mode === "approve" ? "Approval note" : "Reason for rejection"}{" "}
          <span className="text-muted-foreground font-normal">(≥ 8 chars, audited)</span>
        </Label>
        <Input
          id="reason"
          name="reason"
          required
          minLength={8}
          autoFocus
          placeholder={
            mode === "approve"
              ? "e.g. Licence verified against MDC registry."
              : "e.g. Registration number does not match a current MDC record."
          }
          aria-invalid={!!state.error}
        />
        {state.error ? (
          <p role="alert" className="text-[12px] text-red-700 dark:text-red-300">
            {state.error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={mode === "reject" ? "secondary" : "primary"}
          disabled={pending}
        >
          {pending
            ? mode === "approve"
              ? "Approving…"
              : "Rejecting…"
            : mode === "approve"
              ? "Confirm approval"
              : "Confirm rejection"}
        </Button>
      </div>
    </form>
  );
}

function pickAction(kind: ApprovalItem["kind"], mode: "approve" | "reject") {
  if (kind === "staff") {
    return mode === "approve" ? approveStaffAffiliationAction : rejectStaffAffiliationAction;
  }
  return mode === "approve" ? approveHospitalApplicationAction : rejectHospitalApplicationAction;
}

/* ────────────────────────────────────────────────────────────────── */

/**
 * Renders the evidence rows grouped by their `section` field. Rows
 * with the same section land under a shared section header; rows
 * with no section are rendered ungrouped at the top.
 */
function EvidenceGrouped({
  evidence,
}: {
  evidence: ReadonlyArray<ApprovalItem["evidence"][number]>;
}) {
  const ungrouped = evidence.filter((e) => !e.section);
  const grouped = new Map<string, typeof evidence>();
  for (const row of evidence) {
    if (!row.section) continue;
    const list = (grouped.get(row.section) ?? []) as typeof evidence;
    grouped.set(row.section, [...list, row]);
  }

  return (
    <div className="flex flex-col gap-6">
      {ungrouped.length > 0 ? <EvidenceList rows={ungrouped} /> : null}
      {Array.from(grouped.entries()).map(([section, rows]) => (
        <section key={section} className="flex flex-col gap-2">
          <h3 className="text-muted-foreground font-mono text-[10.5px] font-semibold tracking-[0.14em] uppercase">
            {section}
          </h3>
          <EvidenceList rows={rows} />
        </section>
      ))}
    </div>
  );
}

function EvidenceList({ rows }: { rows: ReadonlyArray<ApprovalItem["evidence"][number]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[140px_1fr]">
      {rows.map((row, i) => (
        <div key={i} className="sm:contents">
          <dt className="text-muted-foreground text-[11.5px] font-medium">{row.label}</dt>
          <dd
            className={cn(
              "text-foreground text-[13px] wrap-break-word",
              row.mono && "font-mono tabular-nums",
              row.tone === "warning" && "text-amber-700 dark:text-amber-300",
              row.tone === "critical" && "text-red-700 dark:text-red-300",
              row.tone === "ok" && "text-emerald-700 dark:text-emerald-300",
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Evidence document opener — lazily requests a short-lived signed
 * URL when the operator clicks "Open" so the link never appears in
 * the initial server-rendered HTML.
 */
function EvidenceDocLink({
  label,
  bucket,
  path,
}: {
  label?: string;
  bucket: "clinician-licences" | "hospital-authorisations";
  path: string;
}) {
  const [state, formAction, pending] = useActionState<SignedUrlState, FormData>(
    getEvidenceSignedUrlAction,
    { ok: false, error: "" },
  );

  useEffect(() => {
    if (state.ok && state.url) {
      window.open(state.url, "_blank", "noopener,noreferrer");
    }
  }, [state]);

  return (
    <form action={formAction} className="flex items-center justify-between gap-3">
      <input type="hidden" name="bucket" value={bucket} />
      <input type="hidden" name="path" value={path} />
      <div className="flex min-w-0 flex-col">
        <span className="text-foreground text-[12.5px] font-medium">
          {label ?? "Supporting document"}
        </span>
        <span className="text-muted-foreground truncate font-mono text-[10.5px]">
          {bucket} · {path}
        </span>
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        <ExternalLinkIcon className="size-3" />
        {pending ? "Opening…" : "Open"}
      </Button>
    </form>
  );
}
