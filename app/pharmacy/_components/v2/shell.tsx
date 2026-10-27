"use client";

import type { PharmacyPlace } from "@/content/pharmacy-workspace-v2";
import type { FindHit } from "@/lib/pharmacy/workspace-v2/find";
import type { PlaceTab } from "@/lib/pharmacy/workspace-v2/places";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  BoxesIcon,
  GaugeIcon,
  InboxIcon,
  PillIcon,
  SearchIcon,
  Settings2Icon,
  StethoscopeIcon,
  WarehouseIcon,
  XIcon,
} from "lucide-react";

import { EmergencyInline } from "@/components/lab/emergency-inline";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fill, PHWS2 } from "@/content/pharmacy-workspace-v2";
import { placeOf } from "@/lib/pharmacy/workspace-v2/places";
import { cn } from "@/lib/utils";
import { chooseActingPoint } from "../../actions";
import { pharmacyFindAction, pharmacyShellCountsAction } from "../../find-actions";

const S = PHWS2.shell;
const F = PHWS2.find;

const ICON: Record<PharmacyPlace, LucideIcon> = {
  today: GaugeIcon,
  window: PillIcon,
  shelf: BoxesIcon,
  store: WarehouseIcon,
  clinical: StethoscopeIcon,
  setup: Settings2Icon,
};
export const PLACE_HREF: Record<PharmacyPlace, string> = {
  today: "/pharmacy/today",
  window: "/pharmacy/window",
  shelf: "/pharmacy/shelf",
  store: "/pharmacy/store",
  clinical: "/pharmacy/clinical",
  setup: "/pharmacy/setup",
};
/** `g` then this key jumps to the place (as the lab's). */
const PLACE_KEY: Record<PharmacyPlace, string> = {
  today: "t",
  window: "w",
  shelf: "h",
  store: "s",
  clinical: "c",
  setup: "u",
};
const COUNT_WORDS: Partial<Record<PharmacyPlace, string>> = S.placeCount;

export interface ShellPoint {
  id: string;
  name: string;
  live: boolean;
}

export interface PharmacyShellPayload {
  hospitalName: string;
  userName: string;
  initials: string;
  places: PharmacyPlace[];
  tabs: PlaceTab[];
  /** Words for each tab, for Find's Pages group. */
  tabWords: Record<string, string>;
  points: ShellPoint[];
  pointId: string | null;
  showWhere: boolean;
}

/** Rail counts and the Needs you count, asked for after the page (`pharmacyShellCountsAction`). */
export interface PharmacyShellCounts {
  counts: Partial<Record<PharmacyPlace, number>>;
  needsYou: number;
}

/**
 * The pharmacy shell (GATE A §5, D-PW-03): a floating rail of six places, a top bar with the place's title, Find,
 * the acting point, Needs you and Emergency, and the page. `data-ds="tide"` switches the Tide tokens on for the
 * whole document while it is mounted (globals.css), so dialogs and popovers take them too.
 */
