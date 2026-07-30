import React, { useEffect, useRef } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import {
  formatQuantity,
  MAX_CATEGORY_LENGTH,
  MAX_ITEM_TEXT_LENGTH,
  MAX_QUANTITY_LENGTH,
} from "../lib/itemInput";
import type { ShoppingItem } from "../lib/shoppingItem";

/** id of the shared <datalist> that suggests aisles while editing. */
export const CATEGORY_DATALIST_ID = "cartlink-categories";

/**
 * Everything a row needs to render and drive inline editing. Grouped into one
 * object so rows take two props instead of a dozen.
 */
export interface ItemEditState {
  editingId: string | null;
  text: string;
  quantity: string;
  category: string;
  onStart: (item: ShoppingItem) => void;
  onTextChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

interface ItemRowProps {
  item: ShoppingItem;
  index: number;
  edit: ItemEditState;
  onToggle: (id: string, completed: boolean, item?: ShoppingItem) => void;
  onDelete: (id: string) => void;
}

// Enter saves, Escape reverts — on every edit field, so the row behaves the
// same wherever the caret happens to be.
function useEditKeys(edit: ItemEditState) {
  return (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      edit.onCommit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      edit.onCancel();
    }
  };
}

const ItemRow: React.FC<ItemRowProps> = ({
  item,
  index,
  edit,
  onToggle,
  onDelete,
}) => {
  const isEditing = edit.editingId === item.id;
  const handleEditKeys = useEditKeys(edit);
  const rowRef = useRef<HTMLDivElement | null>(null);

  // Soft keyboard can cover lower rows; bring the edit target into view.
  useEffect(() => {
    if (!isEditing) return undefined;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const frame = window.requestAnimationFrame(() => {
      const node = rowRef.current;
      // jsdom has no layout engine; scrollIntoView is missing or throws.
      if (!node || typeof node.scrollIntoView !== "function") return;
      try {
        node.scrollIntoView({
          block: "nearest",
          behavior: reduceMotion ? "auto" : "smooth",
        });
      } catch {
        // Ignore environments without scroll support.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isEditing]);

  return (
    <div
      ref={rowRef}
      className={`item-row ${item.completed ? "completed" : ""} ${isEditing ? "is-editing" : ""}`}
      style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
    >
      <button
        className={`toggle-btn ${item.completed ? "is-checked" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          if (!isEditing) onToggle(item.id, item.completed, item);
        }}
        type="button"
        aria-label={
          item.completed
            ? `Mark "${item.text}" as needed`
            : `Mark "${item.text}" as completed`
        }
        aria-pressed={item.completed}
      >
        {item.completed && <Check size={13} strokeWidth={3} />}
      </button>

      {isEditing ? (
        <div
          className="item-edit-fields"
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            ) {
              edit.onCommit();
            }
          }}
        >
          <input
            className="item-edit-input"
            value={edit.text}
            autoFocus
            onChange={(event) => edit.onTextChange(event.target.value)}
            maxLength={MAX_ITEM_TEXT_LENGTH}
            onKeyDown={handleEditKeys}
            aria-label="Edit item text"
          />
          <input
            className="item-edit-input item-edit-meta"
            value={edit.quantity}
            onChange={(event) => edit.onQuantityChange(event.target.value)}
            maxLength={MAX_QUANTITY_LENGTH}
            onKeyDown={handleEditKeys}
            placeholder="Qty"
            aria-label="Edit item quantity"
          />
          <input
            className="item-edit-input item-edit-meta"
            value={edit.category}
            onChange={(event) => edit.onCategoryChange(event.target.value)}
            maxLength={MAX_CATEGORY_LENGTH}
            onKeyDown={handleEditKeys}
            placeholder="Aisle"
            aria-label="Edit item category"
            list={CATEGORY_DATALIST_ID}
          />
        </div>
      ) : (
        <button
          className="item-content"
          type="button"
          onClick={() => onToggle(item.id, item.completed, item)}
          aria-label={`${item.completed ? "Mark as needed" : "Mark as completed"}: ${item.text}`}
        >
          <span className="item-text">{item.text}</span>
          {/* The aisle is already the group heading above, so the row only
              needs the quantity — one less thing to read per line. */}
          {item.quantity && (
            <span className="item-qty">{formatQuantity(item.quantity)}</span>
          )}
        </button>
      )}

      {!isEditing && (
        <button
          className="edit-btn"
          onClick={(event) => {
            event.stopPropagation();
            edit.onStart(item);
          }}
          title="Edit item"
          type="button"
          aria-label={`Edit "${item.text}"`}
        >
          <Pencil size={14} />
        </button>
      )}

      <button
        className="delete-btn"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(item.id);
        }}
        title="Remove item"
        type="button"
        aria-label={`Remove "${item.text}"`}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
};

interface CategoryGroupProps {
  group: { category: string; items: ShoppingItem[] };
  showHeading: boolean;
  edit: ItemEditState;
  onToggle: (id: string, completed: boolean, item?: ShoppingItem) => void;
  onDelete: (id: string) => void;
}

export const CategoryGroup: React.FC<CategoryGroupProps> = ({
  group,
  showHeading,
  edit,
  onToggle,
  onDelete,
}) => (
  <div className="category-group">
    {showHeading && <div className="category-heading">{group.category}</div>}
    {group.items.map((item, index) => (
      <ItemRow
        key={item.id}
        item={item}
        index={index}
        edit={edit}
        onToggle={onToggle}
        onDelete={onDelete}
      />
    ))}
  </div>
);

export default ItemRow;
