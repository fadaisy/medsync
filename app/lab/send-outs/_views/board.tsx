import "server-only";

import type { LabTechScope } from "@/lib/lab-tech/scope";
import type { ReferralRow } from "@/lib/lab/referral-read";
import type { NowWords } from "@/lib/lab/referral-words";
import type { BoardColumn, ReferralView } from "@/lib/lab/send-outs-board";
import type { ReactNode } from "react";
import Link from "next/link";
import { ClockIcon, TriangleAlertIcon } from "lucide-react";

import {
  EmptyState,
  Ident,
  KeyFigure,
  KeyFigureGrid,
  Panel,
  Pill,
  TwoIds,
} from "@/components/tide/work/kit";
import { FilterChips, PrimaryLink, SecondaryLink } from "@/components/tide/work/space";
import { fill } from "@/content/lab-phase-4";
import { LABWS2_SEND_OUTS as S } from "@/content/lab-workspace-v2-send-outs";
import { db } from "@/db";
import { REJECTION_REASON_TEXT } from "@/lib/emr/orders";
import { identitiesFor } from "@/lib/emr/read/results";
import { backToFile } from "@/lib/exchange/store";
import {
  loadOpenManifests,
  loadPartners,
  loadReferralEvents,
  loadReferrals,
} from "@/lib/lab/referral-read";
import { nowWords } from "@/lib/lab/referral-words";
import {
  BOARD_COLUMNS,
  boardColumn,
  byPartner,
  kampalaMonth,
  monthBounds,
  recentMonths,
  REFERRAL_VIEWS,
  referralSets,
  routeOf,
  sentToBack,
  stillToRefer,
} from "@/lib/lab/send-outs-board";
import { cn } from "@/lib/utils";
import { FileButton } from "../_components/connection-forms";
import { CallDialog, CancelDialog, LostDialog, UpdateDialog } from "../_components/referral-forms";
import { SendPanel } from "../_components/send-panel";
import { hrefWith, soLinks } from "../_lib/links";
import { loadToRefer } from "../_lib/to-refer";
import { dateWords } from "../../_lib/days";

const TERMINAL = new Set(["completed", "failed", "lost", "cancelled", "rejected"]);
const PER_COLUMN = 8;
const MONTH = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const monthWord = (m: string) => MONTH.format(new Date(`${m}-01T00:00:00Z`));

export interface BoardQuery {
  month?: string;
  partner?: string;
  view?: string;
  r?: string;
  /** `send=1`: the New manifest panel (v2). */
  send?: string;
  /** `show=table`: the referrals table instead of the columns. */
  show?: string;
}

/**
 * Referrals and the Send-outs board (Lab Phase 4 §5.1, §5.3; prompt 5.6). One read for the old /lab/referrals
 * page (`v2` false: the table) and the board (`v2` true): the month, destination and view filters as chips, the
 * key figures ("No data", never 0), five columns that are views of the referral state (no drag), and the selected
 * referral (`r=`) as a panel on the page with every action it had. Overdue is RF-5 (`overdueDays`, from
 * `overdue()`); the outbreak route keeps its amber tag and its own path.
 */
