import React from "react";
import type { HistoryEntry } from "../lib/itemHistory";

interface ItemSuggestionsProps {
  id: string;
  open: boolean;
  suggestions: HistoryEntry[];
  activeIndex: number;
  onHover: (index: number) => void;
  onPick: (entry: HistoryEntry) => void;
}

/**
 * Combobox listbox for the add field. Presentational — parent owns keyboard
 * and open/close state so ShoppingList and GuestList can share it.
 */
const ItemSuggestions: React.FC<ItemSuggestionsProps> = ({
  id,
  open,
  suggestions,
  activeIndex,
  onHover,
  onPick,
}) => {
  if (!open || suggestions.length === 0) return null;

  return (
    <ul
      id={id}
      className="suggest-panel"
      role="listbox"
      aria-label="Suggested items"
    >
      {suggestions.map((entry, index) => {
        const active = index === activeIndex;
        return (
          <li key={entry.text} role="presentation">
            <button
              type="button"
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={active}
              className={`suggest-row ${active ? "is-active" : ""}`}
              onMouseEnter={() => onHover(index)}
              onMouseDown={(event) => {
                // Keep focus on the add input; blur would close before click.
                event.preventDefault();
              }}
              onClick={() => onPick(entry)}
            >
              <span className="suggest-text">{entry.text}</span>
              {entry.category && (
                <span className="suggest-meta">{entry.category}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
};

export default ItemSuggestions;