export function PharmacyShellV2({
  payload,
  children,
}: {
  payload: PharmacyShellPayload;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [findOpen, setFindOpen] = useState(false);
  const here = placeOf(pathname);
  const title = here === "needsYou" ? S.titles.needsYou : S.titles[here ?? "window"];
  // The counts read slow sources, so they are asked for once the page has finished streaming (so they never hold
  // its reads), and again on each move.
  const [live, setLive] = useState<PharmacyShellCounts | null>(null);
  useEffect(() => {
    let on = true;
    const ask = () =>
      void pharmacyShellCountsAction()
        .then((c) => on && setLive(c))
        .catch(() => undefined);
    if (document.readyState === "complete") ask();
    else window.addEventListener("load", ask, { once: true });
    return () => {
      on = false;
      window.removeEventListener("load", ask);
    };
  }, [pathname]);
  const needsYou = live?.needsYou ?? 0;

  // Ctrl K / Cmd K opens Find; `g` then a letter jumps to a place when focus is not in a field.
  useEffect(() => {
    let g = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) ||
        t.closest("[role=dialog]"));
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setFindOpen(true);
        return;
      }
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (g) {
        g = false;
        const p = payload.places.find((x) => PLACE_KEY[x] === e.key.toLowerCase());
        if (p) {
          e.preventDefault();
          router.push(PLACE_HREF[p]);
        }
        return;
      }
      if (e.key === "g") {
        g = true;
        if (gTimer) clearTimeout(gTimer);
        gTimer = setTimeout(() => (g = false), 1200);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payload.places, router]);

  return (
    <div
      data-ds="tide"
      className="bg-background text-foreground flex min-h-svh flex-col gap-3 p-3 font-sans text-[14px] leading-[1.45] lg:flex-row lg:gap-4 lg:p-4 print:block print:p-0"
    >
      <Rail payload={payload} counts={live?.counts ?? {}} here={here} />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 print:hidden">
          <div className="flex min-w-[12rem] flex-col gap-0.5">
            <span className="text-overline text-tide-ink-3 inline-flex items-center gap-1.5 uppercase">
              <span aria-hidden className="bg-tide-area-lab size-[7px] rounded-full" />
              {fill(S.overline, { hospital: payload.hospitalName })}
            </span>
            <h1 className="text-foreground text-[24px] leading-[28px] font-medium tracking-[-0.02em]">
              {title}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setFindOpen(true)}
            className="bg-card text-tide-ink-3 shadow-tide-card focus-visible:shadow-focus flex h-10 max-w-[560px] min-w-[14rem] flex-[1_1_320px] items-center gap-2.5 rounded-full pr-2 pl-4 text-left outline-none"
            aria-keyshortcuts="Control+K Meta+K"
          >
            <SearchIcon aria-hidden className="size-4 shrink-0" />
            <span className="text-body-s min-w-0 flex-1 truncate">{S.find}</span>
            <kbd className="bg-background text-kbd text-ink-600 rounded-md px-1.5 py-1 font-mono shadow-[inset_0_0_0_1px_var(--color-ink-300)]">
              {S.findKey}
            </kbd>
          </button>
          <span className="flex-1" />
          <PointPill payload={payload} />
          <Link
            href="/pharmacy/needs-you"
            aria-label={
              needsYou > 0 ? fill(S.needsYouCount, { n: needsYou }) : S.needsYou
            }
            aria-current={here === "needsYou" ? "page" : undefined}
            className={cn(
              "focus-visible:shadow-focus inline-flex h-9 items-center gap-2 rounded-full pr-3.5 pl-3 text-[13.5px] font-semibold whitespace-nowrap outline-none",
              needsYou > 0
                ? "bg-status-caution-bg text-amber-800 shadow-[inset_0_0_0_1px_var(--tide-caution-edge)]"
                : "bg-card text-ink-700 shadow-tide-card",
            )}
          >
            <InboxIcon aria-hidden className="size-4" />
            {S.needsYou}
            {live ? <span className="tabular-nums">{needsYou}</span> : null}
          </Link>
          <EmergencyInline label={S.emergency} />
        </header>
        {payload.showWhere ? <WhereNote /> : null}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <FindPalette
        key={findOpen ? "open" : "shut"}
        open={findOpen}
        onOpenChange={setFindOpen}
        payload={payload}
      />
    </div>
  );
}

function Rail({
  payload,
  counts,
  here,
}: {
  payload: PharmacyShellPayload;
  counts: PharmacyShellCounts["counts"];
  here: PharmacyPlace | "needsYou" | null;
}) {
  return (
    <nav
      aria-label={S.placesLabel}
      className="bg-card shadow-tide-float rounded-tide-rail flex shrink-0 gap-1 overflow-x-auto p-1.5 lg:sticky lg:top-4 lg:w-[76px] lg:flex-col lg:self-start lg:overflow-visible lg:px-1.5 lg:py-3 print:hidden"
    >
      <Link
        href="/pharmacy"
        aria-label={S.home}
        className="bg-tide-navy-900 text-tide-on-band mx-auto hidden size-11 place-items-center rounded-[14px] text-[16px] font-bold lg:mb-2 lg:grid"
      >
        {S.mark}
      </Link>
      {payload.places.map((p) => {
        const Icon = ICON[p];
        const n = counts[p];
        const on = here === p;
        const countWords = n && COUNT_WORDS[p] ? fill(COUNT_WORDS[p]!, { n }) : null;
        return (
          <Link
            key={p}
            href={PLACE_HREF[p]}
            aria-current={on ? "page" : undefined}
            aria-label={countWords ? `${S.places[p]}, ${countWords}` : undefined}
            className={cn(
              "focus-visible:shadow-focus relative flex min-h-[54px] min-w-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-[18px] px-1 pt-2 pb-3 text-center text-[12px] leading-[1.15] outline-none lg:flex-none",
              on
                ? "text-foreground font-semibold"
                : "text-tide-ink-3 hover:bg-background hover:text-foreground font-medium",
            )}
          >
            <Icon aria-hidden className="size-[21px]" strokeWidth={1.75} />
            <span>{S.places[p]}</span>
            {n ? (
              <span
                aria-hidden
                className="bg-card text-foreground absolute top-1 right-1.5 min-w-5 rounded-full px-1.5 text-[11px] leading-5 font-semibold tabular-nums shadow-[inset_0_0_0_1px_var(--color-ink-300)]"
              >
                {n}
              </span>
            ) : null}
            {on ? (
              <span
                aria-hidden
                className="bg-tide-lagoon absolute bottom-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full"
              />
            ) : null}
          </Link>
        );
      })}
      <span className="hidden flex-1 lg:block lg:min-h-6" />
      <AccountMenu payload={payload} />
    </nav>
  );
}

