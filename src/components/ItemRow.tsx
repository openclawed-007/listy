import React, { useEffect, useRef } from "react";
import {
  Check,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  formatQuantity,
  MAX_CATEGORY_LENGTH,
  MAX_ITEM_TEXT_LENGTH,
  MAX_NOTE_LENGTH,
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
  note: string;
  onStart: (item: ShoppingItem) => void;
  onTextChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onNoteChange: (value: string) => void;
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

/** Row callbacks, shared by every row in a list. */
export interface ItemRowHandlers {
  edit: ItemEditState;
  reorder?: ItemReorderState;
  onToggle: (item: ShoppingItem) => void;
  /** Omitted when the "important" star is switched off in Settings. */
  onToggleImportant?: (item: ShoppingItem) => void;
  onDelete: (item: ShoppingItem) => void;
  /** Touch screens keep row actions in a tray; one row's tray is open at once. */
  actionsOpenId: string | null;
  onActionsOpenChange: (id: string | null) => void;
}

interface ItemRowProps extends ItemRowHandlers {
  item: ShoppingItem;
}

/** A horizontal flick this far (px) opens or closes the actions tray. */
const SWIPE_DISTANCE = 32;

function rowIdFromPoint(x: number, y: number): string | null {
  const node = document.elementFromPoint(x, y);
  const row = node instanceof Element ? node.closest("[data-item-id]") : null;
  return row instanceof HTMLElement ? (row.dataset.itemId ?? null) : null;
}

/**
 * Pointer drag from the grip only — starts immediately (no long-press).
 * Native HTML5 drag forces a hold on many touch browsers; this avoids that.
 */
function startHandleDrag(
  event: React.PointerEvent<HTMLButtonElement>,
  itemId: string,
  reorder: ItemReorderState,
) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();

  const handle = event.currentTarget;
  const pointerId = event.pointerId;
  handle.setPointerCapture(pointerId);

  const body = document.body;
  const previousUserSelect = body.style.userSelect;
  const previousTouchAction = body.style.touchAction;
  body.style.userSelect = "none";
  body.style.touchAction = "none";
  body.classList.add("is-reordering");

  reorder.onDragStart(itemId);
  let lastTargetId = itemId;
  let finished = false;

  const finish = (clientX: number, clientY: number, cancelled: boolean) => {
    if (finished) return;
    finished = true;
    try {
      handle.releasePointerCapture(pointerId);
    } catch {
      // Already released.
    }
    body.style.userSelect = previousUserSelect;
    body.style.touchAction = previousTouchAction;
    body.classList.remove("is-reordering");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);

    if (cancelled) reorder.onDragEnd();
    // The live preview already moved rows; commit wherever the pointer ended.
    else reorder.onDrop(rowIdFromPoint(clientX, clientY) ?? lastTargetId);
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
    if (upEvent.pointerId === pointerId) finish(upEvent.clientX, upEvent.clientY, false);
  };
  const onCancel = (cancelEvent: PointerEvent) => {
    if (cancelEvent.pointerId === pointerId) {
      finish(cancelEvent.clientX, cancelEvent.clientY, true);
    }
  };

  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
}

/**
 * Swipe left on a row to open its actions tray, right to close it. Touch
 * only — mice get hover. Vertical movement is left to the page scroll.
 */
function useSwipeActions(setOpen: (open: boolean) => void) {
  const start = useRef<{ x: number; y: number; id: number; swiping: boolean } | null>(null);
  const swallowClick = useRef(false);

  return {
    onPointerDown: (event: React.PointerEvent) => {
      // Browsers usually send no click after a swipe, so a stale flag would
      // eat the next real tap. Each gesture starts clean.
      swallowClick.current = false;
      if (event.pointerType !== "touch") return;
      start.current = { x: event.clientX, y: event.clientY, id: event.pointerId, swiping: false };
    },
    onPointerMove: (event: React.PointerEvent) => {
      const gesture = start.current;
      if (!gesture || gesture.id !== event.pointerId || gesture.swiping) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
        start.current = null;
      } else if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) {
        gesture.swiping = true;
        swallowClick.current = true;
        setOpen(dx < 0);
      }
    },
    onPointerUp: () => {
      start.current = null;
    },
    onPointerCancel: () => {
      start.current = null;
    },
    // A swipe must not also count as a tap that ticks the item off.
    onClickCapture: (event: React.MouseEvent) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}

const EditFields: React.FC<{ edit: ItemEditState }> = ({ edit }) => {
  // Enter saves, Escape reverts — on every field, wherever the caret is.
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      edit.onCommit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      edit.onCancel();
    }
  };

  return (
    <div
      className="item-edit-fields"
      onClick={(event) => event.stopPropagation()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
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
        onKeyDown={onKeyDown}
        aria-label="Edit item text"
      />
      <input
        className="item-edit-input item-edit-meta"
        value={edit.quantity}
        onChange={(event) => edit.onQuantityChange(event.target.value)}
        maxLength={MAX_QUANTITY_LENGTH}
        onKeyDown={onKeyDown}
        placeholder="Qty"
        aria-label="Edit item quantity"
      />
      <input
        className="item-edit-input item-edit-meta"
        value={edit.category}
        onChange={(event) => edit.onCategoryChange(event.target.value)}
        maxLength={MAX_CATEGORY_LENGTH}
        onKeyDown={onKeyDown}
        placeholder="Aisle"
        aria-label="Edit item category"
        list={CATEGORY_DATALIST_ID}
      />
      <input
        className="item-edit-input item-edit-note"
        value={edit.note}
        onChange={(event) => edit.onNoteChange(event.target.value)}
        maxLength={MAX_NOTE_LENGTH}
        onKeyDown={onKeyDown}
        placeholder="Note (optional)"
        aria-label="Edit item note"
      />
    </div>
  );
};

