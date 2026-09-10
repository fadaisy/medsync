/**
 * The "model" tag.
 *
 * Every number on the bench that comes out of the model rather than out of a
 * document carries one. It is focusable as well as hoverable, so the
 * provenance is reachable by keyboard, and it is announced to screen readers
 * as part of the value it belongs to.
 */
export function ModelTag({ note }: { note: string }) {
  const label = `Model value. ${note}`;
  return (
    <button
      type="button"
      className="group relative ml-1 cursor-help rounded-[3px] border border-edge px-[3px] py-0 align-middle font-mono text-[9px] leading-[13px] tracking-wide text-muted transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] hover:border-teal-bright hover:text-teal-bright focus-visible:text-teal-bright"
      aria-label={label}
      title={label}
    >
      model
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-50 w-56 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-[var(--radius-control)] border border-edge bg-[#0f1728] p-2 text-left font-sans text-micro leading-snug text-[#e8edf5] opacity-0 shadow-card transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-medsync)] group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        <span className="mb-1 block font-mono text-[9px] uppercase tracking-wider text-muted">
          from the model, not a document
        </span>
        {note}
      </span>
    </button>
  );
}
