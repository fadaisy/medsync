import { useEffect, useState } from "react";

/**
 * The current time, refreshed every 30 seconds, so "due now" moves on its
 * own while a screen is open. Kept in state because render must stay pure
 * (React Compiler): no `new Date()` in a component body.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
