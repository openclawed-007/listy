import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import BrandMark from "./BrandMark";
import ConfirmDialog from "./ConfirmDialog";
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
  formatQuantity,
  getDuplicateKey,
  MAX_CATEGORY_LENGTH,
  MAX_ITEM_TEXT_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_QUANTITY_LENGTH,
  mergeQuantities,
  AISLES,
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
  LIST_SORT_MODES,
  nextTopSortOrder,
  readDoneCollapsed,
  readListSortMode,
  writeDoneCollapsed,
  writeListSortMode,
  type ListSortMode,
} from "../lib/listOrder";
import { CATEGORY_DATALIST_ID, type ItemEditState } from "./ItemRow";
import AddItemField from "./AddItemField";
import { useItemSuggestions } from "../hooks/useItemSuggestions";
import { useItemReorder } from "../hooks/useItemReorder";
import { useListView } from "../hooks/useListView";
import type { ShoppingItem } from "../lib/shoppingItem";
import ShoppingListItems from "./ShoppingListItems";

function asShoppingItem(item: GuestItem): ShoppingItem {
  return {
    id: item.id,
    text: item.text,
    completed: item.completed,
    userId: "guest",
    quantity: item.quantity,
    category: item.category,
    note: item.note,
    important: item.important,
    sortOrder: item.sortOrder,
  };
}

