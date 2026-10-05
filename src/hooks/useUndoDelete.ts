import { useCallback, useEffect, useRef, useState } from "react";

const UNDO_WINDOW_MS = 6000;

/**
 * Holds the most recently deleted item for a few seconds so an Undo toast can
 * bring it back. A new delete replaces the previous one.
 */
export function useUndoDelete<T>(windowMs = UNDO_WINDOW_MS) {
  const [pending, setPending] = useState<T | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const hold = useCallback(
    (item: T) => {
      window.clearTimeout(timerRef.current);
      setPending(item);
      timerRef.current = window.setTimeout(() => setPending(null), windowMs);
    },
    [windowMs],
  );

  /** Clear the pending item and hand it back to be restored. */
  const take = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setPending(null);
    return pending;
  }, [pending]);

  return { pending, hold, take };
}
