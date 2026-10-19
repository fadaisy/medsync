import type { LabTechScope } from "@/lib/lab-tech/scope";
import Link from "next/link";

import { StatusWord } from "@/components/emr/status-word";
import { fill, LAB4 } from "@/content/lab-phase-4";
import { LABWS2 } from "@/content/lab-workspace-v2";
import { LABWS2_SEND_OUTS } from "@/content/lab-workspace-v2-send-outs";
import { db } from "@/db";
import { backToFile } from "@/lib/exchange/store";
import { loadConnections, loadExchangeTiles, loadMessages } from "@/lib/lab/exchange-read";
import { countMatchesWaiting } from "@/lib/lab/match-read";
import { loadPartners } from "@/lib/lab/referral-read";
import { kampalaToday } from "@/lib/lab/referral-words";
import {
  DeadDialog,
  EnableDialog,
  FileButton,
  PairDialog,
  RawDialog,
  RevokeDialog,
} from "../_components/connection-forms";
import { hrefWith, soLinks } from "../_lib/links";
import { KeyFigure, KeyFigureGrid, Panel } from "../../_components/v2/kit";
import { dateWords, timeWords } from "../../_lib/days";

const STATE: Record<string, string> = {
  received: "Received, not yet processed",
  unreadable: "Could not be read",
  matched: "Matched",
  waiting_match: "Waiting for a match",
  filed: "Filed",
  status_applied: "Status recorded",
  pending: "Waiting to send",
  sending: "Sending",
  retrying: "Retrying",
  delivered: "Delivered",
  dead: "Stopped trying",
  set_aside: "Set aside",
  retried_by_person: "Retried by a person",
};
const card = "bg-card shadow-tide-card rounded-tide-card text-body-s flex flex-col gap-3 p-4";

/**
 * Connections and the message queue (Lab Phase 4 §5.6, artboard 6; EX-1..EX-9, AB-6): tiles, each connection with
 * its state in words, the national connections that are not built (Step 11, GATE N), results waiting to be filed
 * and the messages. Managing is for `lab.exchange.manage`; other lab users read. No patient detail is shown
 * unless the raw view is opened with a recorded reason. Rendered by the Send-outs Connections tab and the old
 * /lab/exchange page.
 */
