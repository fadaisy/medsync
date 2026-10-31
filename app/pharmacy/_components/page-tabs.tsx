import { PillTabs } from "@/components/tide/work/space";
import { RW } from "@/content/pharmacy-rework";
import { pageByKey } from "@/lib/pharmacy/ia";

/** A page's `?tab=` row, from the one href map (lib/pharmacy/ia) and the rework copy. The shell owns the h1. */
export function PageTabs({
  page,
  current,
  counts = {},
}: {
  page: keyof typeof RW.tabs;
  current: string;
  counts?: Record<string, number | null>;
}) {
  const p = pageByKey(page);
  const labels = RW.tabs[page] as Record<string, string>;
  return (
    <PillTabs
      label={RW.pages[page as keyof typeof RW.pages] ?? page}
      current={current}
      tabs={(p?.tabs ?? []).map((t) => ({
        key: t,
        label: labels[t] ?? t,
        href: `${p!.href}?tab=${t}`,
        count: counts[t] ?? null,
        attention: (counts[t] ?? 0) > 0,
      }))}
    />
  );
}
