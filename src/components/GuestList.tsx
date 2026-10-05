import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { usePreferences } from "../context/usePreferences";
import { useAddFieldShortcut } from "../hooks/useAddFieldShortcut";
import { useDarkMode } from "../hooks/useDarkMode";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useItemActions } from "../hooks/useItemActions";
import { useItemReorder } from "../hooks/useItemReorder";
import { useItemSuggestions } from "../hooks/useItemSuggestions";
import { useListDisplayPrefs } from "../hooks/useListDisplayPrefs";
import { useListView } from "../hooks/useListView";
import { useShoppingReminders } from "../hooks/useShoppingReminders";
import { useTransientMessage } from "../hooks/useTransientMessage";
import { useUndoDelete } from "../hooks/useUndoDelete";
import {
  createGuestId,
  readGuestItems,
  writeGuestItems,
  type GuestItem,
} from "../lib/guestItems";
import {
  AISLES,
  formatQuantity,
  getDuplicateKey,
  MAX_CATEGORY_LENGTH,
  MAX_ITEM_TEXT_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_QUANTITY_LENGTH,
  mergeQuantities,
} from "../lib/itemInput";
import { nextTopSortOrder } from "../lib/listOrder";
import { groupItemsByCategory, type ShoppingItem } from "../lib/shoppingItem";
import AddFab from "./AddFab";
import AddHint from "./AddHint";
import AddItemField from "./AddItemField";
import AppNavbar from "./AppNavbar";
import ConfirmDialog from "./ConfirmDialog";
import { CATEGORY_DATALIST_ID } from "./ItemRow";
import { DismissibleMessage, ReminderBanner, UndoToast } from "./ListStatus";
import ListSummary from "./ListSummary";
import NavOverflowMenu from "./NavOverflowMenu";
import SettingsDialog from "./SettingsDialog";
import ShoppingListItems from "./ShoppingListItems";

const LIST_NAME = "My List";

