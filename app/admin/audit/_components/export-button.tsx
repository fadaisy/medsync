"use client";

import type { AuditFiltersState } from "./filters";
import { useState, useTransition } from "react";
import { DownloadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { env } from "@/lib/env";

/**
 * Export-as-audited-action button.
 *
 * Calls the `sa-export-audit-log` Edge Function with the current
 * filter + an export reason (typed by the user). The function
 * records the export to sa_audit_log FIRST, then returns the
 * matching rows; we wrap them as CSV and trigger a browser
 * download.
 *
 * The reason input enforces the same ≥ 8 char minimum as the
 * server-side schema so the user gets immediate feedback on a
 * too-short reason.
 */
export function AuditExportButton({ currentFilters }: { currentFilters: AuditFiltersState }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runExport = () => {
    setError(null);
    if (reason.trim().length < 8) {
      setError("Reason must be at least 8 characters.");
      return;
    }
    startTransition(async () => {
      try {
        // Get the user's bearer token from a small server endpoint —
        // we can't use the cookie-bound session directly from a
        // client component, so we route through the export endpoint
        // via the same session the browser already holds.
        const res = await fetch(
          `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sa-export-audit-log`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${await getAccessToken()}`,
            },
            body: JSON.stringify({
              from: currentFilters.from || undefined,
              to: currentFilters.to || undefined,
              actor_id: currentFilters.actor || undefined,
              action: currentFilters.action || undefined,
              target_kind: currentFilters.target || undefined,
              reason,
              limit: 5000,
            }),
          },
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Edge Function ${res.status}`);
        }
        const body = (await res.json()) as { rows: AuditRow[]; request_id: string };
        const csv = rowsToCsv(body.rows);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setOpen(false);
        setReason("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Export failed.");
      }
    });
  };

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <DownloadIcon className="size-3.5" strokeWidth={2} />
        Export
      </Button>
    );
  }

  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-md border p-3">
      <label className="text-muted-foreground text-[11px] font-medium tracking-[0.01em]">
        Reason for export (recorded in audit log; ≥ 8 chars)
      </label>
      <Input
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. PDPO quarterly review"
        minLength={8}
      />
      {error ? <p className="text-destructive text-[11.5px]">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" size="sm" onClick={runExport} disabled={isPending}>
          {isPending ? "Exporting…" : "Download CSV"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

interface AuditRow {
  id: number;
  timestamp: string;
  actor_id: string;
  action: string;
  target_kind: string;
  target_id: string;
  reason: string;
  request_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

function rowsToCsv(rows: ReadonlyArray<AuditRow>): string {
  const header = [
    "id",
    "timestamp",
    "actor_id",
    "action",
    "target_kind",
    "target_id",
    "reason",
    "request_id",
    "ip_address",
    "user_agent",
  ].join(",");
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = rows.map((r) =>
    [
      r.id,
      r.timestamp,
      r.actor_id,
      r.action,
      r.target_kind,
      r.target_id,
      r.reason,
      r.request_id,
      r.ip_address,
      r.user_agent,
    ]
      .map(escape)
      .join(","),
  );
  return [header, ...lines].join("\n");
}

/**
 * Reads the Supabase session access token from the cookie via the
 * supabase-js browser client. Imported lazily so SSR doesn't fight
 * over the browser global.
 */
async function getAccessToken(): Promise<string> {
  const { createBrowserClient } = await import("@supabase/ssr");
  const sb = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? "";
}
