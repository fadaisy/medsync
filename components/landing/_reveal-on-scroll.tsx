"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Scroll-entrance helpers for the landing page (presentation only).
 *
 * - `RevealOnScroll` — content fades + slides up once, the first time it
 *   enters the viewport (threshold 0.15). Reduced-motion users see the
 *   final state instantly (the hidden state is `motion-safe:`-gated, so
 *   even pre-hydration nothing is hidden for them).
 * - `StaggerOnScroll` — parent stays invisible until it enters the
 *   viewport, then the existing `stagger-children` utility cascades its
 *   direct children in (60 ms steps, reduced-motion-gated internally).
 *
 * Both reveal exactly once and disconnect their observer afterwards.
 * No props beyond presentation — zero data-flow.
 */

function useRevealOnce<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No observer support → reveal on the next frame. (Reduced-motion
    // users never see the hidden state at all — every hidden class is
    // `motion-safe:`-gated — so no media-query branch is needed here.)
    if (typeof IntersectionObserver === "undefined") {
      const id = setTimeout(() => setShown(true), 0);
      return () => clearTimeout(id);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -32px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, shown };
}

interface RevealOnScrollProps {
  children: React.ReactNode;
  className?: string;
  /** Extra transition delay (ms) for choreographed sequences. */
  delay?: number;
}

export function RevealOnScroll({ children, className, delay = 0 }: RevealOnScrollProps) {
  const { ref, shown } = useRevealOnce<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        "motion-safe:transition-[opacity,transform] motion-safe:duration-700 motion-safe:[transition-timing-function:var(--ease-expo-out)]",
        shown ? "translate-y-0 opacity-100" : "motion-safe:translate-y-4 motion-safe:opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface StaggerOnScrollProps {
  children: React.ReactNode;
  className?: string;
  /** Element to render — keeps list semantics when wrapping `<li>`s. */
  as?: "div" | "ul" | "ol" | "section";
}

export function StaggerOnScroll({ children, className, as = "div" }: StaggerOnScrollProps) {
  const { ref, shown } = useRevealOnce<HTMLElement>();
  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref}
      role={as === "ul" || as === "ol" ? "list" : undefined}
      className={cn(shown ? "stagger-children" : "motion-safe:opacity-0", className)}
    >
      {children}
    </Tag>
  );
}