export async function ReferralsBoard({
  scope,
  q,
  v2,
  base,
  toRefer,
  exchange,
  referral = true,
  now = new Date(),
}: {
  scope: LabTechScope;
  q: BoardQuery;
  v2: boolean;
  /** This view's own URL. */
  base: string;
  /** Show the To refer column and the send panel (labOneMenu on). */
  toRefer: boolean;
  /** Electronic results waiting to be filed (labExchange on). */
  exchange: boolean;
  /** labReferral on. Off, the board is Phase 2's To refer list alone (sending is on paper). */
  referral?: boolean;
  now?: Date;
}) {
  const links = soLinks(v2);
  const month = /^\d{4}-\d{2}$/.test(q.month ?? "") ? q.month! : kampalaMonth(now);
  const view: ReferralView = REFERRAL_VIEWS.find((v) => v === q.view) ?? "all";
  const table = !v2 || q.show === "table";
  const { from, to } = monthBounds(month);
  const [rows, partners, manifests, toFile] = await db.transaction(
    async (tx) =>
      [
        referral
          ? await loadReferrals(tx, scope.hospitalId, {
              from,
              to,
              partnerId: q.partner ?? null,
              now,
            })
          : [],
        referral ? await loadPartners(tx, scope.hospitalId) : [],
        v2 && referral ? await loadOpenManifests(tx, scope.hospitalId) : [],
        exchange && referral ? await backToFile(tx, scope.hospitalId) : [],
      ] as const,
  );
  const sel = rows.find((r) => r.id === q.r) ?? null;
  const [events, ids, refer] = await Promise.all([
    sel ? db.transaction((tx) => loadReferralEvents(tx, scope.hospitalId, sel.id)) : [],
    identitiesFor(
      scope,
      rows.map((r) => r.patientUserId),
      "lab_referrals",
    ),
    v2 && toRefer ? loadToRefer(scope) : null,
  ]);

  // Key figures (§5.3's tiles, as key figures): an empty month is "No data", never 0.
  const sets = referralSets(rows, from, to);
  const empty = rows.length === 0;
  const median = sentToBack(sets.back);
  const rejectedBy = byPartner(sets.rejected);
  const at = (v: ReferralView) =>
    hrefWith(base, { month, partner: q.partner, view: v === "all" ? null : v, r: null });
  const figures = (
    <Panel>
      <KeyFigureGrid className="xl:grid-cols-5">
        <KeyFigure
          label={S.figures.sent}
          value={empty ? null : sets.sent.length}
          sub={S.figures.sentSub}
          href={at("sent")}
        />
        <KeyFigure
          label={S.figures.back}
          value={empty ? null : sets.back.length}
          sub={
            sets.sent.length
              ? fill(S.figures.backSub, {
                  pct: Math.round((sets.back.length / sets.sent.length) * 100),
                })
              : undefined
          }
          href={at("back")}
        />
        <KeyFigure
          label={S.figures.overdue}
          value={empty ? null : sets.overdue.length}
          sub={S.figures.overdueSub}
          href={at("overdue")}
        />
        <KeyFigure
          label={S.figures.median}
          value={median.median}
          unit={median.median === null ? undefined : S.figures.days}
          sub={median.byPartner.map((p) => `${p.partner} ${p.days}`).join(" · ") || undefined}
          href={at("back")}
        />
        <KeyFigure
          label={S.figures.rejected}
          value={empty ? null : sets.rejected.length}
          sub={rejectedBy.map((p) => `${p.partner} ${p.n}`).join(" · ") || undefined}
          href={at("rejected")}
        />
      </KeyFigureGrid>
    </Panel>
  );

  const keep = { month: q.month, partner: q.partner, view: q.view, show: q.show };
  const filters = (
    <div className="flex flex-col gap-2 print:hidden">
      <FilterChips
        label={S.filters.month}
        current={month}
        chips={[...new Set([...recentMonths(now, 6), month])].map((m) => ({
          key: m,
          label: monthWord(m),
          href: hrefWith(base, { ...keep, month: m, r: null }),
        }))}
      />
      <FilterChips
        label={S.filters.partner}
        current={q.partner ?? ""}
        chips={[{ id: "", name: S.filters.allPartners }, ...partners].map((p) => ({
          key: p.id,
          label: p.name,
          href: hrefWith(base, { ...keep, partner: p.id, r: null }),
        }))}
      />
      <FilterChips
        label={S.filters.view}
        current={view}
        chips={REFERRAL_VIEWS.map((v) => ({
          key: v,
          label: S.views[v],
          count: empty ? null : sets[v].length,
          href: hrefWith(base, { ...keep, view: v === "all" ? null : v, r: null }),
        }))}
      />
      {v2 ? (
        <FilterChips
          label={S.filters.layout}
          current={table ? "table" : "board"}
          chips={[
            { key: "board", label: S.filters.board, href: hrefWith(base, { ...keep, show: null }) },
            {
              key: "table",
              label: S.filters.table,
              href: hrefWith(base, { ...keep, show: "table" }),
            },
          ]}
        />
      ) : null}
    </div>
  );

  const shown = sets[view];
  const open = (id: string) => hrefWith(base, { ...keep, r: id, send: null });
  const files = new Set(toFile.map((b) => b.referralId));
  const fileOk =
    scope.access.permissions.has("lab.refer.result") ||
    scope.access.permissions.has("lab.result.enter");

  return (
    <div className="flex flex-col gap-4">
      {referral ? filters : null}
      {referral ? figures : null}
      {v2 && q.send === "1" && refer ? (
        <Panel
          title={S.newManifestTitle}
          note={refer.canRefer ? S.newManifestNote : S.cannotRefer}
          action={
            <SecondaryLink href={hrefWith(base, { ...keep, send: null })}>{S.close}</SecondaryLink>
          }
        >
          {refer.send ? (
            <SendPanel
              rows={refer.send.rows}
              partners={refer.send.partners}
              manifests={[]}
              canRefer={refer.canRefer}
              v2
            />
          ) : (
            <EmptyState title={S.columnEmpty.to_refer} />
          )}
        </Panel>
      ) : null}
      {sel ? (
        <ReferralDetail
          sel={sel}
          events={events}
          closeHref={hrefWith(base, { ...keep, r: null })}
          resultHref={links.result(sel.id)}
          file={fileOk ? toFile.find((b) => b.referralId === sel.id)?.messageId : undefined}
        />
      ) : null}
      {table ? (
        <ReferralTable rows={shown} ids={ids} open={open} sel={sel?.id} />
      ) : (
        <Columns
          cols={columnsOf({ shown, refer, manifests, files, now })}
          ids={ids}
          open={open}
          sendHref={hrefWith(base, { ...keep, send: "1", r: null })}
          moreHref={hrefWith(base, { ...keep, show: "table" })}
          manifestHref={(id) => hrefWith(links.manifests, { m: id })}
        />
      )}
    </div>
  );
}