export const ItemRow: React.FC<ItemRowProps> = ({
  item,
  edit,
  reorder,
  onToggle,
  onToggleImportant,
  onDelete,
  actionsOpenId,
  onActionsOpenChange,
}) => {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const isEditing = edit.editingId === item.id;
  const isImportant = item.important === true;
  const actionsOpen = actionsOpenId === item.id && !isEditing;
  const canReorder = Boolean(reorder?.enabled && !item.completed && !isEditing);
  const isDragging = reorder?.draggingId === item.id;
  const isDropTarget =
    reorder?.dropTargetId === item.id &&
    Boolean(reorder.draggingId) &&
    reorder.draggingId !== item.id;
  const swipe = useSwipeActions((open) => onActionsOpenChange(open ? item.id : null));

  // Soft keyboard can cover lower rows; bring the edit target into view.
  useEffect(() => {
    if (!isEditing) return undefined;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = window.requestAnimationFrame(() => {
      // jsdom has no layout engine; scrollIntoView is missing there.
      rowRef.current?.scrollIntoView?.({
        block: "nearest",
        behavior: reduceMotion ? "auto" : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isEditing]);

  const act = (action: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation();
    onActionsOpenChange(null);
    action();
  };

  const className = [
    "item-row",
    item.completed && "completed",
    isImportant && onToggleImportant && "is-important",
    isEditing && "is-editing",
    isDragging && "is-dragging",
    isDropTarget && "is-drop-target",
    canReorder && "is-reorderable",
    actionsOpen && "is-actions-open",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={rowRef}
      data-item-id={item.id}
      className={className}
      onPointerDown={swipe.onPointerDown}
      onPointerMove={swipe.onPointerMove}
      onPointerUp={swipe.onPointerUp}
      onPointerCancel={swipe.onPointerCancel}
      onClickCapture={swipe.onClickCapture}
    >
      {canReorder && reorder && (
        <button
          type="button"
          className="drag-handle"
          aria-label={`Reorder "${item.text}". Use arrow keys to move.`}
          title="Drag to reorder"
          onPointerDown={(event) => startHandleDrag(event, item.id, reorder)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            reorder.onMove(item.id, event.key === "ArrowUp" ? -1 : 1);
          }}
        >
          <GripVertical size={14} strokeWidth={2.25} />
        </button>
      )}

      <button
        className={`toggle-btn ${item.completed ? "is-checked" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          if (!isEditing) onToggle(item);
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
        <EditFields edit={edit} />
      ) : (
        <button
          className="item-content"
          type="button"
          onClick={() => {
            if (actionsOpen) onActionsOpenChange(null);
            else onToggle(item);
          }}
          aria-label={`${item.completed ? "Mark as needed" : "Mark as completed"}: ${item.text}${item.note ? ` — ${item.note}` : ""}`}
        >
          <span className="item-main-line">
            <span className="item-text">{item.text}</span>
            {item.quantity && (
              <span className="item-qty">{formatQuantity(item.quantity)}</span>
            )}
            {isImportant && onToggleImportant && (
              <Star className="item-important-mark" size={12} fill="currentColor" aria-hidden="true" />
            )}
          </span>
          {item.note && (
            <span className="item-note" title={item.note}>
              {item.note}
            </span>
          )}
        </button>
      )}

      {!isEditing && (
        <>
          <div className="item-actions">
            {onToggleImportant && (
              <button
                className={`row-action important-btn ${isImportant ? "is-active" : ""}`}
                onClick={act(() => onToggleImportant(item))}
                title={isImportant ? "Remove important" : "Mark important"}
                type="button"
                aria-label={
                  isImportant
                    ? `Unmark "${item.text}" as important`
                    : `Mark "${item.text}" as important`
                }
                aria-pressed={isImportant}
              >
                <Star size={15} strokeWidth={2.25} fill={isImportant ? "currentColor" : "none"} />
              </button>
            )}
            <button
              className="row-action edit-btn"
              onClick={act(() => edit.onStart(item))}
              title="Edit item"
              type="button"
              aria-label={`Edit "${item.text}"`}
            >
              <Pencil size={15} />
            </button>
            <button
              className="row-action delete-btn"
              onClick={act(() => onDelete(item))}
              title="Remove item"
              type="button"
              aria-label={`Remove "${item.text}"`}
            >
              <Trash2 size={15} />
            </button>
          </div>
          <button
            className="item-more-btn"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onActionsOpenChange(actionsOpen ? null : item.id);
            }}
            aria-expanded={actionsOpen}
            aria-label={actionsOpen ? "Close item actions" : `Actions for "${item.text}"`}
          >
            {actionsOpen ? <X size={16} /> : <MoreHorizontal size={18} />}
          </button>
        </>
      )}
    </div>
  );
};

export default ItemRow;
