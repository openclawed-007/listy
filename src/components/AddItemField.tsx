import React from "react";
import { Plus, X } from "lucide-react";
import { MAX_ITEM_TEXT_LENGTH, parseItemInput } from "../lib/itemInput";
import type { ItemSuggestionsState } from "../hooks/useItemSuggestions";
import ItemSuggestions from "./ItemSuggestions";

export interface AddCommitInput {
  text: string;
  quantity?: string;
  category?: string;
  note?: string;
}

interface AddItemFieldProps {
  listboxId: string;
  value: string;
  onValueChange: (value: string) => void;
  onCommit: (input: AddCommitInput) => void | Promise<void>;
  suggestions: ItemSuggestionsState;
  hint?: React.ReactNode;
  hintHidden?: boolean;
  autoFocus?: boolean;
  describedBy?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

/**
 * Shared add combobox. Resolves a highlighted suggestion or parses free text,
 * then calls one `onCommit` so guest and signed-in lists share a write path.
 */
const AddItemField: React.FC<AddItemFieldProps> = ({
  listboxId,
  value,
  onValueChange,
  onCommit,
  suggestions: box,
  hint,
  hintHidden,
  autoFocus,
  describedBy,
  inputRef,
}) => {
  const preview = parseItemInput(value);
  const canSubmit =
    Boolean(preview.text) || (box.show && box.activeIndex >= 0);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const picked = box.takeActive();
    if (picked) {
      box.close();
      void onCommit({
        text: picked.text,
        category: picked.category,
        note: picked.note,
      });
      return;
    }
    if (!preview.text) return;
    box.close();
    void onCommit(preview);
  };

  return (
    <form onSubmit={submit} className="add-form">
      <div className="add-primary-row">
        <input
          ref={inputRef}
          type="text"
          className="add-input"
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            box.handleInputChange();
          }}
          onFocus={box.onFocus}
          onBlur={box.onBlur}
          onKeyDown={(event) => {
            if (box.handleKeyDown(event) === "clear") onValueChange("");
          }}
          placeholder="Add or search…"
          aria-label="Add or search items"
          aria-describedby={describedBy}
          role="combobox"
          aria-expanded={box.show}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            box.show && box.activeIndex >= 0
              ? `${listboxId}-option-${box.activeIndex}`
              : undefined
          }
          maxLength={MAX_ITEM_TEXT_LENGTH}
          autoComplete="off"
          autoFocus={autoFocus}
        />
        {value.trim() && (
          <button
            type="button"
            className="add-clear-btn"
            onClick={() => {
              onValueChange("");
              box.close();
            }}
            aria-label="Clear"
            title="Clear"
          >
            <X size={16} />
          </button>
        )}
        <button
          type="submit"
          className="add-btn"
          title="Add item"
          aria-label="Add item"
          disabled={!canSubmit}
        >
          <Plus size={22} strokeWidth={2.5} />
        </button>
      </div>

      <ItemSuggestions
        id={listboxId}
        open={box.show}
        suggestions={box.suggestions}
        activeIndex={box.activeIndex}
        onHover={box.setActiveIndex}
        onPick={(entry) => {
          box.close();
          void onCommit({
            text: entry.text,
            category: entry.category,
            note: entry.note,
          });
        }}
      />

      {hint !== undefined && (
        <p
          id={describedBy}
          className={`add-hint ${hintHidden ? "is-pref-hidden" : ""}`}
          aria-live="polite"
        >
          {hint}
        </p>
      )}
    </form>
  );
};

export default AddItemField;
