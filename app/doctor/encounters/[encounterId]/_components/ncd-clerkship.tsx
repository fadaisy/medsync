"use client";

import type { NcdCatalog, SiteProfile } from "@/lib/ncd/catalog/schema";
import type { CaptureMap } from "@/lib/ncd/engine/evaluate";
import { useMemo, useState } from "react";
import { ActivityIcon, ArrowLeftIcon, ArrowRightIcon } from "lucide-react";

import { buildProfile } from "@/lib/ncd/profile";
import { NcdCapture, NcdSectionRail, sectionProgress } from "./ncd-capture";
import { NcdProfileView } from "./ncd-profile";

/**
 * The NCD clerkship workspace.
 *
 * ── Why this is a bounded workspace and not a page ───────────────────────────
 * Seventy features stacked in one column is a long scroll, and a long scroll is
 * where a clinician loses their place mid-encounter — and worse, where the live
 * profile disappears off the top exactly when their answer has just changed it.
 *
 * So: three panes, each scrolling independently, none of them moving the page.
 * The rail keeps the whole protocol visible, the middle holds one section at a
 * time, and the profile never leaves the screen. The feedback loop between
 * answering something and seeing it land is the thing the old clerkship never
 * had; it only works if both halves are visible at once.
 *
 * Below `lg` this degrades to the honest stack — rail as a scrollable chip row,
 * then the section, then the profile — because side-by-side is a lie on a phone.
 */
export function NcdClerkship({
  catalog,
  site,
  initialValues,
  established,
  onChange,
  siteOptions,
}: {
  catalog: NcdCatalog;
  site: SiteProfile;
  initialValues?: CaptureMap;
  /** The patient already carries the diagnosis — skips re-adjudication. */
  established?: boolean;
  onChange?: (values: CaptureMap) => void;
  /**
   * Preview only. In production the site's capability profile comes from the
   * hospital's configuration — it is a property of the building, not a choice
   * the clinician makes at the bedside.
   */
  siteOptions?: SiteProfile[];
}) {
  const [values, setValues] = useState<CaptureMap>(initialValues ?? {});
  const [activeSite, setActiveSite] = useState<SiteProfile>(site);
  const [activeId, setActiveId] = useState<string>(
    () => [...catalog.sections].sort((a, b) => a.order - b.order)[0]?.id ?? "",
  );

  const profile = useMemo(
    () => buildProfile({ catalog, values, site: activeSite, established }),
    [catalog, values, activeSite, established],
  );
  const progress = useMemo(
    () => sectionProgress(catalog, activeSite, values),
    [catalog, activeSite, values],
  );

  const index = progress.findIndex((s) => s.id === activeId);
  const prev = index > 0 ? progress[index - 1] : undefined;
  const next = index >= 0 && index < progress.length - 1 ? progress[index + 1] : undefined;

  const update = (v: CaptureMap) => {
    setValues(v);
    onChange?.(v);
  };

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5">
          <ActivityIcon className="text-brand-600 dark:text-brand-400 size-4" aria-hidden />
          <h2 className="font-display text-foreground text-body-l leading-tight font-medium tracking-[-0.012em]">
            {catalog.display}
          </h2>
        </span>
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.08em]">
          v{catalog.version}
        </span>

        {siteOptions?.length ? (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-muted-foreground text-[10px] font-medium tracking-[0.1em] uppercase">
              Site
            </span>
            <span className="border-border inline-flex overflow-hidden rounded-md border">
              {siteOptions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={s.id === activeSite.id}
                  onClick={() => setActiveSite(s)}
                  className={`ease-expo-out px-2.5 py-1 text-[11.5px] font-medium transition-colors duration-100 active:scale-[0.97] ${
                    s.id === activeSite.id
                      ? "bg-brand-600 text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {s.display}
                </button>
              ))}
            </span>
          </span>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-3 lg:h-[calc(100svh-9rem)] lg:max-h-[52rem] lg:min-h-[32rem] lg:grid-cols-[13rem_minmax(0,1fr)_24rem]">
        {/* Rail — the whole protocol, so one-at-a-time never means hidden. */}
        <div className="border-border bg-card overflow-x-auto rounded-xl border p-1.5 shadow-xs lg:overflow-x-hidden lg:overflow-y-auto">
          <NcdSectionRail progress={progress} activeId={activeId} onPick={setActiveId} />
        </div>

        {/* One section, plus its own step controls. */}
        <div className="flex min-h-0 flex-col gap-2">
          <div className="min-h-0 flex-1 lg:overflow-y-auto lg:pr-1">
            <NcdCapture
              catalog={catalog}
              site={activeSite}
              values={values}
              onChange={update}
              sectionId={activeId}
            />
          </div>

          {/* Stepping is navigation, done many times per encounter — no motion. */}
          <div className="flex shrink-0 items-center gap-2">
            <StepButton
              dir="prev"
              label={prev?.display}
              onClick={() => prev && setActiveId(prev.id)}
            />
            <span className="text-muted-foreground mx-auto font-mono text-[10px] tabular-nums">
              {index + 1} / {progress.length}
            </span>
            <StepButton
              dir="next"
              label={next?.display}
              onClick={() => next && setActiveId(next.id)}
            />
          </div>
        </div>

        {/* Profile — never leaves the screen. */}
        <div className="min-h-0 lg:overflow-y-auto lg:pr-1">
          <NcdProfileView profile={profile} />
        </div>
      </div>
    </div>
  );
}

function StepButton({
  dir,
  label,
  onClick,
}: {
  dir: "prev" | "next";
  label?: string;
  onClick: () => void;
}) {
  const disabled = !label;
  const Icon = dir === "prev" ? ArrowLeftIcon : ArrowRightIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`border-border ease-expo-out inline-flex max-w-[45%] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors duration-100 ${
        disabled
          ? "text-muted-foreground/40 cursor-default"
          : "text-foreground/85 hover:bg-muted active:scale-[0.97]"
      }`}
    >
      {dir === "prev" ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
      <span className="truncate">{label ?? (dir === "prev" ? "Start" : "End")}</span>
      {dir === "next" ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
    </button>
  );
}