/* ─── the columns ─────────────────────────────────────────────────────── */

type ReferCard = NonNullable<Awaited<ReturnType<typeof loadToRefer>>["send"]>["rows"][number];
type Manifest = Awaited<ReturnType<typeof loadOpenManifests>>[number];
interface Cols {
  to_refer: ReferCard[];
  plain: Awaited<ReturnType<typeof loadToRefer>>["plain"];
  plainIds: Awaited<ReturnType<typeof loadToRefer>>["ids"] | null;
  manifests: Manifest[];
  referrals: Record<BoardColumn, (ReferralRow & { toFile: boolean })[]>;
}

function columnsOf({
  shown,
  refer,
  manifests,
  files,
  now,
}: {
  shown: ReferralRow[];
  refer: Awaited<ReturnType<typeof loadToRefer>> | null;
  manifests: Manifest[];
  files: Set<string>;
  now: Date;
}): Cols {
  const referrals = Object.fromEntries(
    BOARD_COLUMNS.map((c) => [c, [] as (ReferralRow & { toFile: boolean })[]]),
  ) as Cols["referrals"];
  for (const r of shown) {
    const toFile = files.has(r.id);
    referrals[boardColumn({ state: r.state, expected: r.expected, backToFile: toFile }, now)].push({
      ...r,
      toFile,
    });
  }
  return {
    to_refer: refer?.send?.rows.filter((r) => stillToRefer(r.states)) ?? [],
    plain: refer && !refer.send ? refer.plain : [],
    plainIds: refer && !refer.send ? refer.ids : null,
    manifests: manifests.filter((m) => m.state === "open" || m.state === "sealed"),
    referrals,
  };
}

