"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const DURATION_MS = 700;

/** easeOutExpo-like curve: fast start, long settle, matching --ease-out. */
function easeOut(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * Counts from the previously shown value to `value`. A new value mid-count
 * retargets from wherever the count is. Screen readers get the final value only.
 */
export default function AnimatedNumber({
  value,
  format,
  className,
  delayMs = 0,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
  /** Hold the count until a staggered entrance has made the number visible. */
  delayMs?: number;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);

  useEffect(() => {
    if (reduced) return;
    const from = shownRef.current;
    if (from === value) return;
    const started = performance.now() + delayMs;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - started) / DURATION_MS));
      const next = from + (value - from) * easeOut(t);
      shownRef.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [delayMs, reduced, value]);

  return (
    <span className={className}>
      <span aria-hidden="true">{format(reduced ? value : shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
