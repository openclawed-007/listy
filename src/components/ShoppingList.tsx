import React, { useCallback, useMemo, useRef, useState } from "react";
import { Share2, WifiOff } from "lucide-react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { usePreferences } from "../context/usePreferences";
import { db } from "../firestore";
import { AISLES } from "../lib/itemInput";
import {
  getItemListId,
  groupItemsByCategory,
  PERSONAL_LIST_ID,
  PERSONAL_LIST_NAME,
  toSharedItemPayload,
  type ShoppingItem,
} from "../lib/shoppingItem";
import {
  isOwnedCustomListId,
  isSharedImportListId,
  MAX_CUSTOM_LISTS,
} from "../lib/userLists";
import { useAddFieldShortcut } from "../hooks/useAddFieldShortcut";
import { useDarkMode } from "../hooks/useDarkMode";
import { useGuestMigration } from "../hooks/useGuestMigration";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { useItemActions } from "../hooks/useItemActions";
import { useItemReorder } from "../hooks/useItemReorder";
import { useItemSuggestions } from "../hooks/useItemSuggestions";
import { useListDisplayPrefs } from "../hooks/useListDisplayPrefs";
import { useListView } from "../hooks/useListView";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useOwnedLists } from "../hooks/useOwnedLists";
import { useOwnerShareSync } from "../hooks/useOwnerShareSync";
import { useSharedList } from "../hooks/useSharedList";
import { useSharedListImport } from "../hooks/useSharedListImport";
import { useShoppingItems } from "../hooks/useShoppingItems";
import { useShoppingListActions } from "../hooks/useShoppingListActions";
import { useShoppingReminders } from "../hooks/useShoppingReminders";
import { useTransientMessage } from "../hooks/useTransientMessage";
import AddFab from "./AddFab";
import AddHint from "./AddHint";
import AddItemField from "./AddItemField";
import AppNavbar from "./AppNavbar";
import ConfirmDialog, { type ConfirmAction } from "./ConfirmDialog";
import { CATEGORY_DATALIST_ID } from "./ItemRow";
import ListAdminControls from "./ListAdminControls";
import { DismissibleMessage, ReminderBanner, UndoToast } from "./ListStatus";
import ListSummary from "./ListSummary";
import ListTabs from "./ListTabs";
import NavAccountMenu from "./NavAccountMenu";
import SettingsDialog from "./SettingsDialog";
import ShareDialog, { type ShareDialogTab } from "./ShareDialog";
import ShoppingListItems from "./ShoppingListItems";

