import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  LogIn,
  Moon,
  PackageOpen,
  Plus,
  Sun,
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import BrandMark from "./BrandMark";
import { useAuth } from "../context/useAuth";
import { useDarkMode } from "../hooks/useDarkMode";
import {
  DEFAULT_CATEGORY,
  formatQuantity,
  getDuplicateKey,
  MAX_CATEGORY_LENGTH,
  MAX_ITEM_TEXT_LENGTH,
  MAX_QUANTITY_LENGTH,
  mergeQuantities,
  parseItemInput,
} from "../lib/itemInput";
import {
  createGuestId,
  readGuestItems,
  writeGuestItems,
  type GuestItem,
} from "../lib/guestItems";
import { groupItemsByCategory } from "../lib/shoppingItem";
import {
  assignSequentialOrders,
  LIST_SORT_MODES,
  moveItemByOffset,
  nextTopSortOrder,
  readDoneCollapsed,
  readListSortMode,
  reorderById,
  sortItemsForMode,
  writeDoneCollapsed,
  writeListSortMode,
  type ListSortMode,
} from "../lib/listOrder";
import ItemRow, {
  CATEGORY_DATALIST_ID,
  CategoryGroup,
  type ItemEditState,
  type ItemReorderState,
} from "./ItemRow";
import type { ShoppingItem } from "../lib/shoppingItem";

function asShoppingItem(item: GuestItem): ShoppingItem {
  return {
    id: item.id,
    text: item.text,
    completed: item.completed,
    userId: "guest",
    quantity: item.quantity,
    category: item.category,
    sortOrder: item.sortOrder,
  };
}

