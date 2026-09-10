import { useMemo, useState } from "react";

import type { LogStream } from "../engine/types.ts";
import { logTime } from "../lib/format.ts";
import { benchData } from "../store/benchData.ts";
import { useBench } from "../store/bench.ts";

/**
 * The event log. Newest first, monospace, timestamped in simulated time.
 *
 * Three streams, each with a colour and a text tag. The tag is what carries
 * the meaning; the colour only reinforces it, because colour alone is never
 * allowed to say what something is on a clinical surface.
 */

const STREAM_STYLE: Record<LogStream, { tag: string; className: string }> = {
  device: { tag: "DEV", className: "text-teal-bright" },
  clinical: { tag: "CLN", className: "text-[#e8edf5]" },
  insulin: { tag: "INS", className: "text-red-text" },
};

const FILTERS: Array<{ id: LogStream | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "device", label: "Device" },
  { id: "clinical", label: "Clinical" },
  { id: "insulin", label: "Insulin" },
];

export function EventLog() {
  useBench((s) => s.tick);
  const [filter, setFilter] = useState<LogStream | "all">("all");

  const entries = useMemo(() => {
    const all = benchData.log;
    const filtered = filter === "all" ? all : all.filter((e) => e.stream === filter);
    return filtered.slice(-300).reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, benchData.revision]);

  const exportCsv = () => {
    const header = "simulated_seconds,simulated_time,stream,code,message\n";
    const body = benchData.log
      .map((e) => {
        const message = `"${e.message.replace(/"/g, '""')}"`;
        return `${e.t},${logTime(e.t)},${e.stream},${e.code},${message}`;
      })
      .join("\n");
    const blob = new Blob([header, body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bionic-islet-bench-log.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      aria-label="Event log"
      className="flex h-full min-h-0 flex-col rounded-[var(--radius-card)] border border-edge bg-panel"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-3 py-1.5">
        <h2 className="text-heading-s">Event log</h2>
        <div className="flex items-center gap-1">
          <div role="group" aria-label="Filter the log by stream" className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={`rounded-[var(--radius-control)] border px-2 py-0.5 font-mono text-micro transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] ${
                  filter === f.id
                    ? "border-teal-bright bg-teal-bright/15 text-teal-bright"
                    : "border-edge text-muted hover:border-teal-bright hover:text-teal-bright"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-[var(--radius-control)] border border-edge px-2 py-0.5 text-micro text-muted transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] hover:border-teal-bright hover:text-teal-bright"
          >
            Export comma-separated
          </button>
        </div>
      </header>

      <ol
        aria-live="polite"
        aria-relevant="additions"
        className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5 font-mono text-micro leading-relaxed"
      >
        {entries.length === 0 ? (
          <li className="text-muted">Nothing logged yet.</li>
        ) : (
          entries.map((entry, index) => {
            const style = STREAM_STYLE[entry.stream];
            return (
              <li
                key={`${entry.t}-${entry.code}-${index}`}
                className="flex gap-2 border-b border-edge/40 py-0.5 last:border-b-0"
              >
                <span className="shrink-0 text-muted">{logTime(entry.t)}</span>
                <span
                  className={`shrink-0 ${style.className}`}
                  data-red={entry.stream === "insulin" ? "insulin" : undefined}
                >
                  {style.tag}
                </span>
                <span className="shrink-0 text-muted">{entry.code}</span>
                <span className="min-w-0 text-[#cfd8e6]">{entry.message}</span>
              </li>
            );
          })
        )}
      </ol>
    </section>
  );
}