const ShoppingList: React.FC = () => {
  const { user, logout } = useAuth();
  const { shareId } = useParams();
  const { dark, toggle: toggleDark } = useDarkMode();
  const { canInstall, install } = useInstallPrompt();
  const online = useOnlineStatus();
  const { interfacePrefs, reminderSettings } = usePreferences();
  const reminderBanner = useShoppingReminders();

  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useTransientMessage(5000);
  const [newItem, setNewItem] = useState("");
  const [shareTab, setShareTab] = useState<ShareDialogTab | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const addInputRef = useRef<HTMLInputElement | null>(null);
  useAddFieldShortcut(addInputRef);

  const { items, setItems, loaded: itemsLoaded } = useShoppingItems(user?.uid, setActionError);
  const history = useItemSuggestions(newItem);
  const lists = useOwnedLists(user?.uid, items);
  const { activeListId, setActiveListId, activeTabName, tabs } = lists;
  const { sortMode, setSortMode, doneCollapsed, toggleDoneCollapsed } = useListDisplayPrefs();

  // Sharing always publishes My List, whichever tab is open.
  const personalItems = useMemo(
    () => items.filter((item) => getItemListId(item) === PERSONAL_LIST_ID),
    [items],
  );
  const sharedPayload = useMemo(() => personalItems.map(toSharedItemPayload), [personalItems]);
  const ownerName =
    user?.displayName?.trim() || user?.email?.split("@")[0] || "Shared user";
  const sharing = useSharedList({
    firestore: db,
    user,
    ownerName,
    items: sharedPayload,
    onError: setActionError,
    onStopped: () => setShareTab(null),
  });
  useOwnerShareSync({
    user,
    ownerName,
    personalItems,
    itemsLoaded,
    isSharing: sharing.isSharing,
    permissions: sharing.permissions,
    allowAnonymousEdits: sharing.allowAnonymousEdits,
    shareCode: sharing.shareCode,
    notifyChanges: interfacePrefs.shareChangeNotices,
  });
  useGuestMigration({
    user,
    itemsLoaded,
    personalItems,
    onNotice: setNotice,
    onError: setActionError,
  });
  const importing = useSharedListImport({
    shareId,
    user,
    onImported: (listId, name) => {
      setActiveListId(listId);
      setNotice(`${name}'s list was added to your tabs.`);
    },
    onError: setActionError,
  });

  const listItems = useMemo(
    () => items.filter((item) => getItemListId(item) === activeListId),
    [activeListId, items],
  );
  const actions = useShoppingListActions({
    user,
    items,
    setItems,
    listItems,
    lists,
    remember: history.remember,
    notify: setNotice,
    fail: setActionError,
  });
  const { edit } = useItemActions(actions.saveDetails);

  // One field does both: typing filters the list; Enter / + adds the item.
  const view = useListView(listItems, newItem, sortMode);
  const reorderEnabled = !view.isSearching && sortMode !== "alpha" && view.activeCount > 1;
  const { reorderState, displayActiveItems, resetDrag } = useItemReorder<ShoppingItem>({
    activeItems: view.activeItems,
    sortMode,
    enabled: reorderEnabled,
    canReorder: () => Boolean(user) && !newItem.trim(),
    onCommitOrder: actions.saveOrder,
  });
  const displayActiveGroups = useMemo(
    () => groupItemsByCategory(displayActiveItems),
    [displayActiveItems],
  );

  // Aisle suggestions while editing: the customer's own first, then built-ins.
  const categorySuggestions = useMemo(() => {
    const used = new Set(items.flatMap((item) => (item.category ? [item.category] : [])));
    AISLES.forEach((aisle) => used.add(aisle));
    return Array.from(used).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const runConfirmedAction = useCallback(() => {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === "clearCompleted") actions.clearCompleted();
    if (action === "removeSharedList") actions.removeSharedList();
    if (action === "deleteCustomList") actions.deleteList();
    if (action === "stopSharing") void sharing.stopSharing();
  }, [actions, confirmAction, sharing]);

  if (!itemsLoaded || importing) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        {importing ? <p>Adding list…</p> : null}
      </div>
    );
  }

  const isCustomList = isOwnedCustomListId(activeListId);
  const isImportedList = isSharedImportListId(activeListId);

  return (
    <div className="app-wrapper">
      <AppNavbar>
        {!online && (
          <span
            className="offline-pill"
            role="status"
            title="Offline — changes will sync when online"
            aria-label="Offline — changes will sync when online"
          >
            <WifiOff size={13} strokeWidth={2.5} />
            <span className="offline-pill-text">Offline</span>
          </span>
        )}
        <button
          onClick={() => setShareTab("share")}
          className={`theme-toggle share-button ${sharing.isSharing ? "is-sharing" : ""}`}
          title="Share & join"
          type="button"
          aria-label={sharing.isSharing ? "Share and join (sharing is on)" : "Share and join"}
        >
          <Share2 size={16} />
          {sharing.isSharing && <span className="share-button-dot" aria-hidden="true" />}
        </button>
        <NavAccountMenu
          user={user}
          dark={dark}
          onToggleDark={toggleDark}
          onOpenSettings={() => setSettingsOpen(true)}
          onLogout={logout}
          canInstall={canInstall}
          onInstall={() => void install()}
          settingsActive={reminderSettings.enabled}
        />
      </AppNavbar>

      <main className="container">
        <div className="page-heading">
          <h1 className="page-title">{activeTabName}</h1>
          {notice && (
            <DismissibleMessage kind="success" message={notice} onDismiss={() => setNotice("")} />
          )}
          {actionError && (
            <DismissibleMessage
              kind="error"
              message={actionError}
              onDismiss={() => setActionError("")}
            />
          )}
          {reminderBanner && (
            <ReminderBanner
              message={reminderBanner.message}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}
        </div>

        <AddItemField
          listboxId="item-suggestions"
          value={newItem}
          onValueChange={setNewItem}
          onCommit={(input) => {
            if (actions.add(input)) setNewItem("");
          }}
          suggestions={history}
          inputRef={addInputRef}
          describedBy="add-hint"
          hintHidden={!interfacePrefs.addHints && !view.isSearching}
          hint={
            <AddHint
              value={newItem}
              items={listItems}
              isSearching={view.isSearching}
              filteredCount={view.filteredCount}
            />
          }
        />

        <datalist id={CATEGORY_DATALIST_ID}>
          {categorySuggestions.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>

        <ListTabs
          tabs={tabs}
          activeId={activeListId}
          onSelect={(id) => {
            setActiveListId(id);
            setNewItem("");
          }}
          canCreate={lists.canCreate}
          onCreate={actions.createList}
          onCreateBlocked={() =>
            setActionError(`You can have up to ${MAX_CUSTOM_LISTS} custom lists.`)
          }
        />

        {/* Rename/delete must show on empty custom lists too. */}
        {(view.totalCount > 0 || isCustomList || isImportedList) && (
          <ListSummary
            view={view}
            sortMode={sortMode}
            onSortChange={(mode) => {
              setSortMode(mode);
              resetDrag();
            }}
            reorderEnabled={reorderEnabled}
          >
            <ListAdminControls
              key={activeListId}
              listId={activeListId}
              listName={activeTabName}
              isOwnedCustom={isCustomList}
              isSharedImport={isImportedList}
              showClearDone={view.allDoneCount > 0 && !view.isSearching}
              onClearDone={() => setConfirmAction("clearCompleted")}
              onRename={actions.renameList}
              onRequestDelete={() => setConfirmAction("deleteCustomList")}
              onRequestRemoveShared={() => setConfirmAction("removeSharedList")}
            />
          </ListSummary>
        )}

        <div className="items-section">
          <ShoppingListItems
            activeItems={displayActiveItems}
            doneItems={view.doneItems}
            activeGroups={displayActiveGroups}
            doneGroups={view.doneGroups}
            sortMode={sortMode}
            edit={edit}
            reorder={reorderState}
            doneCollapsed={doneCollapsed}
            onToggleDoneCollapsed={toggleDoneCollapsed}
            isSearching={view.isSearching}
            activeListName={activeTabName}
            onToggle={actions.toggle}
            onToggleImportant={interfacePrefs.importantStars ? actions.toggleImportant : undefined}
            onDelete={actions.remove}
            emptyExtra={
              isCustomList ? (
                <p className="empty-tip">
                  Don&apos;t need this list?{" "}
                  <button
                    type="button"
                    className="empty-tip-link"
                    onClick={() => setConfirmAction("deleteCustomList")}
                  >
                    Delete list
                  </button>
                </p>
              ) : isImportedList ? (
                <p className="empty-tip">
                  Done with this shared list?{" "}
                  <button
                    type="button"
                    className="empty-tip-link"
                    onClick={() => setConfirmAction("removeSharedList")}
                  >
                    Remove list
                  </button>
                </p>
              ) : interfacePrefs.emptyTips ? (
                <p className="empty-tip">
                  Try <code>2 milk</code> to add a quantity and aisle automatically.
                </p>
              ) : null
            }
          />
        </div>
      </main>

      <AddFab inputRef={addInputRef} raised={Boolean(actions.pendingRemoval)} />

      {actions.pendingRemoval && (
        <UndoToast text={actions.pendingRemoval.text} onUndo={() => void actions.undoRemove()} />
      )}

      {shareTab && (
        <ShareDialog
          isSharing={sharing.isSharing}
          shareUrl={sharing.shareUrl}
          shareCode={sharing.shareCode}
          shareStatus={sharing.shareStatus}
          busy={sharing.shareBusy}
          permissions={sharing.permissions}
          allowAnonymousEdits={sharing.allowAnonymousEdits}
          initialTab={shareTab}
          sharedListName={PERSONAL_LIST_NAME}
          hasOtherLists={tabs.length > 1}
          ownerName={ownerName}
          onClose={() => setShareTab(null)}
          onStartSharing={sharing.startSharing}
          onTogglePermission={sharing.togglePermission}
          onToggleAnonymousEdits={sharing.toggleAnonymousEdits}
          onRequestStopSharing={() => setConfirmAction("stopSharing")}
        />
      )}

      {settingsOpen && (
        <SettingsDialog userId={user?.uid ?? null} onClose={() => setSettingsOpen(false)} />
      )}

      {/* Rendered last so it stacks above Share. */}
      {confirmAction && (
        <ConfirmDialog
          action={confirmAction}
          itemCount={confirmAction === "clearCompleted" ? view.allDoneCount : listItems.length}
          listName={activeTabName}
          busy={sharing.shareBusy && confirmAction === "stopSharing"}
          onCancel={() => setConfirmAction(null)}
          onConfirm={runConfirmedAction}
        />
      )}
    </div>
  );
};

export default ShoppingList;