/** The acting point (D-PW-05): one pill naming the point and whether it is live; several points open a chooser. */
function PointPill({ payload }: { payload: PharmacyShellPayload }) {
  const [pending, start] = useTransition();
  const point = payload.points.find((p) => p.id === payload.pointId);
  if (!point) return null;
  const state = point.live ? S.pointLive : S.pointNotLive;
  const label = (
    <>
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          point.live ? "bg-tide-lagoon" : "bg-ink-400",
        )}
      />
      {fill(S.point, { point: point.name, state })}
    </>
  );
  const cls =
    "bg-card text-foreground shadow-tide-card focus-visible:shadow-focus inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13.5px] font-medium whitespace-nowrap outline-none";
  if (payload.points.length < 2) return <span className={cls}>{label}</span>;
  return (
    <Popover>
      <PopoverTrigger
        aria-label={fill(S.pointLabel, { point: point.name, state })}
        className={cn(cls, pending && "opacity-60")}
      >
        {label}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="text-overline text-tide-ink-3 uppercase">{S.pointsLabel}</p>
        <div className="mt-2 flex flex-col gap-1">
          {payload.points.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={pending}
              aria-pressed={p.id === payload.pointId}
              onClick={() => start(async () => void (await chooseActingPoint({ pointId: p.id })))}
              className={cn(
                "rounded-tide-row text-body-s flex items-center justify-between gap-2 px-3 py-2 text-left",
                p.id === payload.pointId ? "bg-tide-lagoon-tint font-semibold" : "hover:bg-muted",
              )}
            >
              <span>{p.name}</span>
              <span className="text-caption text-muted-foreground">
                {p.live ? S.pointLive : S.pointNotLive}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AccountMenu({ payload }: { payload: PharmacyShellPayload }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${S.account}: ${payload.userName}`}
        className="bg-tide-sunken text-foreground focus-visible:shadow-focus mx-auto grid size-10 shrink-0 place-items-center self-center rounded-full text-[13px] font-semibold outline-none"
      >
        {payload.initials}
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-60">
        <p className="text-body-s text-foreground font-medium">{payload.userName}</p>
        <div className="mt-3 flex flex-col gap-1">
          <Link
            href="/accounts"
            className="text-body-s text-primary rounded-md px-2 py-1.5 hover:underline"
          >
            {S.switchAccount}
          </Link>
          <form action="/sign-out" method="post">
            <button
              type="submit"
              className="text-body-s text-primary w-full rounded-md px-2 py-1.5 text-left hover:underline"
            >
              {S.signOut}
            </button>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const WHERE_COOKIE = "pharmacy_ws2_where_seen";

/** Shown once to each pharmacy user after switch-on; dismissing it is kept on this browser (a cookie). */
function WhereNote() {
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return (
    <section
      aria-label={PHWS2.where.title}
      className="bg-tide-navy-900 text-tide-on-band rounded-tide-card flex flex-wrap items-center gap-3 px-4 py-3 print:hidden"
    >
      <p className="text-body-s min-w-0 flex-1">
        <strong className="font-semibold">{PHWS2.where.title}. </strong>
        {PHWS2.where.body}
      </p>
      <button
        type="button"
        onClick={() => {
          document.cookie = `${WHERE_COOKIE}=1; path=/pharmacy; max-age=31536000; samesite=lax`;
          setShown(false);
        }}
        className="bg-tide-lagoon text-tide-on-lagoon h-8 rounded-full px-3.5 text-[13px] font-semibold"
      >
        {PHWS2.where.dismiss}
      </button>
    </section>
  );
}

type Row = {
  key: string;
  group: keyof typeof F.groups;
  label: ReactNode;
  sub?: ReactNode;
  href: string;
};

const GROUP_ORDER = [
  "batch",
  "supplied",
  "patient",
  "prescription",
  "slip",
  "delivery",
  "page",
] as const satisfies readonly (keyof typeof F.groups)[];

/** Find (board 9): a centred dialog, results as a listbox with arrow keys. Numbers are posted, never in a URL. */
function FindPalette({
  open,
  onOpenChange,
  payload,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  payload: PharmacyShellPayload;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hit, setHit] = useState<FindHit | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const text = q.trim();
    const t = setTimeout(() => {
      const id = ++seq.current;
      if (text.length < 2) {
        setHit(null);
        return;
      }
      start(async () => {
        const r = await pharmacyFindAction({ q: text });
        if (id !== seq.current) return;
        setFailed(!r.ok);
        setHit(r.ok ? r.hit : null);
        setActive(0);
      });
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const r of hit?.rows ?? [])
      out.push({
        key: `${r.group}${r.href}`,
        group: r.group,
        label: r.mono ? <span className="font-mono text-[12.5px]">{r.label}</span> : r.label,
        sub: r.sub,
        href: r.href,
      });
    const t = q.trim().toLowerCase();
    for (const tab of payload.tabs) {
      const word = payload.tabWords[`${tab.place}.${tab.key}`] ?? S.places[tab.place];
      const label = `${S.places[tab.place]} › ${word}`;
      if (t && label.toLowerCase().includes(t))
        out.push({ key: `g${tab.href}${tab.key}`, group: "page", label, href: tab.href });
    }
    return out;
  }, [hit, q, payload]);

  const go = (r: Row | undefined) => {
    if (!r) return;
    onOpenChange(false);
    router.push(r.href);
  };
  const groups = GROUP_ORDER.map((g) => ({ g, items: rows.filter((r) => r.group === g) })).filter(
    (x) => x.items.length,
  );
  const text = q.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogTitle className="sr-only">{F.label}</DialogTitle>
        <div className="border-border flex items-center gap-3 border-b px-4">
          <SearchIcon aria-hidden className="text-tide-ink-3 size-5" />
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls="pharmacy-find-list"
            aria-activedescendant={rows[active] ? `pharmacy-find-${active}` : undefined}
            aria-label={F.placeholder}
            placeholder={F.placeholder}
            className="text-body-m h-14 min-w-0 flex-1 bg-transparent outline-none"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, rows.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(rows[active]);
              }
            }}
          />
          <button
            type="button"
            aria-label={S.close}
            onClick={() => onOpenChange(false)}
            className="text-ink-600 hover:bg-muted grid size-8 place-items-center rounded-full"
          >
            <XIcon aria-hidden className="size-4" />
          </button>
        </div>
        <div
          id="pharmacy-find-list"
          role="listbox"
          aria-label={F.label}
          aria-busy={pending}
          className="max-h-[60vh] overflow-y-auto p-2"
        >
          {groups.length === 0 ? (
            <p className="text-body-s text-muted-foreground px-3 py-6">
              {failed
                ? F.failed
                : text.length < 2
                  ? F.short
                  : pending
                    ? F.searching
                    : fill(F.nothing, { q: text })}
            </p>
          ) : (
            groups.map(({ g, items }) => (
              <div key={g} role="group" aria-label={F.groups[g]} className="mb-1">
                <p className="text-overline text-tide-ink-3 px-3 pt-2 pb-1 uppercase">
                  {F.groups[g]}
                </p>
                {items.map((r) => {
                  const i = rows.indexOf(r);
                  return (
                    <div
                      key={r.key}
                      id={`pharmacy-find-${i}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(r)}
                      className={cn(
                        "rounded-tide-row flex cursor-pointer flex-col px-3 py-2",
                        i === active && "bg-tide-lagoon-tint",
                      )}
                    >
                      <span className="text-body-s text-foreground">{r.label}</span>
                      {r.sub ? (
                        <span className="text-caption text-muted-foreground">{r.sub}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="border-border text-caption text-muted-foreground flex flex-wrap gap-4 border-t px-4 py-2">
          <span>↑↓ {F.keys.move}</span>
          <span>Enter {F.keys.open}</span>
          <span>Esc {F.keys.close}</span>
          <span className="flex-1 text-right">{F.hint}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
