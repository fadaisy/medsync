import { useEffect, useRef, useState } from "react";

import { Toast } from "@/components/tide";

/**
 * A short-lived Toast for the stubs ("Not available yet"). The caller places
 * `toast` last in its tree; `show` restarts the 2.5s timer.
 */
export function useToast(bottom = 40) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const show = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setText(next);
    timer.current = setTimeout(() => setText(null), 2500);
  };
  const toast = text ? <Toast key={text} text={text} bottom={bottom} /> : null;
  return { toast, show };
}
