/**
 * The permanent honesty strip.
 *
 * It sits above everything, is never scrolled away, and says the same three
 * things at every width. It is not dismissible.
 */
export function HonestyStrip() {
  return (
    <div
      role="note"
      className="sticky top-0 z-40 border-b border-edge bg-[#0f1728] px-3 py-1.5 text-micro leading-snug text-muted"
    >
      <span className="mr-2 inline-block rounded-[3px] border border-amber/40 px-1.5 py-px font-mono text-[10px] uppercase tracking-wider text-amber">
        illustrative
      </span>
      Illustrative simulation of a device that does not yet exist. Model parameters are engineering
      estimates, not clinical data.{" "}
      <strong className="font-medium text-[#e8edf5]">Not a medical device.</strong>
    </div>
  );
}
