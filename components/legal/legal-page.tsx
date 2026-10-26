import type { LegalDoc } from "@/content/legal";
import type { Metadata } from "next";

import { CONTAINER, LANDING_FOCUS, TEXT_LINK } from "@/components/landing/primitives";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { Tag } from "@/components/medsync/tag";
import { SITE } from "@/content/landing";
import { LEGAL_CONTACT_LEAD, LEGAL_DRAFT } from "@/content/legal";
import { OPEN_GRAPH, SITE_NAME } from "@/lib/site-config";
import { cn } from "@/lib/utils";

/** Indexed only once published (lib/legal.ts); a draft stays out of search. */
export function legalMetadata(doc: LegalDoc, path: string, published: boolean): Metadata {
  return {
    title: doc.title,
    description: doc.description,
    alternates: { canonical: path },
    robots: published ? undefined : { index: false, follow: false },
    openGraph: {
      ...OPEN_GRAPH,
      title: `${doc.title} · ${SITE_NAME}`,
      description: doc.description,
      url: path,
    },
  };
}

/** /privacy and /terms: one reading column, sections from content/legal.ts, a Draft notice until published. */
export function LegalPage({ doc, published }: { doc: LegalDoc; published: boolean }) {
  return (
    <div className={cn("bg-background flex min-h-svh flex-col", LANDING_FOCUS)}>
      <SiteNav />
      <main className="flex-1">
        <article
          className={cn(CONTAINER, "flex max-w-[46rem] flex-col gap-10 pt-16 pb-20 sm:pt-24")}
        >
          <header className="flex flex-col gap-4">
            <p className="text-overline text-muted-foreground font-mono uppercase">
              Updated {doc.updated}
            </p>
            <h1 className="font-display text-display-s sm:text-display-m text-foreground text-balance">
              {doc.title}
            </h1>
            <p className="text-body-l text-muted-foreground">{doc.intro}</p>
            {published ? null : (
              <div
                role="note"
                className="border-border bg-muted flex flex-col items-start gap-2 rounded-md border p-4"
              >
                <Tag>{LEGAL_DRAFT.label}</Tag>
                <p className="text-body-m text-foreground">{LEGAL_DRAFT.text}</p>
              </div>
            )}
          </header>

          {doc.sections.map((s) => (
            <section key={s.heading} className="flex flex-col gap-3">
              <h2 className="text-heading-m text-foreground">{s.heading}</h2>
              {s.body.map((p) => (
                <p key={p} className="text-body-m text-foreground">
                  {p}
                </p>
              ))}
              {s.list ? (
                <ul className="text-body-m text-foreground flex list-disc flex-col gap-1.5 pl-5">
                  {s.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          <p className="text-body-m text-muted-foreground border-border border-t pt-6">
            {LEGAL_CONTACT_LEAD}{" "}
            <a href={`mailto:${SITE.email}`} className={TEXT_LINK}>
              {SITE.email}
            </a>
            .
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
