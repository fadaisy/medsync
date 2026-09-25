import { useId, useState, type ReactNode } from "react";

/**
 * A labelled part of the device.
 *
 * Every part on the stage carries a bracket number, a name and its current
 * value, reachable by hover and by focus. The label is an SVG group so it
 * scales with the drawing; the accessible name carries the same text.
 */
export function Part({
  number,
  name,
  value,
  detail,
  x,
  y,
  anchor = "start",
  children,
}: {
  number: string;
  name: string;
  value: string;
  detail: string;
  /** Where the label sits, in the drawing's own coordinates. */
  x: number;
  y: number;
  anchor?: "start" | "end" | "middle";
  children?: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const label = `${number} ${name}. ${value}. ${detail}`;

  return (
    <g
      tabIndex={0}
      role="img"
      aria-label={label}
      aria-describedby={open ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      className="cursor-help outline-none [&:focus-visible>.part-label]:opacity-100 [&:hover>.part-label]:opacity-100"
      style={{ pointerEvents: "all" }}
    >
      {children}
      <g className="part-label" transform={`translate(${x} ${y})`}>
        <text
          x={0}
          y={0}
          textAnchor={anchor}
          className="fill-[var(--color-teal-bright)] font-mono text-[13px]"
        >
          [{number}]
        </text>
        <text x={anchor === "end" ? -34 : 34} y={0} textAnchor={anchor} className="fill-[#cfd8e6] text-[14px]">
          {name}
        </text>
        <text
          x={anchor === "end" ? -34 : 34}
          y={16}
          textAnchor={anchor}
          className="fill-[var(--color-muted)] font-mono text-[12px]"
        >
          {value}
        </text>
      </g>
      {open ? (
        <foreignObject
          x={anchor === "end" ? x - 250 : x - 10}
          y={y + 22}
          width={250}
          height={110}
          pointerEvents="none"
        >
          <div
            id={id}
            role="tooltip"
            className="rounded-[var(--radius-control)] border border-edge bg-[#0f1728] p-2 text-[11px] leading-snug text-[#cfd8e6] shadow-card"
          >
            <span className="mb-0.5 block font-mono text-[9px] uppercase tracking-wider text-muted">
              {number} {name}
            </span>
            {detail}
          </div>
        </foreignObject>
      ) : null}
    </g>
  );
}

/** A stage that scales its drawing to the panel while keeping the aspect. */
export function StageSvg({
  viewBox,
  title,
  children,
}: {
  viewBox: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox={viewBox}
      role="group"
      aria-label={title}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
    >
      {children}
    </svg>
  );
}