function Columns({
  cols,
  ids,
  open,
  sendHref,
  moreHref,
  manifestHref,
}: {
  cols: Cols;
  ids: Map<string, { name: string; mrn: string }>;
  open: (id: string) => string;
  sendHref: string;
  moreHref: string;
  manifestHref: (id: string) => string;
}) {
  const count: Record<BoardColumn, number> = {
    to_refer: cols.to_refer.length + cols.plain.length,
    on_manifest: cols.manifests.length,
    out: cols.referrals.out.length,
    overdue: cols.referrals.overdue.length,
    back: cols.referrals.back.length,
  };
  const more = (n: number) =>
    n > PER_COLUMN ? (
      <Link
        href={moreHref}
        className="text-body-s text-primary px-1 underline-offset-4 hover:underline"
      >
        {fill(S.more, { n: n - PER_COLUMN })}
      </Link>
    ) : null;
  const body: Record<BoardColumn, ReactNode> = {
    to_refer: (
      <>
        {cols.to_refer.slice(0, PER_COLUMN).map((r) => (
          <Card key={r.orderId} href={sendHref}>
            <CardHead title={r.test} restricted={r.restricted} id={r.labNumber} />
            <TwoIds name={r.patientName} mrn={r.patientMrn} />
            {routeOf(r) === "outbreak" ? (
              <Pill tone="caution">{S.highRiskRoute}</Pill>
            ) : r.why === "analyser_down" ? (
              <Pill tone="caution" glyph={ClockIcon}>
                {r.whyWords}
              </Pill>
            ) : (
              <span className="text-caption text-muted-foreground">{r.whyWords}</span>
            )}
          </Card>
        ))}
        {cols.plain.slice(0, PER_COLUMN).map(({ i, d }) => {
          const who = cols.plainIds?.get(i.patientUserId);
          return (
            <Card key={i.orderId} href={`/lab/results/${i.orderId}`}>
              <CardHead title={i.test} restricted={false} id={null} />
              <TwoIds name={who?.name ?? "Name withheld"} mrn={who?.mrn ?? ""} />
              <span className="text-caption text-muted-foreground">{d?.words}</span>
            </Card>
          );
        })}
        {more(count.to_refer)}
      </>
    ),
    on_manifest: (
      <>
        {cols.manifests.slice(0, PER_COLUMN).map((m) => (
          <Card key={m.id} href={manifestHref(m.id)}>
            <Ident className="text-foreground font-semibold">{m.number}</Ident>
            <span className="text-body-s">
              {m.partner} · {m.transport}
            </span>
            <Pill>{S.manifestState[m.state] ?? S.manifestState.open}</Pill>
          </Card>
        ))}
        {cols.referrals.on_manifest.length ? (
          <span className="text-caption text-muted-foreground px-1">
            {fill(S.onTheseManifests, { n: cols.referrals.on_manifest.length })}
          </span>
        ) : null}
        {more(count.on_manifest)}
      </>
    ),
    out: referralCards(cols.referrals.out),
    overdue: referralCards(cols.referrals.overdue),
    back: referralCards(cols.referrals.back),
  };
  function referralCards(rs: (ReferralRow & { toFile: boolean })[]) {
    return (
      <>
        {rs.slice(0, PER_COLUMN).map((r) => {
          const who = ids.get(r.patientUserId);
          return (
            <Card key={r.id} href={open(r.id)}>
              <CardHead title={r.test} restricted={r.restricted} id={r.number} />
              <TwoIds name={who?.name ?? "Name withheld"} mrn={who?.mrn ?? ""} />
              <span className="text-caption text-muted-foreground">{r.partner}</span>
              <span className="flex flex-wrap gap-1.5">
                {r.toFile ? (
                  <Pill tone="lagoon">{S.electronicFileIt}</Pill>
                ) : (
                  <NowPill now={nowWords(r)} />
                )}
                {routeOf(r) === "outbreak" ? <Pill tone="caution">{S.outbreakRoute}</Pill> : null}
              </span>
              {r.expected && !TERMINAL.has(r.state) ? (
                <span className="text-caption text-muted-foreground">
                  {fill(S.due, { date: dateWords(r.expected) })}
                </span>
              ) : null}
            </Card>
          );
        })}
        {more(rs.length)}
      </>
    );
  }
  return (
    <div
      className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"
      aria-label={S.filters.board}
      role="list"
    >
      {BOARD_COLUMNS.map((c) => (
        <section
          key={c}
          role="listitem"
          aria-labelledby={`col-${c}`}
          className={cn(
            "rounded-tide-card flex min-w-0 flex-col gap-2 p-2",
            c === "overdue" ? "bg-status-caution-bg" : "bg-tide-sunken",
          )}
        >
          <h3
            id={`col-${c}`}
            className="text-label text-foreground flex items-center justify-between gap-2 px-1 pt-1"
          >
            {S.columns[c]}
            {c === "overdue" && count[c] > 0 ? (
              <Pill tone="caution" glyph={ClockIcon}>
                {count[c]}
              </Pill>
            ) : (
              <Pill>{count[c]}</Pill>
            )}
          </h3>
          {count[c] === 0 && !(c === "on_manifest" && cols.referrals.on_manifest.length) ? (
            <p className="text-caption text-muted-foreground px-1 pb-1">{S.columnEmpty[c]}</p>
          ) : (
            body[c]
          )}
        </section>
      ))}
    </div>
  );
}

