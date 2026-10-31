import Link from "next/link";

import { EmptyState, Panel } from "@/components/tide/work/kit";
import { COUNT } from "@/content/pharmacy-rework-daily";
import { fill } from "@/content/pharmacy-workspace-v2";
import { countProgress } from "@/lib/pharmacy/derive/count";
import { countSheet, countTab } from "@/lib/pharmacy/stores/count-sheet-read";
import { CountLine, DiffReasons, SheetActions, StartCount } from "./count-client";

const T = COUNT;
const LINK = "text-body-s text-primary font-medium underline-offset-4 hover:underline";
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Count (rework PRD §6.4): resumable blind count sheets; differences post only on the in-charge's approval. */
export async function CountTab({
  hospitalId,
  sheetId,
  userId,
  canApprove,
}: {
  hospitalId: string;
  sheetId: string | null;
  userId: string;
  canApprove: boolean;
}) {
  if (sheetId) {
    const data = await countSheet(hospitalId, sheetId);
    if (data) return <Sheet data={data} userId={userId} canApprove={canApprove} />;
  }
  const { sheets, places } = await countTab(hospitalId);
  const open = sheets.filter((s) => s.status === "counting" || s.status === "approval");
  return (
    <div className="flex flex-col gap-4">
      <div>
        <StartCount places={places} today={day.format(new Date())} />
      </div>
      <Panel title={T.open}>
        {open.length ? (
          <ul className="divide-ink-200 flex flex-col divide-y">
            {open.map((s) => (
              <li
                key={s.id}
                className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  <span className="font-semibold">{s.label}</span>{" "}
                  <span className="text-body-s text-ink-600">· {T.status[s.status]}</span>
                </span>
                <Link className={LINK} href={`/pharmacy/stock/store?tab=count&count=${s.id}`}>
                  {s.status === "counting" ? T.continue : T.review}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={T.none} />
        )}
      </Panel>
    </div>
  );
}

function Sheet({
  data,
  userId,
  canApprove,
}: {
  data: NonNullable<Awaited<ReturnType<typeof countSheet>>>;
  userId: string;
  canApprove: boolean;
}) {
  const { sheet, lines, blockers, diffs } = data;
  const counting = sheet.status === "counting";
  const p = countProgress(lines);
  return (
    <div className="flex flex-col gap-4">
      <Link className={LINK} href="/pharmacy/stock/store?tab=count">
        {T.back}
      </Link>
      <Panel
        title={sheet.label}
        note={`${T.status[sheet.status]} · ${fill(T.progress, { done: p.done, total: p.total })}`}
      >
        <ul className="divide-ink-200 flex flex-col divide-y">
          {lines.map((l) => (
            <CountLine key={l.batchId} sheetId={sheet.id} line={l} editable={counting} />
          ))}
        </ul>
      </Panel>
      {counting && diffs.length ? (
        <DiffReasons sheetId={sheet.id} lines={lines} diffs={diffs} />
      ) : null}
      <SheetActions
        sheetId={sheet.id}
        status={sheet.status}
        blockers={blockers}
        mayApprove={canApprove && sheet.createdBy !== userId}
      />
    </div>
  );
}
