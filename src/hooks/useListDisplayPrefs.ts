import { useCallback, useState } from "react";
import {
  readDoneCollapsed,
  readListSortMode,
  writeDoneCollapsed,
  writeListSortMode,
  type ListSortMode,
} from "../lib/listOrder";

/** Sort mode and the collapsed "Done" section, remembered on this device. */
export function useListDisplayPrefs() {
  const [sortMode, setSortModeState] = useState<ListSortMode>(readListSortMode);
  const [doneCollapsed, setDoneCollapsed] = useState(readDoneCollapsed);

  const setSortMode = useCallback((mode: ListSortMode) => {
    setSortModeState(mode);
    writeListSortMode(mode);
  }, []);

  const toggleDoneCollapsed = useCallback(() => {
    setDoneCollapsed((current) => {
      writeDoneCollapsed(!current);
      return !current;
    });
  }, []);

  return { sortMode, setSortMode, doneCollapsed, toggleDoneCollapsed };
}
