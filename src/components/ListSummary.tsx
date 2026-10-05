import React from "react";
import { usePreferences } from "../context/usePreferences";
import { LIST_SORT_MODES, type ListSortMode } from "../lib/listOrder";

interface ListSummaryProps {
  view: {
    totalCount: number;
    filteredCount: number;
    allDoneCount: number;
    isSearching: boolean;
    progress: number;
    statsLeft: number;
    statsDone: number;
  };
  sortMode: ListSortMode;
  onSortChange: (mode: ListSortMode) => void;
  /** Drag-to-reorder is live, so the sort buttons can say how to use it. */
  reorderEnabled: boolean;
  /** List actions (Clear done, Rename, …) shown at the end of the row. */
  children?: React.ReactNode;
}

const DRAG_HINTS: Partial<Record<ListSortMode, string>> = {
  manual: " — drag to reorder",
  aisle: " — drag within aisle",
};

/** "6 left · 2 done", the sort switch, list actions and the progress bar. */
const ListSummary: React.FC<ListSummaryProps> = ({
  view,
  sortMode,
  onSortChange,
  reorderEnabled,
  children,
}) => {
  const { interfacePrefs } = usePreferences();
  const { totalCount, isSearching } = view;
  const plural = view.filteredCount === 1 ? "" : "es";

  return (
    <div className="list-summary">
      <div className="list-meta-row">
        <span className="stats-text">
          {totalCount === 0 ? (
            "Empty list"
          ) : (
            <>
              <strong>{isSearching ? view.filteredCount : view.statsLeft}</strong>
              {isSearching ? ` match${plural}` : " left"}
              {view.statsDone > 0 && ` · ${view.statsDone} done`}
            </>
          )}
        </span>

        {totalCount > 0 && (
          <div className="sort-toggle" role="group" aria-label="Sort list">
            {LIST_SORT_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`sort-toggle-btn ${sortMode === mode.id ? "active" : ""}`}
                aria-pressed={sortMode === mode.id}
                title={
                  reorderEnabled && interfacePrefs.sortHints
                    ? `${mode.label}${DRAG_HINTS[mode.id] ?? ""}`
                    : mode.label
                }
                onClick={() => onSortChange(mode.id)}
              >
                {mode.shortLabel}
              </button>
            ))}
          </div>
        )}

        {children}
      </div>

      {totalCount > 0 && !isSearching && interfacePrefs.progressBar && (
        <div
          className="progress-track"
          role="progressbar"
          aria-label={`${view.allDoneCount} of ${totalCount} items picked up`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={view.progress}
        >
          <div className="progress-fill" style={{ width: `${view.progress}%` }} />
        </div>
      )}
    </div>
  );
};

export default ListSummary;
