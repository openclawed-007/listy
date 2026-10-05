import React, { useMemo } from "react";
import { usePreferences } from "../context/usePreferences";
import { formatQuantity, getDuplicateKey, parseItemInput } from "../lib/itemInput";

interface AddHintProps {
  /** What is in the add/search field right now. */
  value: string;
  /** Items on the list being viewed. */
  items: Array<{ text: string }>;
  isSearching: boolean;
  filteredCount: number;
}

/**
 * The line under the add field. Says what "2 milk" will actually become, warns
 * before a duplicate, and doubles as the search result count — so the smart
 * input is never a surprise.
 */
const AddHint: React.FC<AddHintProps> = ({ value, items, isSearching, filteredCount }) => {
  const { interfacePrefs } = usePreferences();
  const preview = useMemo(() => parseItemInput(value), [value]);
  const duplicate = useMemo(() => {
    if (!preview.text) return undefined;
    const key = getDuplicateKey(preview.text);
    return items.find((item) => getDuplicateKey(item.text) === key);
  }, [items, preview.text]);

  if (duplicate) {
    return (
      <>
        <strong>{duplicate.text}</strong> is already here — adding bumps the quantity.
      </>
    );
  }

  if (isSearching && items.length > 0) {
    return (
      <span className="add-hint-search">
        {filteredCount === 0
          ? "No matches — press + to add it"
          : `${filteredCount} match${filteredCount === 1 ? "" : "es"} · press + to add`}
      </span>
    );
  }

  if (!interfacePrefs.addHints || !(preview.quantity || preview.category)) return null;

  return (
    <>
      <strong>{preview.text}</strong>
      {preview.quantity && (
        <span className="add-hint-chip">{formatQuantity(preview.quantity)}</span>
      )}
      {preview.category && <span className="add-hint-chip">{preview.category}</span>}
    </>
  );
};

export default AddHint;
