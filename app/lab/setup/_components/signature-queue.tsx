import type { ConfigDraftRow } from "@/lib/lab/setup-hub";

import { fill } from "@/content/lab-workspace-v2";
import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import { keyWords, kindWords, secondWords, signHref } from "@/lib/lab/setup-hub";
import { cn } from "@/lib/utils";
import { EmptyState, Panel, Pill } from "@/components/tide/work/kit";
import { PrimaryLink, SecondaryLink } from "@/components/tide/work/space";
import { dateWords } from "../../_lib/days";

const Q = LABWS2_SETUP.queue;

const itemWords = (r: ConfigDraftRow) =>
  [kindWords(r.kind), keyWords(r.key), fill(Q.version, { n: r.version })]
    .filter(Boolean)
    .join(" · ");

const TH = "text-caption text-ink-600 border-border h-[34px] border-b px-3 text-left font-medium";
const TD = "text-body-s px-3 py-2 align-middle";

/** Waiting for your signature (prompt 5.8): Review and sign opens the existing page where that draft is signed. */
export function SignatureQueue({
  rows,
  highlight,
}: {
  rows: ConfigDraftRow[];
  highlight?: string;
}) {
  return (
    <Panel
      labelledBy="setup-queue"
      title={
        <span className="inline-flex items-center gap-2">
          {Q.title}
          <Pill>{rows.length}</Pill>
        </span>
      }
      note={rows.length ? Q.fresh : undefined}
    >
      {rows.length === 0 ? (
        <EmptyState compact title={Q.emptyTitle} why={Q.emptyWhy} next={Q.emptyNext} />
      ) : (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={Q.title}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  {Q.cols.item}
                </th>
                <th scope="col" className={TH}>
                  {Q.cols.changed}
                </th>
                <th scope="col" className={TH}>
                  {Q.cols.by}
                </th>
                <th scope="col" className={TH}>
                  {Q.cols.second}
                </th>
                <th scope="col" className={TH}>
                  <span className="sr-only">{Q.sign}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const item = itemWords(r);
                const Btn = i === 0 ? PrimaryLink : SecondaryLink;
                return (
                  <tr
                    key={r.id}
                    id={`sign-${r.id}`}
                    aria-current={highlight === r.id ? "true" : undefined}
                    className={cn(
                      "border-ink-150 border-b last:border-b-0",
                      highlight === r.id && "bg-tide-sunken",
                    )}
                  >
                    <td className={cn(TD, "font-semibold")}>{item}</td>
                    <td className={TD}>
                      {r.version > 1 ? fill(Q.changed, { n: r.version - 1 }) : Q.newItem}
                    </td>
                    <td className={TD}>
                      {fill(Q.by, {
                        name: r.authorName ?? Q.unknownAuthor,
                        date: dateWords(r.createdAt),
                      })}
                    </td>
                    <td className={TD}>{secondWords(r.kind)}</td>
                    <td className={cn(TD, "text-right")}>
                      <Btn href={signHref(r.kind)}>
                        {Q.sign}
                        <span className="sr-only">: {item}</span>
                      </Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** Waiting for the CSO (gate-a §1): lead-signed drafts whose second signature is the CSO's or the focal person's. */
export function CsoQueue({ rows }: { rows: ConfigDraftRow[] }) {
  return (
    <Panel labelledBy="setup-cso" title={Q.csoTitle} note={Q.csoNote}>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={Q.csoTitle}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={TH}>
                {Q.csoCols.item}
              </th>
              <th scope="col" className={TH}>
                {Q.csoCols.lead}
              </th>
              <th scope="col" className={TH}>
                {Q.csoCols.second}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-ink-150 border-b last:border-b-0">
                <td className={cn(TD, "font-semibold")}>{itemWords(r)}</td>
                <td className={TD}>
                  {fill(Q.by, {
                    name: r.leadName ?? Q.unknownAuthor,
                    date: dateWords(r.leadSignedAt ?? r.createdAt),
                  })}
                </td>
                <td className={TD}>{secondWords(r.kind)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