/** Rows share the signed-in list's renderer, which speaks ShoppingItem. */
function toRow(item: GuestItem): ShoppingItem {
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

const toRowGroups = (groups: Array<{ category: string; items: GuestItem[] }>) =>
  groups.map((group) => ({ category: group.category, items: group.items.map(toRow) }));

/**
 * A private list kept only in this browser — no account, no sync. Same
 * features as the signed-in list where they make sense without a server.
 */
const GuestList: React.FC = () => {
  const { user, loading } = useAuth();
  const { dark, toggle } = useDarkMode();
  const { interfacePrefs, reminderSettings } = usePreferences();
  const reminderBanner = useShoppingReminders();
  useDocumentTitle("Guest list");

  const [items, setItems] = useState<GuestItem[]>(readGuestItems);
  const [value, setValue] = useState("");
  const [message, setMessage] = useTransientMessage(4000);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const addInputRef = useRef<HTMLInputElement | null>(null);
  useAddFieldShortcut(addInputRef);

  const history = useItemSuggestions(value);
  const undo = useUndoDelete<GuestItem>();
  const { sortMode, setSortMode, doneCollapsed, toggleDoneCollapsed } = useListDisplayPrefs();

  useEffect(() => writeGuestItems(items), [items]);

  const updateItem = (id: string, change: (item: GuestItem) => GuestItem) =>
    setItems((current) => current.map((item) => (item.id === id ? change(item) : item)));

  const commitAdd = (input: { text: string; quantity?: string; category?: string; note?: string }) => {
    const text = input.text.trim();
    if (!text) return;
    const key = getDuplicateKey(text);
    const duplicate = items.find((item) => getDuplicateKey(item.text) === key);

    if (duplicate) {
      const quantity = mergeQuantities(duplicate.quantity, input.quantity);
      updateItem(duplicate.id, (item) => ({
        ...item,
        completed: false,
        quantity,
        category: item.category ?? input.category,
        note: item.note ?? input.note,
      }));
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
      const sortOrder = nextTopSortOrder(items.filter((item) => !item.completed));
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
      history.remember({ text, category: input.category, note: input.note });
    }
    setValue("");
  };

  const { edit } = useItemActions(async (id, text, quantity, category, note) => {
    const trimmed = text.trim().slice(0, MAX_ITEM_TEXT_LENGTH);
    if (!trimmed) {
      setMessage("Item text cannot be empty.");
      return false;
    }
    updateItem(id, (item) => ({
      ...item,
      text: trimmed,
      quantity: quantity.trim().slice(0, MAX_QUANTITY_LENGTH) || undefined,
      category: category.trim().slice(0, MAX_CATEGORY_LENGTH) || undefined,
      note: note.trim().slice(0, MAX_NOTE_LENGTH) || undefined,
    }));
    return true;
  });

  const view = useListView(items, value, sortMode);
  const reorderEnabled = !view.isSearching && sortMode !== "alpha" && view.activeCount > 1;
  const { reorderState, displayActiveItems, resetDrag } = useItemReorder<GuestItem>({
    activeItems: view.activeItems,
    sortMode,
    enabled: reorderEnabled,
    onCommitOrder: ({ nextActive }) => {
      const orderById = new Map(nextActive.map((item) => [item.id, item.sortOrder]));
      setItems((current) =>
        current.map((item) => {
          const sortOrder = orderById.get(item.id);
          return sortOrder === undefined ? item : { ...item, sortOrder };
        }),
      );
    },
  });
  const rows = useMemo(
    () => ({
      active: displayActiveItems.map(toRow),
      done: view.doneItems.map(toRow),
      activeGroups: toRowGroups(groupItemsByCategory(displayActiveItems)),
      doneGroups: toRowGroups(view.doneGroups),
    }),
    [displayActiveItems, view.doneGroups, view.doneItems],
  );

  // Every hook runs before these returns: a conditional hook count crashes
  // React when the auth state resolves.
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  // Signed-in users belong on the synced list; guest items migrate there once.
  // Anonymous share-page sessions are not accounts, so they stay here.
  if (user && !user.isAnonymous) return <Navigate to="/" replace />;

  const toggleItem = (row: ShoppingItem) => {
    // Checking off reinforces staples for typeahead.
    if (!row.completed) history.remember(row);
    updateItem(row.id, (item) => ({ ...item, completed: !item.completed }));
  };

  const toggleImportant = (row: ShoppingItem) =>
    updateItem(row.id, ({ important, ...item }) => (important ? item : { ...item, important: true }));

  const deleteItem = (row: ShoppingItem) => {
    const item = items.find((entry) => entry.id === row.id);
    if (!item) return;
    setItems((current) => current.filter((entry) => entry.id !== row.id));
    undo.hold(item);
  };

  const undoDelete = () => {
    const item = undo.take();
    if (!item) return;
    setItems((current) =>
      current.some((entry) => entry.id === item.id) ? current : [item, ...current],
    );
  };

  return (
    <div className="app-wrapper">
      <AppNavbar>
        <span className="guest-badge">Guest</span>
        <NavOverflowMenu
          dark={dark}
          onToggleDark={toggle}
          showSettings
          settingsActive={reminderSettings.enabled}
          onOpenSettings={() => setSettingsOpen(true)}
          signInTo="/login"
        />
      </AppNavbar>

      <main className="container">
        <div className="page-heading">
          <h1 className="page-title">{LIST_NAME}</h1>
          {interfacePrefs.onboardingCopy && (
            <p className="guest-note">
              Saved only on this device. <Link to="/login">Sign in</Link> to share and
              sync — your items come with you. <Link to="/join">Have a share code?</Link>
            </p>
          )}
          {message && (
            <DismissibleMessage kind="success" message={message} onDismiss={() => setMessage("")} />
          )}
          {reminderBanner && (
            <ReminderBanner
              message={reminderBanner.message}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}
        </div>

        <AddItemField
          listboxId="guest-item-suggestions"
          value={value}
          onValueChange={setValue}
          onCommit={commitAdd}
          suggestions={history}
          inputRef={addInputRef}
          describedBy="add-hint"
          autoFocus={
            typeof window !== "undefined" && !window.matchMedia("(pointer: coarse)").matches
          }
          hintHidden={!interfacePrefs.addHints && !view.isSearching}
          hint={
            <AddHint
              value={value}
              items={items}
              isSearching={view.isSearching}
              filteredCount={view.filteredCount}
            />
          }
        />

        <datalist id={CATEGORY_DATALIST_ID}>
          {AISLES.map((aisle) => (
            <option key={aisle} value={aisle} />
          ))}
        </datalist>

        {items.length > 0 && (
          <ListSummary
            view={view}
            sortMode={sortMode}
            onSortChange={(mode) => {
              setSortMode(mode);
              resetDrag();
            }}
            reorderEnabled={reorderEnabled}
          >
            <div className="stats-actions">
              {view.allDoneCount > 0 && !view.isSearching && (
                <button className="clear-done-btn" type="button" onClick={() => setConfirmClear(true)}>
                  Clear done
                </button>
              )}
            </div>
          </ListSummary>
        )}

        <div className="items-section">
          <ShoppingListItems
            activeItems={rows.active}
            doneItems={rows.done}
            activeGroups={rows.activeGroups}
            doneGroups={rows.doneGroups}
            sortMode={sortMode}
            edit={edit}
            reorder={reorderState}
            doneCollapsed={doneCollapsed}
            onToggleDoneCollapsed={toggleDoneCollapsed}
            isSearching={view.isSearching}
            activeListName={LIST_NAME}
            onToggle={toggleItem}
            onToggleImportant={interfacePrefs.importantStars ? toggleImportant : undefined}
            onDelete={deleteItem}
            emptyExtra={
              interfacePrefs.emptyTips ? (
                <p className="empty-tip">
                  Try <code>2 milk</code> to add a quantity and aisle automatically.
                </p>
              ) : null
            }
          />
        </div>
      </main>

      <AddFab inputRef={addInputRef} raised={Boolean(undo.pending)} />

      {undo.pending && <UndoToast text={undo.pending.text} onUndo={undoDelete} />}

      {confirmClear && (
        <ConfirmDialog
          action="clearCompleted"
          itemCount={view.allDoneCount}
          listName={LIST_NAME}
          busy={false}
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            setConfirmClear(false);
            setItems((current) => current.filter((item) => !item.completed));
          }}
        />
      )}

      {settingsOpen && <SettingsDialog userId={null} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
};

export default GuestList;