const GuestList: React.FC = () => {
  const { user, loading } = useAuth();
  const { dark, toggle } = useDarkMode();
  const [items, setItems] = useState<GuestItem[]>(readGuestItems);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [sortMode, setSortMode] = useState<ListSortMode>(readListSortMode);
  const [doneCollapsed, setDoneCollapsed] = useState(readDoneCollapsed);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const draggingIdRef = React.useRef<string | null>(null);
  const preview = useMemo(() => parseItemInput(value), [value]);

  useEffect(() => writeGuestItems(items), [items]);
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  // Signed-in users belong on the synced list; guest items migrate there once.
  if (user) return <Navigate to="/" replace />;

  const addItem = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseItemInput(value);
    if (!parsed.text) return;

    const key = getDuplicateKey(parsed.text);
    const duplicate = items.find((item) => getDuplicateKey(item.text) === key);

    if (duplicate) {
      const quantity = mergeQuantities(duplicate.quantity, parsed.quantity);
      setItems((current) =>
        current.map((item) =>
          item.id === duplicate.id
            ? { ...item, completed: false, quantity }
            : item,
        ),
      );
      setMessage(
        `${duplicate.text} was already here${quantity ? ` — now ${formatQuantity(quantity)}` : ""}.`,
      );
    } else {
      const sortOrder = nextTopSortOrder(
        items.filter((item) => !item.completed),
      );
      setItems((current) => [
        {
          id: createGuestId(),
          text: parsed.text,
          completed: false,
          quantity: parsed.quantity,
          category: parsed.category,
          sortOrder,
          createdAt: Date.now(),
        },
        ...current,
      ]);
    }
    setValue("");
  };

  const startEdit = (item: GuestItem | ShoppingItem) => {
    setEditingId(item.id);
    setEditText(item.text);
    setEditQuantity(item.quantity ?? "");
    setEditCategory(item.category ?? "");
  };

  const commitEdit = () => {
    if (!editingId) return;
    const text = editText.trim().slice(0, MAX_ITEM_TEXT_LENGTH);
    if (!text) {
      setMessage("Item text cannot be empty.");
      return;
    }

    const quantity = editQuantity.trim().slice(0, MAX_QUANTITY_LENGTH);
    const category = editCategory.trim().slice(0, MAX_CATEGORY_LENGTH);

    setItems((current) =>
      current.map((item) =>
        item.id === editingId
          ? {
              ...item,
              text,
              quantity: quantity || undefined,
              category: category || undefined,
            }
          : item,
      ),
    );
    setEditingId(null);
  };

  const {
    activeItems,
    doneItems,
    activeGroups,
    doneGroups,
  } = useMemo(() => {
    const stillNeeded = sortItemsForMode(
      items.filter((item) => !item.completed),
      sortMode === "aisle" ? "manual" : sortMode,
    );
    const alreadyGot = sortItemsForMode(
      items.filter((item) => item.completed),
      sortMode === "aisle" ? "manual" : sortMode,
    );
    return {
      activeItems: stillNeeded,
      doneItems: alreadyGot,
      activeGroups: groupItemsByCategory(stillNeeded),
      doneGroups: groupItemsByCategory(alreadyGot),
    };
  }, [items, sortMode]);

  const active = activeItems;
  const done = doneItems;
  const progress = items.length
    ? Math.round((done.length / items.length) * 100)
    : 0;

  const applyActiveReorder = (nextActive: GuestItem[]) => {
    const orders = assignSequentialOrders(nextActive);
    const orderById = new Map(orders.map((entry) => [entry.id, entry.sortOrder]));
    setItems((current) =>
      current.map((item) => {
        const sortOrder = orderById.get(item.id);
        return sortOrder === undefined ? item : { ...item, sortOrder };
      }),
    );
  };

  const reorderActiveItems = (draggedId: string, targetId: string) => {
    if (draggedId === targetId || sortMode === "alpha") return;

    if (sortMode === "manual") {
      const next = reorderById(activeItems, draggedId, targetId);
      if (next !== activeItems) applyActiveReorder(next);
      return;
    }

    const dragged = activeItems.find((item) => item.id === draggedId);
    const target = activeItems.find((item) => item.id === targetId);
    if (!dragged || !target) return;
    const draggedCat = dragged.category ?? DEFAULT_CATEGORY;
    const targetCat = target.category ?? DEFAULT_CATEGORY;
    if (draggedCat !== targetCat) return;

    const groupItems = activeItems.filter(
      (item) => (item.category ?? DEFAULT_CATEGORY) === draggedCat,
    );
    const reorderedGroup = reorderById(groupItems, draggedId, targetId);
    if (reorderedGroup === groupItems) return;

    const nextActive: GuestItem[] = [];
    let groupInserted = false;
    for (const item of activeItems) {
      const cat = item.category ?? DEFAULT_CATEGORY;
      if (cat !== draggedCat) {
        nextActive.push(item);
        continue;
      }
      if (!groupInserted) {
        nextActive.push(...reorderedGroup);
        groupInserted = true;
      }
    }
    applyActiveReorder(nextActive);
  };

  const moveActiveItem = (id: string, offset: -1 | 1) => {
    if (sortMode === "alpha") return;

    if (sortMode === "manual") {
      const next = moveItemByOffset(activeItems, id, offset);
      if (next !== activeItems) applyActiveReorder(next);
      return;
    }

    const item = activeItems.find((entry) => entry.id === id);
    if (!item) return;
    const cat = item.category ?? DEFAULT_CATEGORY;
    const groupItems = activeItems.filter(
      (entry) => (entry.category ?? DEFAULT_CATEGORY) === cat,
    );
    const reorderedGroup = moveItemByOffset(groupItems, id, offset);
    if (reorderedGroup === groupItems) return;

    const nextActive: GuestItem[] = [];
    let groupInserted = false;
    for (const entry of activeItems) {
      const entryCat = entry.category ?? DEFAULT_CATEGORY;
      if (entryCat !== cat) {
        nextActive.push(entry);
        continue;
      }
      if (!groupInserted) {
        nextActive.push(...reorderedGroup);
        groupInserted = true;
      }
    }
    applyActiveReorder(nextActive);
  };

  const reorderEnabled = sortMode !== "alpha" && active.length > 1;

  const clearDragState = () => {
    draggingIdRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
  };

  const reorderState: ItemReorderState = {
    enabled: reorderEnabled,
    draggingId,
    dropTargetId,
    onDragStart: (id) => {
      draggingIdRef.current = id;
      setDraggingId(id);
      setDropTargetId(null);
    },
    onDragOver: (id) => {
      setDropTargetId((current) => (current === id ? current : id));
    },
    onDragEnd: () => {
      clearDragState();
    },
    onDrop: (targetId) => {
      const fromId = draggingIdRef.current;
      clearDragState();
      if (!fromId || fromId === targetId) return;
      reorderActiveItems(fromId, targetId);
    },
    onMove: (id, offset) => moveActiveItem(id, offset),
  };

  const edit: ItemEditState = {
    editingId,
    text: editText,
    quantity: editQuantity,
    category: editCategory,
    onStart: startEdit,
    onTextChange: setEditText,
    onQuantityChange: setEditQuantity,
    onCategoryChange: setEditCategory,
    onCommit: commitEdit,
    onCancel: () => setEditingId(null),
  };

  const toggleItem = (id: string) => {
    setItems((current) =>
      current.map((entry) =>
        entry.id === id
          ? { ...entry, completed: !entry.completed }
          : entry,
      ),
    );
  };

  const deleteItem = (id: string) => {
    setItems((current) => current.filter((entry) => entry.id !== id));
  };

  const shoppingActive = activeItems.map(asShoppingItem);
  const shoppingDone = doneItems.map(asShoppingItem);
  const shoppingActiveGroups = activeGroups.map((group) => ({
    category: group.category,
    items: group.items.map(asShoppingItem),
  }));
  const shoppingDoneGroups = doneGroups.map((group) => ({
    category: group.category,
    items: group.items.map(asShoppingItem),
  }));

  return (
    <div className="app-wrapper">
      <header className="navbar">
        <div className="navbar-content">
          <div className="nav-brand">
            <div className="nav-brand-icon">
              <BrandMark className="brand-mark" />
            </div>
            <span className="nav-brand-name">
              Cart<em>Link</em>
            </span>
          </div>
          <div className="user-actions">
            <span className="guest-badge">Guest</span>
            <button
              className="theme-toggle"
              type="button"
              onClick={toggle}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Link
              className="theme-toggle"
              to="/login?redirect=/"
              aria-label="Sign in"
              title="Sign in"
            >
              <LogIn size={16} />
            </Link>
          </div>
        </div>
      </header>

      <main className="container">
        <div className="page-heading">
          <h1 className="page-title">My List</h1>
          <p className="guest-note">
            Saved only on this device.{" "}
            <Link to="/login?redirect=/">Sign in</Link> to share and sync —
            your items come with you.{" "}
            <Link to="/join">Have a share code?</Link>
          </p>
          {message && (
            <p className="form-success inline-error" role="status">
              {message}
            </p>
          )}
        </div>

        <form className="add-form" onSubmit={addItem}>
          <div className="add-primary-row">
            <input
              className="add-input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Add an item…"
              aria-label="New shopping item"
              autoFocus
              maxLength={MAX_ITEM_TEXT_LENGTH}
              autoComplete="off"
            />
            <button
              className="add-btn"
              type="submit"
              disabled={!preview.text}
              aria-label="Add item"
            >
              <Plus size={20} />
            </button>
          </div>
          <p className="add-hint" aria-live="polite">
            {(preview.quantity || preview.category) && (
              <>
                <strong>{preview.text}</strong>
                {preview.quantity && (
                  <span className="add-hint-chip">
                    {formatQuantity(preview.quantity)}
                  </span>
                )}
                {preview.category && (
                  <span className="add-hint-chip">{preview.category}</span>
                )}
              </>
            )}
          </p>
        </form>

        <datalist id={CATEGORY_DATALIST_ID}>
          {/* Guest list has no cloud aisles; built-ins still help while editing. */}
        </datalist>

        {items.length > 0 && (
          <div className="list-summary">
            <div className="stats-bar">
              <span className="stats-text">
                <strong>{active.length}</strong> left
                {done.length > 0 && ` · ${done.length} done`}
              </span>
              {done.length > 0 && (
                <button
                  className="clear-done-btn"
                  type="button"
                  onClick={() =>
                    setItems((current) =>
                      current.filter((item) => !item.completed),
                    )
                  }
                >
                  Clear {done.length} done
                </button>
              )}
            </div>
            <div className="list-toolbar">
              <div className="sort-toggle" role="group" aria-label="Sort list">
                {LIST_SORT_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`sort-toggle-btn ${sortMode === mode.id ? "active" : ""}`}
                    aria-pressed={sortMode === mode.id}
                    title={mode.label}
                    onClick={() => {
                      setSortMode(mode.id);
                      writeListSortMode(mode.id);
                      draggingIdRef.current = null;
                      setDraggingId(null);
                      setDropTargetId(null);
                    }}
                  >
                    {mode.shortLabel}
                  </button>
                ))}
              </div>
              {reorderEnabled && (
                <span className="sort-hint">
                  {sortMode === "manual"
                    ? "Drag to reorder"
                    : "Drag within aisle"}
                </span>
              )}
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label={`${done.length} of ${items.length} items picked up`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="empty-state">
            <PackageOpen size={40} className="empty-icon" />
            <p className="empty-title">Ready when you are</p>
            <p className="empty-text">Add your first item above.</p>
            <p className="empty-tip">
              Try <code>2 milk</code> to add a quantity and aisle automatically.
            </p>
          </div>
        ) : (
          <div className="items-list">
            {active.length > 0 &&
              (sortMode === "aisle"
                ? shoppingActiveGroups.map((group) => (
                    <CategoryGroup
                      key={group.category}
                      group={group}
                      showHeading={
                        shoppingActiveGroups.length > 1 ||
                        group.category !== DEFAULT_CATEGORY
                      }
                      edit={edit}
                      reorder={reorderState}
                      onToggle={(id) => toggleItem(id)}
                      onDelete={deleteItem}
                    />
                  ))
                : shoppingActive.map((item, index) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      index={index}
                      edit={edit}
                      reorder={reorderState}
                      onToggle={(id) => toggleItem(id)}
                      onDelete={deleteItem}
                    />
                  )))}

            {done.length > 0 && (
              <div className="done-section">
                <button
                  type="button"
                  className="items-divider items-divider-btn"
                  onClick={() => {
                    setDoneCollapsed((current) => {
                      const next = !current;
                      writeDoneCollapsed(next);
                      return next;
                    });
                  }}
                  aria-expanded={!doneCollapsed}
                >
                  {doneCollapsed ? (
                    <ChevronRight size={14} strokeWidth={2.5} />
                  ) : (
                    <ChevronDown size={14} strokeWidth={2.5} />
                  )}
                  <span className="items-divider-label">
                    Done · {done.length}
                  </span>
                  <div className="items-divider-line" />
                </button>
                {!doneCollapsed &&
                  (sortMode === "aisle"
                    ? shoppingDoneGroups.map((group) => (
                        <CategoryGroup
                          key={group.category}
                          group={group}
                          showHeading={
                            shoppingDoneGroups.length > 1 ||
                            group.category !== DEFAULT_CATEGORY
                          }
                          edit={edit}
                          onToggle={(id) => toggleItem(id)}
                          onDelete={deleteItem}
                        />
                      ))
                    : shoppingDone.map((item, index) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          index={index}
                          edit={edit}
                          onToggle={(id) => toggleItem(id)}
                          onDelete={deleteItem}
                        />
                      )))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default GuestList;