function Card({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="bg-card shadow-tide-card rounded-tide-tile hover:bg-ink-50 focus-visible:shadow-focus flex flex-col gap-1.5 p-3 outline-none"
    >
      {children}
    </Link>
  );
}

function CardHead({
  title,
  restricted,
  id,
}: {
  title: string;
  restricted: boolean;
  id: string | null;
}) {
  return (
    <span className="flex flex-wrap items-baseline justify-between gap-x-2">
      <span className="text-body-s text-foreground font-semibold">
        {title}
        {restricted ? (
          <span className="text-caption text-muted-foreground font-normal"> · {S.restricted}</span>
        ) : null}
      </span>
      {id ? <Ident className="text-muted-foreground">{id}</Ident> : null}
    </span>
  );
}

/** "Now" as a pill: amber only for overdue, rejected and lost; passed (neutral with a check) for result back. */
function NowPill({ now }: { now: NowWords }) {
  if (now.tone === "caution")
    return (
      <Pill tone="caution" glyph={now.glyph === "clock" ? ClockIcon : TriangleAlertIcon}>
        {now.words}
      </Pill>
    );
  return <Pill tone={now.tone === "check" ? "passed" : "neutral"}>{now.words}</Pill>;
}

/* ─── the table (the old Referrals page, and the board's Table layout) ───── */

