import React, { useEffect, useRef } from "react";
import { Check, GripVertical, Pencil, Star, Trash2 } from "lucide-react";
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

export interface ItemReorderState {
  enabled: boolean;
  draggingId: string | null;
  dropTargetId: string | null;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (targetId: string) => void;
  onMove: (id: string, offset: -1 | 1) => void;
}

interface ItemRowProps {
  item: ShoppingItem;
  index: number;
  edit: ItemEditState;
  reorder?: ItemReorderState;
  onToggle: (id: string, completed: boolean, item?: ShoppingItem) => void;
  onToggleImportant?: (id: string, important: boolean) => void;
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

function rowIdFromPoint(x: number, y: number): string | null {
  const node = document.elementFromPoint(x, y);
  if (!node || !(node instanceof Element)) return null;
  const row = node.closest("[data-item-id]");
  if (!(row instanceof HTMLElement)) return null;
  return row.dataset.itemId ?? null;
}

export const ItemRow: React.FC<ItemRowProps> = ({
  item,
  index: _index,
  edit,
  reorder,
  onToggle,
  onToggleImportant,
  onDelete,
}) => {
  void _index;
  const isEditing = edit.editingId === item.id;
  const handleEditKeys = useEditKeys(edit);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const canReorder = Boolean(reorder?.enabled && !item.completed && !isEditing);
  const isDragging = reorder?.draggingId === item.id;
  const isImportant = item.important === true;
  // Star control doubles as the gate for important row chrome.
  const showImportantUi = Boolean(onToggleImportant) && isImportant;
  const isDropTarget =
    Boolean(reorder?.dropTargetId === item.id) &&
    Boolean(reorder?.draggingId) &&
    reorder?.draggingId !== item.id;

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

  /**
   * Pointer drag from the grip only — starts immediately (no long-press).
   * Native HTML5 drag forces a hold on many touch browsers; this avoids that.
   */
  const startHandleDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!canReorder || !reorder) return;
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    handle.setPointerCapture(pointerId);

    const previousUserSelect = document.body.style.userSelect;
    const previousTouchAction = document.body.style.touchAction;
    document.body.style.userSelect = "none";
    document.body.style.touchAction = "none";
    document.body.classList.add("is-reordering");

    // Begin as soon as the dotted handle is pressed — no delay / long-press.
    reorder.onDragStart(item.id);
    let lastTargetId = item.id;
    let finished = false;

    const finish = (clientX: number, clientY: number, cancelled: boolean) => {
      if (finished) return;
      finished = true;

      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        // Already released.
      }
      document.body.style.userSelect = previousUserSelect;
      document.body.style.touchAction = previousTouchAction;
      document.body.classList.remove("is-reordering");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);

      if (cancelled) {
        reorder.onDragEnd();
        return;
      }

      // Always commit on release — live preview already moved rows; cancel
      // only happens via pointercancel above.
      const targetId = rowIdFromPoint(clientX, clientY) ?? lastTargetId;
      reorder.onDrop(targetId ?? item.id);
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      moveEvent.preventDefault();
      const targetId = rowIdFromPoint(moveEvent.clientX, moveEvent.clientY);
      if (!targetId || targetId === lastTargetId) return;
      lastTargetId = targetId;
      reorder.onDragOver(targetId);
    };

    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      finish(upEvent.clientX, upEvent.clientY, false);
    };

    const onCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== pointerId) return;
      finish(cancelEvent.clientX, cancelEvent.clientY, true);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  return (
    <div
      ref={rowRef}
      data-item-id={item.id}
      className={`item-row ${item.completed ? "completed" : ""} ${showImportantUi ? "is-important" : ""} ${isEditing ? "is-editing" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "is-drop-target" : ""} ${canReorder ? "is-reorderable" : ""}`}
    >
      {canReorder && reorder && (
        <button
          type="button"
          className="drag-handle"
          aria-label={`Reorder "${item.text}". Use arrow keys to move.`}
          title="Drag to reorder"
          onPointerDown={startHandleDrag}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              reorder.onMove(item.id, -1);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              reorder.onMove(item.id, 1);
            }
          }}
        >
          <GripVertical size={14} strokeWidth={2.25} />
        </button>
      )}

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
        {item.completed && <Check size={12} strokeWidth={3} />}
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
          {item.quantity && (
            <span className="item-qty">{formatQuantity(item.quantity)}</span>
          )}
        </button>
      )}

      {!isEditing && onToggleImportant && (
        <button
          className={`important-btn ${isImportant ? "is-active" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleImportant(item.id, isImportant);
          }}
          title={isImportant ? "Remove important" : "Mark important"}
          type="button"
          aria-label={
            isImportant
              ? `Unmark "${item.text}" as important`
              : `Mark "${item.text}" as important`
          }
          aria-pressed={isImportant}
        >
          <Star
            size={13}
            strokeWidth={2.25}
            fill={isImportant ? "currentColor" : "none"}
          />
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
          <Pencil size={13} />
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
        <Trash2 size={14} />
      </button>
    </div>
  );
};

interface CategoryGroupProps {
  group: { category: string; items: ShoppingItem[] };
  showHeading: boolean;
  edit: ItemEditState;
  reorder?: ItemReorderState;
  onToggle: (id: string, completed: boolean, item?: ShoppingItem) => void;
  onToggleImportant?: (id: string, important: boolean) => void;
  onDelete: (id: string) => void;
}

export const CategoryGroup: React.FC<CategoryGroupProps> = ({
  group,
  showHeading,
  edit,
  reorder,
  onToggle,
  onToggleImportant,
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
        reorder={reorder}
        onToggle={onToggle}
        onToggleImportant={onToggleImportant}
        onDelete={onDelete}
      />
    ))}
  </div>
);

export default ItemRow;