export async function ConnectionsView({
  scope,
  view: viewParam,
  base,
  v2,
}: {
  scope: LabTechScope;
  /** `?view=today`: all of today's messages; otherwise the ones not delivered. */
  view?: string;
  base: string;
  v2: boolean;
}) {
  const h = scope.hospitalId;
  const view = viewParam === "today" ? "today" : "open";
  const dayStart = new Date(`${kampalaToday()}T00:00:00+03:00`);
  const manage = scope.access.permissions.has("lab.exchange.manage");
  const fileOk =
    scope.access.permissions.has("lab.refer.result") ||
    scope.access.permissions.has("lab.result.enter");
  const [tiles, connections, messages, waiting, [partners, toFile]] = await Promise.all([
    loadExchangeTiles(h, dayStart),
    loadConnections(h),
    loadMessages(h, view, dayStart),
    countMatchesWaiting(h),
    db.transaction(async (tx) => [await loadPartners(tx, h), await backToFile(tx, h)] as const),
  ]);
  const connected = new Set(connections.filter((c) => c.state !== "revoked").map((c) => c.partner));
  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <KeyFigureGrid className="xl:grid-cols-4">
          <KeyFigure
            label="Delivered today"
            value={`${tiles.inToday} in · ${tiles.outToday} out`}
          />
          <KeyFigure
            label="Retrying"
            value={tiles.retrying}
            sub={
              tiles.retrying
                ? fill(LABWS2_SEND_OUTS.oldestRetry, {
                    time: timeWords(new Date(tiles.oldestRetry!)),
                  })
                : undefined
            }
          />
          <KeyFigure label="Needs a person" value={tiles.needsPerson} />
          <KeyFigure label="Waiting for a match" value={waiting} href={soLinks(v2).match} />
        </KeyFigureGrid>
      </Panel>

      <section className={card} aria-labelledby="conn-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="conn-h" className="text-heading-s">
            Connections
          </h2>
          <span className="flex flex-wrap items-center gap-3">
            {v2 ? (
              <Link
                href="/lab/setup/analysers"
                className="text-body-s text-primary underline-offset-4 hover:underline"
              >
                {LABWS2.links.analysers}
              </Link>
            ) : null}
            {manage ? (
              <PairDialog partners={partners.map((p) => ({ id: p.id, name: p.name }))} />
            ) : null}
          </span>
        </div>
        <ul className="divide-ink-150 flex flex-col divide-y">
          {connections.map((c) => {
            const heard = c.lastHeardAt ? new Date(c.lastHeardAt) : null;
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <p>
                  <b>{c.name}</b>
                  {c.partner ? ` · ${c.partner}` : c.kind === "bridge" ? " · bridge" : ""}
                  {" · "}
                  {c.state === "pairing" ? (
                    c.fingerprint ? (
                      "Paired, waiting for the fingerprint check"
                    ) : (
                      "Waiting for the machine to pair"
                    )
                  ) : c.state === "revoked" ? (
                    "Revoked"
                  ) : c.quiet ? (
                    <StatusWord tone="caution">
                      {fill(LAB4.bridgeNotHeard, {
                        name: c.name,
                        time: heard ? `${dateWords(heard)} ${timeWords(heard)}` : "pairing",
                      })}
                    </StatusWord>
                  ) : c.retryingSince ? (
                    <StatusWord tone="caution">{`Connected · retrying since ${timeWords(new Date(c.retryingSince))}`}</StatusWord>
                  ) : (
                    `Connected${heard ? ` · last heard ${`${dateWords(heard)} ${timeWords(heard)}`}` : ""}`
                  )}
                </p>
                {manage && c.state !== "revoked" ? (
                  <div className="flex flex-wrap gap-2">
                    {c.state === "pairing" && c.fingerprint ? (
                      <EnableDialog senderId={c.id} name={c.name} />
                    ) : null}
                    <RevokeDialog senderId={c.id} name={c.name} />
                  </div>
                ) : null}
              </li>
            );
          })}
          {partners
            .filter((p) => !connected.has(p.name))
            .map((p) => (
              <li key={p.id} className="py-3">
                <b>{p.name}</b> · Not connected. Results come on their report and are entered by
                hand.
              </li>
            ))}
          <li className="py-3">
            <b>Central Public Health Laboratories (NHLDS)</b> · Not connected.{" "}
            {LAB4.notConnectedCphl}
          </li>
          <li className="py-3">
            <b>National Laboratory Data Repository</b> · Not connected. {LAB4.notConnectedLdr}
          </li>
          <li className="py-3">
            <b>A-LIS</b> · Not used here. {LAB4.notUsedHereAlis}
          </li>
        </ul>
      </section>

      {toFile.length ? (
        <section className={card} aria-labelledby="file-h">
          <h2 id="file-h" className="text-heading-s">
            Results back, to file
          </h2>
          <ul className="divide-ink-150 flex flex-col divide-y">
            {toFile.map((b) => (
              <li
                key={b.messageId}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <p>
                  <Link
                    href={hrefWith(soLinks(v2).board, { r: b.referralId })}
                    className="text-primary underline underline-offset-4"
                  >
                    {b.number}
                  </Link>{" "}
                  · {b.partner} · arrived {dateWords(new Date(b.receivedAt))}
                </p>
                {fileOk ? <FileButton messageId={b.messageId} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={card} aria-labelledby="msg-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="msg-h" className="text-heading-s">
            Messages
          </h2>
          <nav aria-label="Which messages" className="flex gap-3">
            {(
              [
                ["open", "Not delivered"],
                ["today", "All today"],
              ] as const
            ).map(([v, label]) => (
              <Link
                key={v}
                href={hrefWith(base, { view: v === "open" ? null : "today" })}
                aria-current={view === v ? "page" : undefined}
                className="text-primary underline-offset-4 hover:underline aria-[current=page]:font-semibold"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        {messages.length === 0 ? (
          <p className="text-muted-foreground">
            {view === "open" ? "Everything has been delivered." : "No messages today."}
          </p>
        ) : (
          <div className="overflow-auto" tabIndex={0} role="region" aria-label="Messages table">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Messages</caption>
              <thead>
                <tr className="bg-muted">
                  {["Message", "Way", "Partner", "About", "State", "Last try", "Actions"].map(
                    (x, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="text-ink-600 text-caption border-border h-[34px] border-b px-3 font-medium"
                      >
                        {x}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => {
                  const state = m.outbox ?? m.state;
                  const stuck = state === "dead" || state === "unreadable";
                  return (
                    <tr key={m.id} className="border-ink-150 border-b align-top last:border-b-0">
                      <td className="px-3 py-2 font-mono">{m.id.slice(0, 8)}</td>
                      <td className="px-3 py-2">{m.direction === "in" ? "In" : "Out"}</td>
                      <td className="px-3 py-2">{m.sender ?? "Unknown sender"}</td>
                      <td className="px-3 py-2">{m.about}</td>
                      <td className="px-3 py-2">
                        {stuck || state === "retrying" ? (
                          <StatusWord tone="caution">{STATE[state] ?? state}</StatusWord>
                        ) : (
                          (STATE[state] ?? state)
                        )}
                        {stuck ? (
                          <span className="text-caption text-muted-foreground block">
                            Stored before it was acknowledged
                            {m.direction === "in" ? `, ${dateWords(new Date(m.receivedAt))}` : ""}.
                            Filed: nowhere.
                            {m.lastError ? ` ${m.lastError}` : ""}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{timeWords(new Date(m.at))}</td>
                      <td className="px-3 py-2">
                        {manage ? (
                          <div className="flex flex-wrap gap-2">
                            {stuck ? (
                              <>
                                <DeadDialog messageId={m.id} action="retry" />
                                <DeadDialog messageId={m.id} action="set_aside" />
                              </>
                            ) : null}
                            <RawDialog messageId={m.id} />
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