function ReferralTable({
  rows,
  ids,
  open,
  sel,
}: {
  rows: ReferralRow[];
  ids: Map<string, { name: string; mrn: string }>;
  open: (id: string) => string;
  sel?: string;
}) {
  const T = S.table;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {rows.length === 0 ? (
        <EmptyState title={S.noReferrals} why={S.noReferralsWhy} />
      ) : (
        <div className="bg-card shadow-tide-card rounded-tide-card overflow-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{T.caption}</caption>
            <thead>
              <tr className="bg-muted">
                {[T.referral, T.patient, T.test, T.to, T.sent, T.now, T.expected].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="text-ink-600 text-caption border-border h-[34px] border-b px-3 font-medium whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const who = ids.get(r.patientUserId);
                return (
                  <tr
                    key={r.id}
                    aria-current={sel === r.id ? "true" : undefined}
                    className={cn(
                      "border-ink-150 border-b last:border-b-0",
                      sel === r.id && "bg-tide-sunken",
                    )}
                  >
                    <td className="text-body-s px-3 py-2">
                      <Link href={open(r.id)} className="underline-offset-4 hover:underline">
                        <Ident>{r.number}</Ident>
                      </Link>
                    </td>
                    <td className="text-body-s px-3 py-2">
                      <TwoIds name={who?.name ?? "Name withheld"} mrn={who?.mrn ?? ""} />
                    </td>
                    <td className="text-body-s px-3 py-2">
                      {r.test}
                      {r.restricted ? (
                        <span className="text-caption text-muted-foreground">
                          {" "}
                          · {S.restricted}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-body-s px-3 py-2">{r.partner}</td>
                    <td className="text-body-s px-3 py-2 whitespace-nowrap">
                      {r.sentAt ? dateWords(r.sentAt) : T.notSent}
                    </td>
                    <td className="px-3 py-2">
                      <NowPill now={nowWords(r)} />
                    </td>
                    <td className="text-body-s px-3 py-2 whitespace-nowrap">
                      {r.expected ? dateWords(r.expected) : r.sentAt ? S.notStated : T.notSent}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-caption text-muted-foreground max-w-3xl">{T.expectedNote}</p>
    </div>
  );
}

/* ─── the selected referral ───────────────────────────────────────────── */

type Ev = Awaited<ReturnType<typeof loadReferralEvents>>[number];

function ReferralDetail({
  sel,
  events,
  closeHref,
  resultHref,
  file,
}: {
  sel: ReferralRow;
  events: Ev[];
  closeHref: string;
  resultHref: string;
  /** The waiting electronic message, when the viewer may file it. */
  file?: string;
}) {
  const D = S.detail;
  const reached = (k: string) => events.some((e) => e.applied && e.kind === k);
  const atLab = reached("received_by_lab") || reached("accepted") || reached("in_progress");
  const late = !!sel.overdueDays;
  const step = (done: boolean, isLate: boolean, label: string, when: string) => (
    <li
      className={cn(
        "text-caption flex flex-col gap-1 border-t-[3px] pt-2",
        done ? "border-tide-lagoon" : isLate ? "border-status-caution-fg" : "border-ink-150",
      )}
    >
      <b className={cn("text-body-s", isLate && "text-status-caution-fg-aa")}>
        {isLate ? <ClockIcon aria-hidden className="mr-1 inline size-3.5" /> : null}
        {label}
      </b>
      <span>{done ? when : isLate ? fill(D.late, { when }) : when}</span>
    </li>
  );
  const enter =
    sel.sentAt &&
    sel.state !== "completed" &&
    sel.state !== "lost" &&
    sel.state !== "rejected" &&
    sel.routine;
  return (
    <Panel
      title={`${sel.number} · ${sel.test}`}
      note={
        <>
          {sel.partner}
          {routeOf(sel) === "outbreak" ? ` · ${S.outbreakRoute}` : ""}
        </>
      }
      action={<SecondaryLink href={closeHref}>{S.close}</SecondaryLink>}
    >
      <ol className="grid grid-cols-5 gap-1" aria-label={D.whereItIs}>
        {step(!!sel.sentAt, false, D.sent, sel.sentAt ? dateWords(sel.sentAt) : D.notYet)}
        {step(reached("handed_over"), false, D.rider, reached("handed_over") ? D.yes : D.notYet)}
        {step(reached("at_hub"), false, D.hub, reached("at_hub") ? D.yes : D.notConfirmed)}
        {step(atLab, late, D.lab, atLab ? D.yes : D.notConfirmed)}
        {step(
          sel.state === "completed",
          late,
          D.result,
          sel.state === "completed"
            ? D.resultBack
            : sel.expected
              ? fill(S.due, { date: dateWords(sel.expected) })
              : S.notStated,
        )}
      </ol>
      {events.length === 0 ? (
        <p className="text-body-s text-muted-foreground">{D.noEvents}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((e) => (
            <li
              key={e.id}
              className={cn(
                "text-body-s grid grid-cols-[96px_minmax(0,1fr)] gap-2",
                !e.applied && "text-muted-foreground",
              )}
            >
              <span className="text-caption">{dateWords(e.eventAt)}</span>
              <span>
                {S.eventWords[e.kind] ?? S.otherEvent}
                {e.reasonCode ? `: ${REJECTION_REASON_TEXT[e.reasonCode] ?? S.otherReason}` : ""}
                {e.note ? ` · ${e.note}` : ""}
                <span className="text-caption text-muted-foreground block">
                  {e.source === "partner_message"
                    ? fill(D.fromTheirSystem, { id: e.messageId?.slice(0, 8) ?? "" })
                    : e.source === "system"
                      ? D.system
                      : `${e.who ?? D.labWho}${e.document ? ` · ${fill(D.fromDocument, { doc: S.documentWords[e.document] ?? S.documentWords.other! })}` : ""}`}
                  {!e.applied ? ` · ${D.lateNotApplied}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {enter ? <PrimaryLink href={resultHref}>{D.enterResult}</PrimaryLink> : null}
        {file ? <FileButton messageId={file} /> : null}
        {!TERMINAL.has(sel.state) ? (
          <>
            <UpdateDialog referralId={sel.id} number={sel.number} />
            <CallDialog referralId={sel.id} number={sel.number} />
            <CancelDialog referralId={sel.id} number={sel.number} />
            {sel.sentAt ? <LostDialog referralId={sel.id} number={sel.number} /> : null}
          </>
        ) : null}
      </div>
    </Panel>
  );
}
