import type { Block, BlockKey } from "@/lib/clerking/compose";
import { PencilIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The note (§5.10): blocks the composer writes from the answers by fixed rules, the block of the
 * current section marked in the Clinical place colour (iris, a tint and a ring; never a left bar; ADR 0162). "Edit
 * text" copies the current block into `content.edited[key]`: from then on it is the clinician's
 * text, a textarea marked "Edited, will not update", and "Undo edits" hands it back to the
 * composer. Hook-free; the desk owns the content.
 */
export function NotePane({
  blocks,
  current,
  edited,
  editable,
  onEdited,
}: {
  blocks: readonly Block[];
  /** The block the current section writes (SECTION_BLOCK). */
  current: BlockKey;
  edited: Readonly<Record<string, string>>;
  editable: boolean;
  /** Set (string) or clear (null) one block's edited text. */
  onEdited?: (key: BlockKey, text: string | null) => void;
}) {
  // An edited block the clinician emptied still shows, so it can be undone.
  const shown: Block[] = [...blocks];
  for (const [key, text] of Object.entries(edited))
    if (!shown.some((b) => b.key === key))
      shown.push({ key: key as BlockKey, head: key, text, edited: true });
  const cur = shown.find((b) => b.key === current);
  return (
    <section aria-labelledby="clerking-note-heading" className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="clerking-note-heading" className="text-heading-s text-foreground">
          Note
        </h2>
        <Button
          variant="ghost"
          size="sm"
          disabled={!editable || !cur || cur.edited}
          onClick={() => cur && onEdited?.(cur.key, cur.text)}
        >
          <PencilIcon aria-hidden />
          Edit text
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">
        Written from your entries as you go, by fixed rules. The part you are working on is
        highlighted.
      </p>
      <div className="flex flex-col gap-2">
        {shown.map((b) => {
          const here = b.key === current;
          return (
            <div
              key={b.key}
              data-block={b.key}
              data-current={here || undefined}
              aria-current={here ? "true" : undefined}
              className={cn(
                "-mx-2 flex flex-col gap-1 rounded-md px-2 py-2",
                here && "bg-iris-tint ring-iris-edge ring-1",
              )}
            >
              <h3
                className={cn(
                  "text-caption tracking-[0.06em] uppercase",
                  here ? "text-iris-text" : "text-muted-foreground",
                )}
              >
                {b.head}
              </h3>
              {b.edited ? (
                <>
                  <textarea
                    aria-label={`${b.head}, your text`}
                    value={b.text}
                    disabled={!editable}
                    rows={Math.min(14, Math.max(3, Math.ceil(b.text.length / 48)))}
                    onChange={(e) => onEdited?.(b.key, e.target.value)}
                    className="border-input bg-card text-body-s text-foreground focus-visible:shadow-focus w-full rounded-sm border px-2 py-1.5 leading-relaxed outline-none"
                  />
                  <span className="text-caption text-muted-foreground inline-flex flex-wrap items-center gap-x-2">
                    Edited, will not update
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => onEdited?.(b.key, null)}
                        className="focus-visible:shadow-focus rounded-xs font-medium text-teal-700 outline-none hover:underline"
                      >
                        Undo edits
                      </button>
                    ) : null}
                  </span>
                </>
              ) : (
                <p className="text-body-s text-foreground leading-relaxed whitespace-pre-wrap">
                  {b.text}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
