import { ZOOM_LEVELS, useBench, type ZoomLevel } from "../store/bench.ts";
import { Focus } from "./lab/Focus.tsx";
import { BodyView } from "./stage/BodyView.tsx";
import { HousingView } from "./stage/HousingView.tsx";
import { TipAView } from "./stage/TipAView.tsx";
import { TipBView } from "./stage/TipBView.tsx";

/**
 * The device stage.
 *
 * One continuous zoom control over one object. Zooming never navigates
 * anywhere: the simulation keeps running and the same device is simply seen
 * closer. Every part carries a number and a label with its current value.
 */
export function DeviceStage() {
  const zoom = useBench((s) => s.zoom);
  const setZoom = useBench((s) => s.setZoom);
  const stageMode = useBench((s) => s.stageMode);
  const setStageMode = useBench((s) => s.setStageMode);
  const current = ZOOM_LEVELS.find((z) => z.id === zoom) ?? ZOOM_LEVELS[0]!;
  const lab = stageMode === "lab";

  return (
    <section
      aria-label="Device stage"
      className="flex h-full min-h-0 flex-col rounded-[var(--radius-card)] border border-edge bg-panel shadow-card"
    >
      <header className="border-b border-edge px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-heading-s">{lab ? "Under the lens" : current.label}</h2>
            <p className="text-micro text-muted">
              {lab
                ? "One film of the stack, blown up until the mechanism shows"
                : current.caption}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStageMode(lab ? "device" : "lab")}
              aria-pressed={lab}
              className={`rounded-[var(--radius-control)] border px-2 py-1 text-micro transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] ${
                lab
                  ? "border-teal-bright bg-teal-bright/15 text-teal-bright"
                  : "border-edge text-muted hover:border-teal-bright hover:text-teal-bright"
              }`}
            >
              Under the lens
            </button>
            {lab ? null : (
              <>
              <label htmlFor="zoom" className="text-micro text-muted">
                Zoom
              </label>
              <input
                id="zoom"
                type="range"
                min={1}
                max={4}
                step={1}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value) as ZoomLevel)}
                aria-valuetext={`${current.label}. ${current.caption}`}
                className="w-32 accent-[var(--color-teal-bright)]"
              />
              <div role="group" aria-label="Zoom level" className="flex gap-1">
                {ZOOM_LEVELS.map((level) => (
                  <button
                    key={level.id}
                    type="button"
                    onClick={() => setZoom(level.id)}
                    aria-pressed={zoom === level.id}
                    title={level.caption}
                    className={`rounded-[var(--radius-control)] border px-2 py-1 font-mono text-micro transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] ${
                      zoom === level.id
                        ? "border-teal-bright bg-teal-bright/15 text-teal-bright"
                        : "border-edge text-muted hover:border-teal-bright hover:text-teal-bright"
                    }`}
                  >
                    {level.id}
                  </button>
                ))}
              </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden p-2">
        {lab ? (
          <Focus />
        ) : (
          <>
            {zoom === 1 ? <BodyView /> : null}
            {zoom === 2 ? <HousingView /> : null}
            {zoom === 3 ? <TipAView /> : null}
            {zoom === 4 ? <TipBView /> : null}
          </>
        )}
      </div>
    </section>
  );
}