const GuestList: React.FC = () => {
  const { user, loading } = useAuth();
  const { dark, toggle } = useDarkMode();
  const [items, setItems] = useState<GuestItem[]>(readGuestItems);
  const [value, setValue] = useState("");
  const history = useItemSuggestions(value);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editNote, setEditNote] = useState("");
  const [sortMode, setSortMode] = useState<ListSortMode>(readListSortMode);
  const [doneCollapsed, setDoneCollapsed] = useState(readDoneCollapsed);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    item: GuestItem;
    timeoutId: number;
  } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const { interfacePrefs, reminderSettings } = usePreferences();
  const preview = useMemo(() => parseItemInput(value), [value]);
  useDocumentTitle("Guest list");

  useEffect(() => writeGuestItems(items), [items]);
  useEffect(() => {
    return () => {
      if (pendingDelete) window.clearTimeout(pendingDelete.timeoutId);
    };
  }, [pendingDelete]);
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  // Reminders and preferences live in local storage while signed out, so
  // guests get the same Settings sheet as everyone else.
  useEffect(() => {
    void syncReminderSchedule(reminderSettings);
    return startReminderWatch(() => reminderSettings);
  }, [reminderSettings]);

  const reminderBanner = useMemo(() => {
    if (!interfacePrefs.shoppingBanners) return null;
    return shoppingDayBanner(reminderSettings);
  }, [interfacePrefs.shoppingBanners, reminderSettings]);

  const commitAdd = (input: {
    text: string;
    quantity?: string;
    category?: string;
    note?: string;
  }) => {
    const text = input.text.trim();
    if (!text) return;
    const key = getDuplicateKey(text);
    const duplicate = items.find((item) => getDuplicateKey(item.text) === key);

    if (duplicate) {
      const quantity = mergeQuantities(duplicate.quantity, input.quantity);
      setItems((current) =>
        current.map((item) =>
          item.id === duplicate.id
            ? {
                ...item,
                completed: false,
                quantity,
                category: item.category ?? input.category,
                note: item.note ?? input.note,
              }
            : item,
        ),
      );
      history.remember({
        text: duplicate.text,
        category: duplicate.category ?? input.category,
        note: duplicate.note ?? input.note,
      });
      setMessage(
        quantity
          ? `${duplicate.text} was already here — now ${formatQuantity(quantity)}.`
          : `${duplicate.text} is already on your list.`,
      );
    } else {
      const sortOrder = nextTopSortOrder(
        items.filter((item) => !item.completed),
      );
      setItems((current) => [
        {
          id: createGuestId(),
          text,
          completed: false,
          quantity: input.quantity,
          category: input.category,
          note: input.note,
          sortOrder,
          createdAt: Date.now(),
        },
        ...current,
      ]);
      history.remember({
        text,
        category: input.category,
        note: input.note,
      });
    }
    setValue("");
  };

  const startEdit = (item: GuestItem | ShoppingItem) => {
    setEditingId(item.id);
    setEditText(item.text);
    setEditQuantity(item.quantity ?? "");
    setEditCategory(item.category ?? "");
    setEditNote(item.note ?? "");
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
    const note = editNote.trim().slice(0, MAX_NOTE_LENGTH);

    setItems((current) =>
      current.map((item) =>
        item.id === editingId
          ? {
              ...item,
              text,
              quantity: quantity || undefined,
              category: category || undefined,
              note: note || undefined,
            }
          : item,
      ),
    );
    setEditingId(null);
  };

  const {
    activeItems,
    doneItems,
    doneGroups,
    filteredCount,
    isSearching,
    progress,
  } = useListView(items, value, sortMode);

  const active = activeItems;
  const done = doneItems;

  const reorderEnabled =
    !isSearching && sortMode !== "alpha" && active.length > 1;

  const { reorderState, displayActiveItems, resetDrag } = useItemReorder<GuestItem>({
    activeItems,
    sortMode,
    enabled: reorderEnabled,
    onCommitOrder: ({ nextActive }) => {
      const orderById = new Map(
        nextActive.map((item) => [item.id, item.sortOrder]),
      );
      setItems((current) =>
        current.map((item) => {
          const sortOrder = orderById.get(item.id);
          return sortOrder === undefined ? item : { ...item, sortOrder };
        }),
      );
    },
  });

  const displayActiveGroups = useMemo(
    () => groupItemsByCategory(displayActiveItems),
    [displayActiveItems],
  );

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

  const edit: ItemEditState = {
    editingId,
    text: editText,
    quantity: editQuantity,
    category: editCategory,
    note: editNote,
    onStart: startEdit,
    onTextChange: setEditText,
    onQuantityChange: setEditQuantity,
    onCategoryChange: setEditCategory,
    onNoteChange: setEditNote,
    onCommit: commitEdit,
    onCancel: () => setEditingId(null),
  };

  const toggleItem = (id: string) => {
    const entry = items.find((item) => item.id === id);
    if (!entry) return;
    // Checking off reinforces staples for typeahead.
    if (!entry.completed) {
      history.remember({
        text: entry.text,
        category: entry.category,
        note: entry.note,
      });
    }
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      ),
    );
  };

  const deleteItem = (id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    if (pendingDelete) window.clearTimeout(pendingDelete.timeoutId);

    setItems((current) => current.filter((entry) => entry.id !== id));
    const timeoutId = window.setTimeout(() => {
      setPendingDelete((current) => (current?.item.id === id ? null : current));
    }, 6000);
    setPendingDelete({ item, timeoutId });
  };

  const undoDeleteItem = () => {
    if (!pendingDelete) return;
    window.clearTimeout(pendingDelete.timeoutId);
    const { item } = pendingDelete;
    setPendingDelete(null);
    setItems((current) =>
      current.some((entry) => entry.id === item.id) ? current : [item, ...current],
    );
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
            <span className="guest-badge">Guest</span>
            <NavOverflowMenu
              dark={dark}
              onToggleDark={toggle}
              showSettings
              settingsActive={reminderSettings.enabled}
              onOpenSettings={() => setSettingsOpen(true)}
              signInTo="/login"
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
              <Link to="/login">Sign in</Link> to share and sync —
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
        </div>

        <AddItemField
          listboxId="guest-item-suggestions"
          value={value}
          onValueChange={setValue}
          onCommit={commitAdd}
          suggestions={history}
          autoFocus={
            typeof window !== "undefined" &&
            !window.matchMedia("(pointer: coarse)").matches
          }
          hintHidden={!interfacePrefs.addHints && !isSearching}
          hint={
            isSearching && items.length > 0 ? (
              <span className="add-hint-search">
                {filteredCount === 0
                  ? "No matches — press + to add it"
                  : `${filteredCount} match${filteredCount === 1 ? "" : "es"} · press + to add`}
              </span>
            ) : interfacePrefs.addHints &&
              (preview.quantity || preview.category) ? (
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
            ) : null
          }
        />

        <datalist id={CATEGORY_DATALIST_ID}>
          {AISLES.map((aisle) => (
            <option key={aisle} value={aisle} />
          ))}
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
                      resetDrag();
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
                    onClick={() => setConfirmClear(true)}
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

        <div className="items-section">
          <ShoppingListItems
            activeItems={shoppingActive}
            doneItems={shoppingDone}
            activeGroups={shoppingActiveGroups}
            doneGroups={shoppingDoneGroups}
            sortMode={sortMode}
            edit={edit}
            reorder={reorderState}
            doneCollapsed={doneCollapsed}
            isSearching={isSearching}
            totalCount={items.length}
            activeListName="My List"
            emptyTips={interfacePrefs.emptyTips}
            importantStars={interfacePrefs.importantStars}
            customList={false}
            sharedList={false}
            onToggleDone={() => {
              setDoneCollapsed((current) => {
                const next = !current;
                writeDoneCollapsed(next);
                return next;
              });
            }}
            onToggle={(id) => toggleItem(id)}
            onImportant={toggleImportant}
            onDelete={deleteItem}
            onDeleteList={() => undefined}
            onRemoveList={() => undefined}
          />
        </div>
      </main>

      {pendingDelete && (
        <div className="undo-toast" role="status">
          <span>Removed “{pendingDelete.item.text}”.</span>
          <button type="button" onClick={undoDeleteItem}>
            Undo
          </button>
        </div>
      )}

      {confirmClear && (
        <ConfirmDialog
          action="clearCompleted"
          itemCount={items.filter((item) => item.completed).length}
          listName="My List"
          busy={false}
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            setConfirmClear(false);
            setItems((current) => current.filter((item) => !item.completed));
          }}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          userId={null}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
};

export default GuestList;
