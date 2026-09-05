"use client";

import type { NcdCatalog, SiteProfile } from "@/lib/ncd/catalog/schema";
import type { CaptureMap } from "@/lib/ncd/engine/evaluate";
import { useMemo, useState } from "react";
import { ActivityIcon } from "lucide-react";

import { buildProfile } from "@/lib/ncd/profile";
import { NcdCapture } from "./ncd-capture";
import { NcdProfileView } from "./ncd-profile";

/**
 * The NCD clerkship shell — capture on the left, the live profile on the right.
 *
 * The profile recomputes on every keystroke because `buildProfile` is pure and
 * cheap, and because the payoff of answering a question should be immediate and
 * visible. That feedback loop is the thing the old clerkship never had: forty
 * taps that changed nothing on screen.
 *
 * Nothing here is autonomous. The engine reports which criteria are met and
 * which are not; the diagnosis of record remains the clinician's.
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

  const profile = useMemo(
    () => buildProfile({ catalog, values, site: activeSite, established }),
    [catalog, values, activeSite, established],
  );

  const update = (next: CaptureMap) => {
    setValues(next);
    onChange?.(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5">
          <ActivityIcon className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
          <h2 className="font-display text-foreground text-[17px] leading-tight font-medium tracking-[-0.012em]">
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
                      ? "bg-teal-600 text-white"
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

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]">
        <NcdCapture catalog={catalog} site={activeSite} values={values} onChange={update} />
        <div className="lg:sticky lg:top-4">
          <NcdProfileView profile={profile} />
        </div>
      </div>
    </div>
  );
}
