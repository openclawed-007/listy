import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import {
  rankHistory,
  readItemHistory,
  touchItemHistory,
  type HistoryEntry,
} from "../lib/itemHistory";

/** Combobox state for the add field. Parent still owns the input value. */
export function useItemSuggestions(query: string) {
  const [entries, setEntries] = useState<HistoryEntry[]>(readItemHistory);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const suggestions = useMemo(
    () => rankHistory(query, entries),
    [entries, query],
  );
  const show = open && suggestions.length > 0;

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const remember = useCallback(
    (item: { text: string; category?: string; note?: string }) => {
      setEntries(touchItemHistory(item));
    },
    [],
  );

  const takeActive = useCallback((): HistoryEntry | undefined => {
    if (!show || activeIndex < 0) return undefined;
    return suggestions[activeIndex];
  }, [activeIndex, show, suggestions]);

  const handleInputChange = useCallback(() => {
    setOpen(true);
    setActiveIndex(-1);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!show) {
        if (event.key === "Escape" && query) {
          event.preventDefault();
          return "clear" as const;
        }
        return undefined;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) =>
          index < suggestions.length - 1 ? index + 1 : 0,
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) =>
          index <= 0 ? suggestions.length - 1 : index - 1,
        );
      } else if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      return undefined;
    },
    [close, query, show, suggestions.length],
  );

  return {
    suggestions,
    show,
    activeIndex,
    setActiveIndex,
    close,
    remember,
    takeActive,
    handleInputChange,
    handleKeyDown,
    onFocus: () => setOpen(true),
    onBlur: () => {
      window.setTimeout(() => setOpen(false), 120);
    },
  };
}

export type ItemSuggestionsState = ReturnType<typeof useItemSuggestions>;
