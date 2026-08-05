import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  PackageOpen,
  Plus,
  X,
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import BrandMark from "./BrandMark";
import NavOverflowMenu from "./NavOverflowMenu";
import SettingsDialog from "./SettingsDialog";
import { useAuth } from "../context/useAuth";
import { useDarkMode } from "../hooks/useDarkMode";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import {
  startReminderWatch,
  syncReminderSchedule,
} from "../lib/reminderNotifications";
import { shoppingDayBanner } from "../lib/shoppingReminders";
import { usePreferences } from "../context/usePreferences";
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
import { captureItemRects, playItemFlip } from "../lib/listFlip";
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
    important: item.important,
    sortOrder: item.sortOrder,
  };
}

/** Vite dev / test server only — never ships to production builds. */
const DEV_GUEST_SETTINGS = import.meta.env.DEV;

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
  const [dragOrderIds, setDragOrderIds] = useState<string[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { interfacePrefs, reminderSettings } = usePreferences();
  const draggingIdRef = useRef<string | null>(null);
  const dragOrderIdsRef = useRef<string[] | null>(null);
  const flipFirstRef = useRef<Map<string, DOMRect> | null>(null);
  const activeItemsRef = useRef<GuestItem[]>([]);
  const preview = useMemo(() => parseItemInput(value), [value]);
  useDocumentTitle("Guest list");

  useEffect(() => writeGuestItems(items), [items]);
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!DEV_GUEST_SETTINGS) return undefined;
    void syncReminderSchedule(reminderSettings);
    return startReminderWatch(() => reminderSettings);
  }, [reminderSettings]);

  const reminderBanner = useMemo(() => {
    if (!DEV_GUEST_SETTINGS || !interfacePrefs.shoppingBanners) return null;
    return shoppingDayBanner(reminderSettings);
  }, [interfacePrefs.shoppingBanners, reminderSettings]);

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

  const listQuery = value.trim().toLowerCase();
  const isSearching = listQuery.length > 0;

  const {
    activeItems,
    doneItems,
    doneGroups,
    filteredCount,
  } = useMemo(() => {
    const visible = listQuery
      ? items.filter((item) =>
          [item.text, item.quantity, item.category]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(listQuery),
        )
      : items;

    const stillNeeded = sortItemsForMode(
      visible.filter((item) => !item.completed),
      sortMode,
    );
    const alreadyGot = sortItemsForMode(
      visible.filter((item) => item.completed),
      sortMode,
    );
    return {
      activeItems: stillNeeded,
      doneItems: alreadyGot,
      doneGroups: groupItemsByCategory(alreadyGot),
      filteredCount: visible.length,
    };
  }, [items, sortMode, listQuery]);

  const active = activeItems;
  const done = doneItems;
  const progress = items.length
    ? Math.round((done.length / items.length) * 100)
    : 0;

  const displayActiveItems = useMemo(() => {
    if (!dragOrderIds) return activeItems;
    const byId = new Map(activeItems.map((item) => [item.id, item]));
    const ordered: GuestItem[] = [];
    for (const id of dragOrderIds) {
      const item = byId.get(id);
      if (item) {
        ordered.push(item);
        byId.delete(id);
      }
    }
    for (const item of byId.values()) ordered.push(item);
    return ordered;
  }, [activeItems, dragOrderIds]);

  const displayActiveGroups = useMemo(
    () => groupItemsByCategory(displayActiveItems),
    [displayActiveItems],
  );

  useLayoutEffect(() => {
    const first = flipFirstRef.current;
    if (!first) return;
    flipFirstRef.current = null;
    playItemFlip(first);
  });

  useEffect(() => {
    if (dragOrderIdsRef.current) {
      const byId = new Map(activeItems.map((item) => [item.id, item]));
      activeItemsRef.current = dragOrderIdsRef.current
        .map((id) => byId.get(id))
        .filter((item): item is GuestItem => Boolean(item));
      return;
    }
    activeItemsRef.current = activeItems;
  }, [activeItems]);

  // Early returns must come after every hook — a conditional hook count
  // crashes React when the auth state resolves.
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  // Signed-in users belong on the synced list; guest items migrate there once.
  if (user) return <Navigate to="/" replace />;

  const applyActiveReorder = (nextActive: GuestItem[]) => {
    const orders = assignSequentialOrders(nextActive);
    const orderById = new Map(
      orders.map((entry) => [entry.id, entry.sortOrder]),
    );

    activeItemsRef.current = nextActive.map((item) => ({
      ...item,
      sortOrder: orderById.get(item.id) ?? item.sortOrder,
    }));

    flipFirstRef.current = captureItemRects();
    setItems((current) =>
      current.map((item) => {
        const sortOrder = orderById.get(item.id);
        return sortOrder === undefined ? item : { ...item, sortOrder };
      }),
    );
  };

  const previewReorder = (draggedId: string, targetId: string) => {
    if (draggedId === targetId || sortMode === "alpha") return;

    const currentIds =
      dragOrderIdsRef.current ??
      activeItemsRef.current.map((item) => item.id);

    if (sortMode === "aisle") {
      const byId = new Map(
        activeItemsRef.current.map((item) => [item.id, item]),
      );
      const dragged = byId.get(draggedId);
      const target = byId.get(targetId);
      if (!dragged || !target) return;
      const draggedCat = dragged.category ?? DEFAULT_CATEGORY;
      const targetCat = target.category ?? DEFAULT_CATEGORY;
      if (draggedCat !== targetCat) return;

      const groupIds = currentIds.filter((id) => {
        const item = byId.get(id);
        return (item?.category ?? DEFAULT_CATEGORY) === draggedCat;
      });
      const reorderedGroup = reorderById(
        groupIds.map((id) => ({ id })),
        draggedId,
        targetId,
      ).map((entry) => entry.id);
      if (reorderedGroup.join("\0") === groupIds.join("\0")) return;

      const nextIds: string[] = [];
      let groupInserted = false;
      for (const id of currentIds) {
        const item = byId.get(id);
        const cat = item?.category ?? DEFAULT_CATEGORY;
        if (cat !== draggedCat) {
          nextIds.push(id);
          continue;
        }
        if (!groupInserted) {
          nextIds.push(...reorderedGroup);
          groupInserted = true;
        }
      }
      flipFirstRef.current = captureItemRects();
      dragOrderIdsRef.current = nextIds;
      setDragOrderIds(nextIds);
      return;
    }

    const nextIds = reorderById(
      currentIds.map((id) => ({ id })),
      draggedId,
      targetId,
    ).map((entry) => entry.id);
    if (nextIds.join("\0") === currentIds.join("\0")) return;

    flipFirstRef.current = captureItemRects();
    dragOrderIdsRef.current = nextIds;
    setDragOrderIds(nextIds);
  };

  const moveActiveItem = (id: string, offset: -1 | 1) => {
    if (sortMode === "alpha") return;
    const currentActive = activeItemsRef.current;

    if (sortMode === "manual") {
      const next = moveItemByOffset(currentActive, id, offset);
      if (next !== currentActive) applyActiveReorder(next);
      return;
    }

    const item = currentActive.find((entry) => entry.id === id);
    if (!item) return;
    const cat = item.category ?? DEFAULT_CATEGORY;
    const groupItems = currentActive.filter(
      (entry) => (entry.category ?? DEFAULT_CATEGORY) === cat,
    );
    const reorderedGroup = moveItemByOffset(groupItems, id, offset);
    if (reorderedGroup === groupItems) return;

    const nextActive: GuestItem[] = [];
    let groupInserted = false;
    for (const entry of currentActive) {
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

  const commitDragOrder = () => {
    const orderIds = dragOrderIdsRef.current;
    if (!orderIds || orderIds.length === 0) {
      dragOrderIdsRef.current = null;
      setDragOrderIds(null);
      return;
    }

    const sourceById = new Map(activeItems.map((item) => [item.id, item]));
    const nextActive = orderIds
      .map((id) => sourceById.get(id))
      .filter((item): item is GuestItem => Boolean(item));

    const orders = assignSequentialOrders(nextActive);
    const orderById = new Map(
      orders.map((entry) => [entry.id, entry.sortOrder]),
    );

    // Persist under the current visual order without a second layout jump.
    setItems((current) =>
      current.map((item) => {
        const sortOrder = orderById.get(item.id);
        return sortOrder === undefined ? item : { ...item, sortOrder };
      }),
    );
    dragOrderIdsRef.current = null;
    setDragOrderIds(null);
  };

  const reorderEnabled =
    !isSearching && sortMode !== "alpha" && active.length > 1;

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
      const ids = activeItemsRef.current.map((item) => item.id);
      dragOrderIdsRef.current = ids;
      setDragOrderIds(ids);
      setDraggingId(id);
      setDropTargetId(null);
    },
    onDragOver: (id) => {
      setDropTargetId((current) => (current === id ? current : id));
      const fromId = draggingIdRef.current;
      if (!fromId || fromId === id) return;
      previewReorder(fromId, id);
    },
    onDragEnd: () => {
      dragOrderIdsRef.current = null;
      setDragOrderIds(null);
      clearDragState();
    },
    onDrop: () => {
      clearDragState();
      commitDragOrder();
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

  const toggleImportant = (id: string, important: boolean) => {
    setItems((current) =>
      current.map((entry) => {
        if (entry.id !== id) return entry;
        if (important) {
          const { important: _drop, ...rest } = entry;
          void _drop;
          return rest;
        }
        return { ...entry, important: true };
      }),
    );
  };

  const shoppingActive = displayActiveItems.map(asShoppingItem);
  const shoppingDone = doneItems.map(asShoppingItem);
  const shoppingActiveGroups = displayActiveGroups.map((group) => ({
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
          <div
            className={`nav-brand ${interfacePrefs.brandLogo ? "" : "is-text-only"}`}
          >
            {interfacePrefs.brandLogo && (
              <div className="nav-brand-icon">
                <BrandMark className="brand-mark" />
              </div>
            )}
            <span className="nav-brand-name">
              Cart<em>Link</em>
            </span>
          </div>
          <div className="user-actions">
            <span className="guest-badge">
              Guest{DEV_GUEST_SETTINGS ? " · test" : ""}
            </span>
            <NavOverflowMenu
              dark={dark}
              onToggleDark={toggle}
              showSettings={DEV_GUEST_SETTINGS}
              settingsActive={reminderSettings.enabled}
              onOpenSettings={() => setSettingsOpen(true)}
              signInTo="/login?redirect=/"
            />
          </div>
        </div>
      </header>

      <main className="container">
        <div className="page-heading">
          <h1 className="page-title">My List</h1>
          {interfacePrefs.onboardingCopy && (
            <p className="guest-note">
              Saved only on this device.{" "}
              <Link to="/login?redirect=/">Sign in</Link> to share and sync —
              your items come with you.{" "}
              <Link to="/join">Have a share code?</Link>
            </p>
          )}
          {message && (
            <p className="form-success inline-error" role="status">
              {message}
            </p>
          )}
          {reminderBanner && (
            <div className="reminder-banner" role="status">
              <span>{reminderBanner.message}</span>
              <button
                type="button"
                className="reminder-banner-action"
                onClick={() => setSettingsOpen(true)}
              >
                Settings
              </button>
            </div>
          )}
          {DEV_GUEST_SETTINGS && interfacePrefs.onboardingCopy && (
            <p className="guest-note" style={{ marginTop: "0.35rem" }}>
              Dev only: settings &amp; reminders are available while logged out
              on the test server.
            </p>
          )}
        </div>

        <form className="add-form" onSubmit={addItem}>
          <div className="add-primary-row">
            <input
              className="add-input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Add or search…"
              aria-label="Add or search items"
              autoFocus
              maxLength={MAX_ITEM_TEXT_LENGTH}
              autoComplete="off"
            />
            {value.trim() && (
              <button
                type="button"
                className="add-clear-btn"
                onClick={() => setValue("")}
                aria-label="Clear"
                title="Clear"
              >
                <X size={16} />
              </button>
            )}
            <button
              className="add-btn"
              type="submit"
              disabled={!preview.text}
              aria-label="Add item"
            >
              <Plus size={20} />
            </button>
          </div>
          <p
            className={`add-hint ${interfacePrefs.addHints || isSearching ? "" : "is-pref-hidden"}`}
            aria-live="polite"
          >
            {isSearching && items.length > 0 ? (
              <span className="add-hint-search">
                {filteredCount === 0
                  ? "No matches — press + to add it"
                  : `${filteredCount} match${filteredCount === 1 ? "" : "es"} · press + to add`}
              </span>
            ) : (
              interfacePrefs.addHints &&
              (preview.quantity || preview.category) && (
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
              )
            )}
          </p>
        </form>

        <datalist id={CATEGORY_DATALIST_ID}>
          {/* Guest list has no cloud aisles; built-ins still help while editing. */}
        </datalist>

        {items.length > 0 && (
          <div className="list-summary">
            <div className="list-meta-row">
              <span className="stats-text">
                {isSearching ? (
                  <>
                    <strong>{filteredCount}</strong> match
                    {filteredCount === 1 ? "" : "es"}
                    {done.length > 0 && ` · ${done.length} done`}
                  </>
                ) : (
                  <>
                    <strong>{active.length}</strong> left
                    {done.length > 0 && ` · ${done.length} done`}
                  </>
                )}
              </span>

              <div className="sort-toggle" role="group" aria-label="Sort list">
                {LIST_SORT_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`sort-toggle-btn ${sortMode === mode.id ? "active" : ""}`}
                    aria-pressed={sortMode === mode.id}
                    title={
                      reorderEnabled && interfacePrefs.sortHints
                        ? `${mode.label}${
                            mode.id === "manual"
                              ? " — drag to reorder"
                              : mode.id === "aisle"
                                ? " — drag within aisle"
                                : ""
                          }`
                        : mode.label
                    }
                    onClick={() => {
                      setSortMode(mode.id);
                      writeListSortMode(mode.id);
                      draggingIdRef.current = null;
                      dragOrderIdsRef.current = null;
                      setDraggingId(null);
                      setDropTargetId(null);
                      setDragOrderIds(null);
                    }}
                  >
                    {mode.shortLabel}
                  </button>
                ))}
              </div>

              <div className="stats-actions">
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
                    Clear done
                  </button>
                )}
              </div>
            </div>
            {interfacePrefs.progressBar && (
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
            )}
          </div>
        )}

        {items.length === 0 ? (
          <div className="empty-state">
            <PackageOpen size={40} className="empty-icon" />
            <p className="empty-title">Ready when you are</p>
            <p className="empty-text">Add your first item above.</p>
            {interfacePrefs.emptyTips && (
              <p className="empty-tip">
                Try <code>2 milk</code> to add a quantity and aisle
                automatically.
              </p>
            )}
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
                      onToggleImportant={
                        interfacePrefs.importantStars
                          ? toggleImportant
                          : undefined
                      }
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
                      onToggleImportant={
                        interfacePrefs.importantStars
                          ? toggleImportant
                          : undefined
                      }
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
                          onToggleImportant={
                            interfacePrefs.importantStars
                              ? toggleImportant
                              : undefined
                          }
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
                          onToggleImportant={
                            interfacePrefs.importantStars
                              ? toggleImportant
                              : undefined
                          }
                          onDelete={deleteItem}
                        />
                      )))}
              </div>
            )}
          </div>
        )}
      </main>

      {DEV_GUEST_SETTINGS && settingsOpen && (
        <SettingsDialog
          userId={null}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
};

export default GuestList;
