import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, PackageOpen } from "lucide-react";
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
import ItemRow, {
  CATEGORY_DATALIST_ID,
  CategoryGroup,
  type ItemEditState,
} from "./ItemRow";
import AddItemField from "./AddItemField";
import { useItemSuggestions } from "../hooks/useItemSuggestions";
import { useItemReorder } from "../hooks/useItemReorder";
import { useListView } from "../hooks/useListView";
import type { ShoppingItem } from "../lib/shoppingItem";

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

/** Vite dev / test server only — never ships to production builds. */
const DEV_GUEST_SETTINGS = import.meta.env.DEV;

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
  const { interfacePrefs, reminderSettings } = usePreferences();
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

  const { reorderState, displayActiveItems } = useItemReorder<GuestItem>({
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
    setItems((current) =>
      current.map((entry) => {
        if (entry.id !== id) return entry;
        const nextCompleted = !entry.completed;
        if (nextCompleted) {
          history.remember({
            text: entry.text,
            category: entry.category,
            note: entry.note,
          });
        }
        return { ...entry, completed: nextCompleted };
      }),
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
          {DEV_GUEST_SETTINGS && interfacePrefs.onboardingCopy && (
            <p className="guest-note" style={{ marginTop: "0.35rem" }}>
              Dev only: settings &amp; reminders are available while logged out
              on the test server.
            </p>
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
            <PackageOpen size={40} className="empty-icon" strokeWidth={1.25} />
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
