import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type WriteBatch,
} from "../services/firestoreOperations";
import { Share2, WifiOff } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase";
import { hasAnyPermission } from "../lib/sharePermissions";
import {
  AISLES,
  formatQuantity,
  getDuplicateKey,
  MAX_CATEGORY_LENGTH,
  MAX_ITEM_TEXT_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_QUANTITY_LENGTH,
  mergeQuantities,
  parseItemInput,
} from "../lib/itemInput";
import {
  buildPublishedState,
  diffSharedState,
  hasSharedChanges,
  indexSharedItems,
  mergeOwnerPublish,
  readPublishedState,
  writePublishedState,
  type PublishedState,
} from "../lib/sharedSync";
import { commitSharedListMutation } from "../lib/sharedListMutations";
import {
  commitBatchOperations,
  getItemListId,
  getItemListName,
  getSharedItemContentKey,
  getSharedItemKey,
  groupItemsByCategory,
  normalizeShoppingItem,
  normalizeSharedListSnapshot,
  PERSONAL_LIST_ID,
  PERSONAL_LIST_NAME,
  toSharedItemPayload,
  type ShoppingItem,
} from "../lib/shoppingItem";
import {
  clearGuestItems,
  guestMigrationNotice,
  readGuestItems,
} from "../lib/guestItems";
import { formatShareCode } from "../lib/shareCode";
import {
  LIST_SORT_MODES,
  nextTopSortOrder,
  readDoneCollapsed,
  readListSortMode,
  writeDoneCollapsed,
  writeListSortMode,
  type ListSortMode,
} from "../lib/listOrder";
import { useAuth } from "../context/useAuth";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useItemReorder } from "../hooks/useItemReorder";
import { useDarkMode } from "../hooks/useDarkMode";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import BrandMark from "./BrandMark";
import ConfirmDialog, { type ConfirmAction } from "./ConfirmDialog";
import DismissibleMessage from "./DismissibleMessage";
import NavAccountMenu from "./NavAccountMenu";
import SettingsDialog from "./SettingsDialog";
import ShareDialog, { type ShareDialogTab } from "./ShareDialog";
import { CATEGORY_DATALIST_ID } from "./ItemRow";
import {
  startReminderWatch,
  syncReminderSchedule,
} from "../lib/reminderNotifications";
import { shoppingDayBanner } from "../lib/shoppingReminders";
import { notifyShareListChange } from "../lib/shareChangeNotifications";
import {
  isOwnedCustomListId,
  isSharedImportListId,
  MAX_CUSTOM_LISTS,
  sharedOwnerIdFromListId,
} from "../lib/userLists";
import { usePreferences } from "../context/usePreferences";
import { useItemSuggestions } from "../hooks/useItemSuggestions";
import { useOwnedLists } from "../hooks/useOwnedLists";
import { useShoppingItems } from "../hooks/useShoppingItems";
import { useListView } from "../hooks/useListView";
import { useItemActions } from "../hooks/useItemActions";
import { useSharedList } from "../hooks/useSharedList";
import AddItemField from "./AddItemField";
import ListAdminControls from "./ListAdminControls";
import ListTabs from "./ListTabs";
import ShoppingListItems from "./ShoppingListItems";

interface PendingDelete {
  item: ShoppingItem;
  timeoutId: number;
}

const ShoppingList: React.FC = () => {
  const { user, logout } = useAuth();
  const { shareId } = useParams();
  const navigate = useNavigate();
  const { dark, toggle: toggleDark } = useDarkMode();
  const { canInstall, install } = useInstallPrompt();
  const online = useOnlineStatus();
  const [actionError, setActionError] = useState("");
  const { items, setItems, loaded: itemsLoaded } = useShoppingItems(
    user?.uid,
    setActionError,
  );
  const [newItem, setNewItem] = useState("");
  const history = useItemSuggestions(newItem);
  const lists = useOwnedLists(user?.uid, items);
  const { activeListId, setActiveListId, activeTabName, tabs: listTabs } =
    lists;
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { interfacePrefs, reminderSettings } = usePreferences();
  const [shareTab, setShareTab] = useState<ShareDialogTab>("share");

  const openShareDialog = (tab: ShareDialogTab = "share") => {
    setShareTab(tab);
    setShareOpen(true);
  };
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );
  const [sortMode, setSortMode] = useState<ListSortMode>(readListSortMode);
  const [doneCollapsed, setDoneCollapsed] = useState(readDoneCollapsed);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
    null,
  );
  const handledShareId = useRef<string | null>(null);
  const guestMigratedRef = useRef(false);
  const addInputRef = useRef<HTMLInputElement | null>(null);
  // The snapshot we last pushed to sharedLists/{uid}. Everything the
  // collaborator listener does is measured against this, never against the
  // live list — see src/lib/sharedSync.ts for why.
  const publishedRef = useRef<PublishedState | null>(
    user ? readPublishedState(user.uid) : null,
  );
  // Latest personal items, readable from the listener without making the
  // subscription tear down and replay on every keystroke.
  const personalItemsRef = useRef<ShoppingItem[]>([]);

  useEffect(() => {
    return () => {
      if (pendingDelete) window.clearTimeout(pendingDelete.timeoutId);
    };
  }, [pendingDelete]);

  useEffect(() => {
    if (!notice) return undefined;

    const timeoutId = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const showListTabs = listTabs.length > 1;

  /** Owned list published to collaborators — always My List (keeps share simple). */
  const personalItems = useMemo(
    () => items.filter((item) => getItemListId(item) === PERSONAL_LIST_ID),
    [items],
  );

  const ownerName =
    user?.displayName?.trim() || user?.email?.split("@")[0] || "Shared user";
  const {
    isSharing,
    permissions,
    allowAnonymousEdits,
    shareCode,
    shareUrl,
    shareStatus,
    shareBusy,
    setShareStatus,
    startSharing,
    togglePermission,
    toggleAnonymousEdits,
    stopSharing,
  } = useSharedList({
    firestore: db,
    user,
    ownerName,
    items: personalItems.map(toSharedItemPayload),
    onError: setActionError,
    onStopped: () => setShareOpen(false),
  });
  const allowEdits = hasAnyPermission(permissions);

  useEffect(() => {
    if (isSharing && user && !publishedRef.current) {
      publishedRef.current = readPublishedState(user.uid);
    }
  }, [isSharing, user]);

  // Guest mode lives only on this device. When the same person signs in, fold
  // those rows into their cloud list once so they never lose a half-built shop.
  useEffect(() => {
    if (!user || !db || !itemsLoaded || guestMigratedRef.current) return;
    guestMigratedRef.current = true;

    const guestItems = readGuestItems();
    if (guestItems.length === 0) return;

    const personalByKey = new Map(
      personalItems.map((item) => [getDuplicateKey(item.text), item]),
    );

    void (async () => {
      let added = 0;
      let merged = 0;

      try {
        for (const guest of guestItems) {
          const key = getDuplicateKey(guest.text);
          const existing = personalByKey.get(key);

          if (existing) {
            const nextQuantity = mergeQuantities(
              existing.quantity,
              guest.quantity,
            );
            const updates: Record<string, unknown> = {};

            if (nextQuantity !== existing.quantity) {
              updates.quantity = nextQuantity ?? deleteField();
            }
            // Prefer "still needed" if the guest copy was unchecked.
            if (existing.completed && !guest.completed) {
              updates.completed = false;
            }
            if (!existing.category && guest.category) {
              updates.category = guest.category;
            }
            if (!existing.note && guest.note) {
              updates.note = guest.note;
            }

            if (Object.keys(updates).length > 0) {
              await updateDoc(doc(db, "shoppingItems", existing.id), updates);
              merged += 1;
            }
          } else {
            await addDoc(collection(db, "shoppingItems"), {
              text: guest.text,
              completed: guest.completed,
              userId: user.uid,
              ...(guest.quantity ? { quantity: guest.quantity } : {}),
              ...(guest.category ? { category: guest.category } : {}),
              ...(guest.note ? { note: guest.note } : {}),
              ...(guest.important ? { important: true } : {}),
              ...(typeof guest.sortOrder === "number"
                ? { sortOrder: guest.sortOrder }
                : {}),
              listId: PERSONAL_LIST_ID,
              listName: PERSONAL_LIST_NAME,
              createdAt: serverTimestamp(),
            });
            personalByKey.set(key, {
              id: `pending-${key}`,
              text: guest.text,
              completed: guest.completed,
              userId: user.uid,
              quantity: guest.quantity,
              category: guest.category,
              note: guest.note,
              important: guest.important,
              sortOrder: guest.sortOrder,
            });
            added += 1;
          }
        }

        clearGuestItems();
        setNotice(guestMigrationNotice(added, merged));
      } catch (error) {
        console.error("Guest list migration error:", error);
        guestMigratedRef.current = false;
        setActionError(
          "Couldn't import your guest list. It is still saved on this device.",
        );
      }
    })();
    // Only when the first cloud snapshot lands — not on every item change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot
  }, [user, itemsLoaded]);

  useEffect(() => {
    if (!isSharing || !itemsLoaded || !user || !db) return;
    const firestore = db;

    const timeout = window.setTimeout(() => {
      const published = personalItems.map(toSharedItemPayload);
      const listRef = doc(firestore, "sharedLists", user.uid);
      const lastPublished = publishedRef.current;

      void runTransaction(firestore, async (transaction) => {
        const snapshot = await transaction.get(listRef);
        const remoteItems = snapshot.exists()
          ? normalizeSharedListSnapshot(snapshot.data())?.items ?? []
          : [];
        const itemsToWrite =
          snapshot.exists() && lastPublished
            ? mergeOwnerPublish(published, lastPublished, remoteItems)
            : published;

        // Record before commit: the listener echo must match what we wrote.
        publishedRef.current = buildPublishedState(itemsToWrite);
        writePublishedState(user.uid, publishedRef.current);

        transaction.set(listRef, {
          ownerId: user.uid,
          ownerName,
          allowEdits,
          // set() replaces the whole doc, so the anonymous flag must ride along
          // or every auto-sync would silently switch it off.
          allowAnonymousEdits: allowEdits && allowAnonymousEdits,
          permissions,
          items: itemsToWrite,
          ...(shareCode ? { shareCode } : {}),
          updatedAt: serverTimestamp(),
        });
      }).catch((error) => {
        console.error("Auto share sync error:", error);
      });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [
    allowEdits,
    allowAnonymousEdits,
    permissions,
    itemsLoaded,
    ownerName,
    personalItems,
    isSharing,
    shareCode,
    user,
  ]);

  // Keep the newest personal items reachable from the collaborator listener
  // without re-subscribing (and replaying a stale snapshot) on every change.
  useEffect(() => {
    personalItemsRef.current = personalItems;
  }, [personalItems]);

  // Collaborators write to the same shared document the owner publishes to, so
  // pull their changes back into the owner's own items. Only differences from
  // the snapshot *we* last published count as theirs: comparing against the
  // live list instead would treat the owner's own un-published edits and
  // deletions as collaborator activity and undo them.
  useEffect(() => {
    if (!isSharing || !allowEdits || !user || !db) return;
    const firestore = db;

    const unsubscribe = onSnapshot(
      doc(firestore, "sharedLists", user.uid),
      (snapshot) => {
        if (!snapshot.exists()) return;

        const shared = normalizeSharedListSnapshot(snapshot.data());
        if (!shared) return;

        const remoteState = buildPublishedState(shared.items);
        const published = publishedRef.current;

        // Nothing to compare against yet (first ever share, or storage was
        // cleared). Adopt what is on the server as the baseline instead of
        // guessing who changed what.
        if (!published) {
          publishedRef.current = remoteState;
          writePublishedState(user.uid, remoteState);
          return;
        }

        const diff = diffSharedState(published, remoteState);
        if (!hasSharedChanges(diff)) return;

        const sharedByKey = indexSharedItems(shared.items);
        const personalByKey = new Map<string, ShoppingItem>();
        // Index by stable id and by content so legacy shared docs (no id)
        // still match personal rows after we started publishing ids.
        personalItemsRef.current.forEach((item) => {
          personalByKey.set(getSharedItemKey(item), item);
          personalByKey.set(getSharedItemContentKey(item), item);
        });

        // Accept the collaborator's version as the new baseline up front, so a
        // second snapshot for the same change cannot apply it twice.
        publishedRef.current = remoteState;
        writePublishedState(user.uid, remoteState);

        const changeCount =
          diff.toggled.length + diff.added.length + diff.removed.length;
        void notifyShareListChange({
          enabled: interfacePrefs.shareChangeNotices,
          ownerId: user.uid,
          ownerName: "Someone",
          changeCount,
        });

        if (permissions.toggle) {
          diff.toggled.forEach(({ key, completed }) => {
            const item = personalByKey.get(key);
            if (!item || item.completed === completed) return;

            updateDoc(doc(firestore, "shoppingItems", item.id), { completed }).catch(
              (error) => {
                console.error("Collaborator toggle sync-back error:", error);
              },
            );
          });
        }

        if (permissions.add) {
          diff.added.forEach((key) => {
            const sharedItem = sharedByKey.get(key);
            if (!sharedItem || personalByKey.has(key)) return;

            addDoc(collection(firestore, "shoppingItems"), {
              text: sharedItem.text,
              completed: sharedItem.completed,
              userId: user.uid,
              ...(sharedItem.quantity ? { quantity: sharedItem.quantity } : {}),
              ...(sharedItem.category ? { category: sharedItem.category } : {}),
              ...(sharedItem.note ? { note: sharedItem.note } : {}),
              ...(sharedItem.important ? { important: true } : {}),
              listId: PERSONAL_LIST_ID,
              listName: PERSONAL_LIST_NAME,
              createdAt: serverTimestamp(),
            }).catch((error) => {
              console.error("Collaborator add sync-back error:", error);
            });
          });
        }

        if (permissions.remove) {
          diff.removed.forEach((key) => {
            const item = personalByKey.get(key);
            if (!item) return;

            deleteDoc(doc(firestore, "shoppingItems", item.id)).catch((error) => {
              console.error("Collaborator remove sync-back error:", error);
            });
          });
        }
      },
      (error) => {
        console.error("Collaborator listener error:", error);
      },
    );

    return unsubscribe;
  }, [allowEdits, interfacePrefs.shareChangeNotices, permissions, isSharing, user]);

  useEffect(() => {
    if (
      !shareId ||
      !user ||
      !db ||
      importing ||
      handledShareId.current === shareId
    )
      return;
    const firestore = db;

    const importSharedList = async () => {
      handledShareId.current = shareId;
      setImporting(true);
      setNotice("");
      setActionError("");

      try {
        const snapshot = await getDoc(doc(firestore, "sharedLists", shareId));
        if (!snapshot.exists()) {
          setActionError("That shared list is no longer available.");
          navigate("/", { replace: true });
          return;
        }

        const data = normalizeSharedListSnapshot(snapshot.data());
        if (!data) {
          setActionError("That shared list is not valid anymore.");
          navigate("/", { replace: true });
          return;
        }

        const sharedOwnerName = data.ownerName;
        const sharedItems = data.items;
        if (data.ownerId === user.uid) {
          setActionError("This is your own share code.");
          navigate("/", { replace: true });
          return;
        }

        const importedListId = `shared:${data.ownerId}`;
        const existingItems = await getDocs(
          query(
            collection(firestore, "shoppingItems"),
            where("userId", "==", user.uid),
          ),
        );

        const operations: Array<(batch: WriteBatch) => void> = [];
        existingItems.forEach((itemDoc) => {
          const item = normalizeShoppingItem(itemDoc.id, itemDoc.data());
          if (item && getItemListId(item) === importedListId) {
            operations.push((batch) =>
              batch.delete(doc(firestore, "shoppingItems", itemDoc.id)),
            );
          }
        });

        sharedItems.forEach((item) => {
          const itemRef = doc(collection(firestore, "shoppingItems"));
          operations.push((batch) =>
            batch.set(itemRef, {
              text: item.text,
              completed: item.completed,
              userId: user.uid,
              ...(item.quantity ? { quantity: item.quantity } : {}),
              ...(item.category ? { category: item.category } : {}),
              ...(item.note ? { note: item.note } : {}),
              listId: importedListId,
              listName: sharedOwnerName,
              sharedFromUserId: data.ownerId,
              ...(item.id ? { sharedSourceItemId: item.id } : {}),
              createdAt: serverTimestamp(),
            }),
          );
        });

        await commitBatchOperations(firestore, operations);
        setActiveListId(importedListId);
        setNotice(`${sharedOwnerName}'s list was added to your tabs.`);
        navigate("/", { replace: true });
      } catch (error) {
        console.error("Import shared list error:", error);
        setActionError(
          "Unable to import that shared list right now. Please try again.",
        );
        navigate("/", { replace: true });
      } finally {
        setImporting(false);
      }
    };

    void importSharedList();
  }, [importing, navigate, setActiveListId, shareId, user]);

  // Propagate a change made on an imported (shared) item back to the owner's
  // shared list document, so collaboration works the same whether you're
  // signed in (editing via a tab) or signed out (editing the public page).
  // Honors the owner's current permissions; silently no-ops if not allowed.
  const propagateToSharedOwner = async (
    item: ShoppingItem,
    change: "toggle" | "remove" | "add" | "edit",
    nextCompleted?: boolean,
    editedItem?: ShoppingItem,
  ) => {
    if (!db || !item.sharedFromUserId) return;

    const target = {
      id: item.id,
      sharedSourceItemId: item.sharedSourceItemId,
      text: item.text,
      quantity: item.quantity,
      category: item.category,
    };

    try {
      await commitSharedListMutation(
        db,
        item.sharedFromUserId,
        change === "add"
          ? { type: "add", item: toSharedItemPayload(item) }
          : change === "remove"
            ? { type: "remove", target }
            : change === "edit" && editedItem
              ? {
                  type: "replace",
                  target,
                  item: toSharedItemPayload(editedItem),
                }
              : {
                  type: "setCompleted",
                  target,
                  completed: nextCompleted ?? !item.completed,
                },
      );
    } catch (error) {
      console.error("Propagate to shared owner error:", error);
    }
  };

  const currentListItems = useMemo(
    () => items.filter((item) => getItemListId(item) === activeListId),
    [activeListId, items],
  );

  // What "2 milk" will actually become, so the smart input is never a surprise.
  const preview = useMemo(() => parseItemInput(newItem), [newItem]);
  const duplicateItem = useMemo(() => {
    if (!preview.text) return undefined;
    const key = getDuplicateKey(preview.text);
    return currentListItems.find((item) => getDuplicateKey(item.text) === key);
  }, [currentListItems, preview.text]);

  /**
   * Add what the customer typed or picked. Adding something already on the
   * list bumps that row instead of creating a near-identical duplicate.
   */
  const commitAdd = async (input: {
    text: string;
    quantity?: string;
    category?: string;
    note?: string;
  }) => {
    if (!user || !db) return;
    const text = input.text.trim();
    if (!text) return;

    const key = getDuplicateKey(text);
    const existing = currentListItems.find(
      (item) => getDuplicateKey(item.text) === key,
    );

    try {
      setActionError("");

      if (existing) {
        const nextQuantity = mergeQuantities(existing.quantity, input.quantity);
        await updateDoc(doc(db, "shoppingItems", existing.id), {
          completed: false,
          quantity: nextQuantity ?? deleteField(),
          ...(input.category && !existing.category
            ? { category: input.category }
            : {}),
          ...(input.note && !existing.note ? { note: input.note } : {}),
        });

        if (existing.completed && existing.sharedFromUserId) {
          void propagateToSharedOwner(existing, "toggle", false);
        }

        history.remember({
          text: existing.text,
          category: existing.category ?? input.category,
          note: existing.note ?? input.note,
        });

        setNotice(
          nextQuantity
            ? `${existing.text} was already on your list — now ${formatQuantity(nextQuantity)}.`
            : `${existing.text} is already on your list.`,
        );
        setNewItem("");
        return;
      }

      const sharedFromUserId = sharedOwnerIdFromListId(activeListId);
      const sortOrder = nextTopSortOrder(
        currentListItems.filter((item) => !item.completed),
      );

      await addDoc(collection(db, "shoppingItems"), {
        text,
        completed: false,
        userId: user.uid,
        ...(input.quantity ? { quantity: input.quantity } : {}),
        ...(input.category ? { category: input.category } : {}),
        ...(input.note ? { note: input.note } : {}),
        listId: activeListId,
        listName: activeTabName,
        ...(sharedFromUserId ? { sharedFromUserId } : {}),
        sortOrder,
        createdAt: serverTimestamp(),
      });

      if (sharedFromUserId) {
        void propagateToSharedOwner(
          {
            id: "",
            text,
            completed: false,
            userId: user.uid,
            quantity: input.quantity,
            category: input.category,
            note: input.note,
            sharedFromUserId,
          },
          "add",
        );
      }

      history.remember({
        text,
        category: input.category,
        note: input.note,
      });
      setNewItem("");
    } catch (error) {
      console.error("Add item error:", error);
      setActionError("Unable to add that item right now. Please try again.");
    }
  };

  const toggleComplete = async (
    id: string,
    completed: boolean,
    item?: ShoppingItem,
  ) => {
    if (!db) return;

    try {
      setActionError("");
      await updateDoc(doc(db, "shoppingItems", id), { completed: !completed });
      // Checking off reinforces staples for typeahead.
      if (!completed && item) {
        history.remember({
          text: item.text,
          category: item.category,
          note: item.note,
        });
      }
      if (item?.sharedFromUserId) {
        void propagateToSharedOwner(item, "toggle", !completed);
      }
    } catch (error) {
      console.error("Update item error:", error);
      setActionError("Unable to update this item right now. Please try again.");
    }
  };

  const toggleImportant = async (id: string, important: boolean) => {
    if (!db) return;

    try {
      setActionError("");
      await updateDoc(doc(db, "shoppingItems", id), {
        important: important ? deleteField() : true,
      });
    } catch (error) {
      console.error("Toggle important error:", error);
      setActionError("Unable to update this item right now. Please try again.");
    }
  };

  const deleteItem = async (id: string) => {
    if (!db) return;

    const item = items.find((currentItem) => currentItem.id === id);
    if (!item) return;

    if (pendingDelete) {
      window.clearTimeout(pendingDelete.timeoutId);
      setPendingDelete(null);
    }

    try {
      setActionError("");
      await deleteDoc(doc(db, "shoppingItems", id));
      if (item.sharedFromUserId) {
        void propagateToSharedOwner(item, "remove");
      }
      const timeoutId = window.setTimeout(() => {
        setPendingDelete((current) =>
          current?.item.id === id ? null : current,
        );
      }, 6000);
      setPendingDelete({ item, timeoutId });
    } catch (error) {
      console.error("Delete item error:", error);
      setActionError("Unable to remove this item right now. Please try again.");
    }
  };

  const undoDeleteItem = async () => {
    if (!db || !pendingDelete || !user) return;

    const { item, timeoutId } = pendingDelete;
    window.clearTimeout(timeoutId);
    setPendingDelete(null);

    // Build a rules-safe payload. Always use the signed-in uid (not a stale
    // snapshot field) and serverTimestamp for createdAt — replaying a cached
    // Timestamp has caused restore failures in the wild.
    const payload: Record<string, unknown> = {
      text: item.text,
      completed: item.completed,
      userId: user.uid,
      listId: getItemListId(item),
      listName: getItemListName(item),
      createdAt: serverTimestamp(),
    };
    if (item.quantity) payload.quantity = item.quantity;
    if (item.category) payload.category = item.category;
    if (item.note) payload.note = item.note;
    if (item.sharedFromUserId) payload.sharedFromUserId = item.sharedFromUserId;
    if (item.important === true) payload.important = true;
    if (typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder)) {
      payload.sortOrder = item.sortOrder;
    }

    try {
      setActionError("");
      const itemRef = doc(db, "shoppingItems", item.id);

      // Existence check is best-effort only — never block restore if getDoc fails.
      try {
        const existing = await getDoc(itemRef);
        if (existing.exists()) {
          setNotice("That item is already back on your list.");
          return;
        }
      } catch (lookupError) {
        console.warn("Undo existence check failed; continuing restore:", lookupError);
      }

      try {
        await setDoc(itemRef, payload);
      } catch (writeError) {
        // If the original id cannot be recreated (rules/offline race), fall back
        // to a fresh document so the user still gets their item back.
        console.warn("Undo setDoc failed; falling back to addDoc:", writeError);
        await addDoc(collection(db, "shoppingItems"), payload);
      }

      // The delete was pushed to the list owner, so the undo has to be too —
      // otherwise the item comes back here and stays gone for everyone else.
      if (item.sharedFromUserId) {
        void propagateToSharedOwner(item, "add");
      }
    } catch (error) {
      console.error("Undo delete item error:", error);
      setActionError(
        "Unable to restore that item right now. Please try again.",
      );
    }
  };

  const updateItemDetails = async (
    id: string,
    text: string,
    quantity: string,
    category: string,
    note: string,
  ) => {
    const trimmed = text.trim();
    const normalizedQuantity = quantity.trim().slice(0, MAX_QUANTITY_LENGTH);
    const normalizedCategory = category.trim().slice(0, MAX_CATEGORY_LENGTH);
    const normalizedNote = note.trim().slice(0, MAX_NOTE_LENGTH);
    if (!trimmed) {
      setActionError("Item text cannot be empty.");
      return false;
    }
    if (!db) return false;
    if (trimmed.length > MAX_ITEM_TEXT_LENGTH) {
      setActionError(
        `Keep items to ${MAX_ITEM_TEXT_LENGTH} characters or fewer.`,
      );
      return false;
    }

    try {
      setActionError("");
      const original = items.find((item) => item.id === id);
      await updateDoc(doc(db, "shoppingItems", id), {
        text: trimmed,
        quantity: normalizedQuantity || deleteField(),
        category: normalizedCategory || deleteField(),
        note: normalizedNote || deleteField(),
      });

      if (original?.sharedFromUserId) {
        await propagateToSharedOwner(
          original,
          "edit",
          undefined,
          {
            ...original,
            text: trimmed,
            quantity: normalizedQuantity || undefined,
            category: normalizedCategory || undefined,
            note: normalizedNote || undefined,
          },
        );
      }
      return true;
    } catch (error) {
      console.error("Update item details error:", error);
      setActionError("Unable to save your edit right now. Please try again.");
      return false;
    }
  };

  const { edit } = useItemActions(updateItemDetails);

  const commitNewList = async (name: string) => {
    const result = await lists.createList(name);
    if ("error" in result) {
      setActionError(result.error);
      return;
    }
    setNotice(`Created “${result.list.name}”.`);
  };

  const commitRenameList = async (name: string) => {
    const result = await lists.renameActive(name);
    if ("error" in result) {
      setActionError(result.error);
      return;
    }
    if (db && result.name) {
      const firestore = db;
      const listId = result.listId;
      const toRename = items.filter((item) => getItemListId(item) === listId);
      try {
        await commitBatchOperations(
          firestore,
          toRename.map(
            (item) => (batch) =>
              batch.update(doc(firestore, "shoppingItems", item.id), {
                listName: result.name,
              }),
          ),
        );
      } catch (error) {
        console.error("Rename list items error:", error);
      }
    }
  };

  const deleteActiveCustomList = async () => {
    const listId = activeListId;
    if (!isOwnedCustomListId(listId)) return;
    const toDelete = items.filter((item) => getItemListId(item) === listId);

    try {
      setActionError("");
      if (db && toDelete.length > 0) {
        const firestore = db;
        await commitBatchOperations(
          firestore,
          toDelete.map(
            (item) => (batch) =>
              batch.delete(doc(firestore, "shoppingItems", item.id)),
          ),
        );
      }
      await lists.removeActive();
      setNotice("List deleted.");
    } catch (error) {
      console.error("Delete custom list error:", error);
      setActionError("Unable to delete that list right now. Please try again.");
    }
  };

  const clearCompleted = async () => {
    if (!db) return;
    const firestore = db;

    const done = currentListItems.filter((item) => item.completed);
    if (done.length === 0) return;

    try {
      setActionError("");
      await commitBatchOperations(
        firestore,
        done.map(
          (item) => (batch) => batch.delete(doc(firestore, "shoppingItems", item.id)),
        ),
      );

      // Clearing an imported list must mean the same thing to everyone using
      // it, not just remove this device's local copies.
      await Promise.all(
        done
          .filter((item) => item.sharedFromUserId)
          .map((item) => propagateToSharedOwner(item, "remove")),
      );
    } catch (error) {
      console.error("Clear completed error:", error);
      setActionError(
        "Unable to clear completed items right now. Please try again.",
      );
    }
  };

  const removeActiveSharedList = async () => {
    if (!db || activeListId === PERSONAL_LIST_ID) return;
    const firestore = db;

    try {
      setActionError("");
      await commitBatchOperations(
        firestore,
        currentListItems.map(
          (item) => (batch) => batch.delete(doc(firestore, "shoppingItems", item.id)),
        ),
      );
      setActiveListId(PERSONAL_LIST_ID);
      setNotice("");
    } catch (error) {
      console.error("Remove shared list error:", error);
      setActionError(
        "Unable to remove that shared list right now. Please try again.",
      );
    }
  };

  const runConfirmedAction = async () => {
    const action = confirmAction;
    setConfirmAction(null);

    if (action === "clearCompleted") await clearCompleted();
    if (action === "removeSharedList") await removeActiveSharedList();
    if (action === "deleteCustomList") await deleteActiveCustomList();
    if (action === "stopSharing") await stopSharing();
  };

  // Transient feedback under the QR code. Without the timeout "Link copied"
  // sat there permanently and hid the live-sync status it replaced.
  const flashShareStatus = (message: string) => {
    setShareStatus(message);
    window.setTimeout(() => {
      setShareStatus((current) => (current === message ? "" : current));
    }, 2500);
  };

  const copyShareLink = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      flashShareStatus("Link copied");
    } catch {
      // Clipboard access needs a secure context and permission. The link is
      // shown in full in the dialog, so this is a nudge, not a dead end.
      flashShareStatus("Press and hold the link to copy it");
    }
  };

  const copyShareCode = async () => {
    if (!shareCode) return;

    try {
      await navigator.clipboard.writeText(formatShareCode(shareCode));
      flashShareStatus("Code copied");
    } catch {
      flashShareStatus("Long-press the code to copy it");
    }
  };

  // Phones have a proper share sheet; use it when the browser offers one so
  // sending a list to someone is one tap instead of copy-then-find-an-app.
  const shareViaSystem = async () => {
    if ((!shareUrl && !shareCode) || typeof navigator.share !== "function")
      return;

    const codeLabel = shareCode ? formatShareCode(shareCode) : "";
    try {
      await navigator.share({
        title: `${ownerName}'s shopping list`,
        text: codeLabel
          ? `My CartLink list code: ${codeLabel}${shareUrl ? `\n${shareUrl}` : ""}`
          : "Here's my shopping list on CartLink",
        url: shareUrl || undefined,
      });
    } catch (error) {
      // A cancelled share sheet is a normal outcome, not a failure.
      if ((error as { name?: string })?.name === "AbortError") return;
      console.error("System share error:", error);
      flashShareStatus("Couldn't open the share sheet");
    }
  };

  // One field does both: typing filters the list; Enter / + adds the item.
  const {
    activeItems,
    doneItems,
    doneGroups,
    activeCount,
    filteredCount,
    allDoneCount,
    totalCount,
    isSearching,
    progress,
    statsLeft,
    statsDone,
  } = useListView(currentListItems, newItem, sortMode);

  const reorderEnabled =
    !newItem.trim() && sortMode !== "alpha" && activeCount > 1;

  const { reorderState, displayActiveItems, resetDrag } =
    useItemReorder<ShoppingItem>({
      activeItems,
      sortMode,
      enabled: reorderEnabled,
      canReorder: () => Boolean(user) && !newItem.trim(),
      onCommitOrder: async ({ orders, scopeItems, changed }) => {
        const orderById = new Map(
          orders.map((entry) => [entry.id, entry.sortOrder]),
        );

        setItems((current) =>
          current.map((item) => {
            const sortOrder = orderById.get(item.id);
            return sortOrder === undefined ? item : { ...item, sortOrder };
          }),
        );

        if (!changed || !db || !user) return;
        const firestore = db;
        const touched = scopeItems.filter((item) =>
          orderById.has(item.id),
        );

        try {
          setActionError("");
          await commitBatchOperations(
            firestore,
            touched.map((item) => (batch) => {
              const sortOrder = orderById.get(item.id);
              if (sortOrder === undefined) return;
              batch.update(doc(firestore, "shoppingItems", item.id), {
                sortOrder,
              });
            }),
          );
        } catch (error) {
          console.error("Reorder items error:", error);
          setActionError("Couldn't save the new order. Try again.");
        }
      },
    });

  const displayActiveGroups = useMemo(
    () => groupItemsByCategory(displayActiveItems),
    [displayActiveItems],
  );

  const changeSortMode = (mode: ListSortMode) => {
    setSortMode(mode);
    writeListSortMode(mode);
    resetDrag();
  };

  const toggleDoneCollapsed = () => {
    setDoneCollapsed((current) => {
      const next = !current;
      writeDoneCollapsed(next);
      return next;
    });
  };

  // Aisle suggestions while editing: the customer's own categories first, then
  // the built-in aisles.
  const categorySuggestions = useMemo(() => {
    const used = new Set(
      items
        .map((item) => item.category)
        .filter((category): category is string => Boolean(category)),
    );
    AISLES.forEach((aisle) => used.add(aisle));
    return Array.from(used).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const modalOpen =
    shareOpen || settingsOpen || confirmAction !== null;

  const reminderBanner = useMemo(() => {
    if (!interfacePrefs.shoppingBanners) return null;
    return shoppingDayBanner(reminderSettings);
  }, [interfacePrefs.shoppingBanners, reminderSettings]);

  // Keep shopping reminders armed while the list is open.
  useEffect(() => {
    void syncReminderSchedule(reminderSettings);
    return startReminderWatch(() => reminderSettings);
  }, [reminderSettings]);

  useEffect(() => {
    if (!modalOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (confirmAction) setConfirmAction(null);
      else if (settingsOpen) setSettingsOpen(false);
      else setShareOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [confirmAction, modalOpen, settingsOpen]);

  // Keyboard shortcuts: "/" or "n" focuses the add/search field.
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (modalOpen || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "/" && event.key !== "n") return;

      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      event.preventDefault();
      addInputRef.current?.focus();
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [modalOpen]);

  if (!itemsLoaded || importing) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        {importing ? <p>Adding list…</p> : null}
      </div>
    );
  }

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
              onClick={() => openShareDialog("share")}
              className={`theme-toggle share-button ${isSharing ? "is-sharing" : ""}`}
              title="Share & join"
              type="button"
              aria-label={
                isSharing
                  ? "Share and join (sharing is on)"
                  : "Share and join"
              }
            >
              <Share2 size={16} />
              {isSharing && (
                <span className="share-button-dot" aria-hidden="true" />
              )}
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
          </div>
        </div>
      </header>

      <main className="container">
        <div className="page-heading">
          <h1 className="page-title">{activeTabName}</h1>
          {notice && (
            <DismissibleMessage
              kind="success"
              message={notice}
              onDismiss={() => setNotice("")}
            />
          )}
          {actionError && (
            <DismissibleMessage
              kind="error"
              message={actionError}
              onDismiss={() => setActionError("")}
            />
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
          listboxId="item-suggestions"
          value={newItem}
          onValueChange={setNewItem}
          onCommit={commitAdd}
          suggestions={history}
          inputRef={addInputRef}
          describedBy="add-hint"
          hintHidden={!interfacePrefs.addHints && !isSearching}
          hint={
            duplicateItem ? (
              <>
                <strong>{duplicateItem.text}</strong> is already here — adding
                bumps the quantity.
              </>
            ) : isSearching && totalCount > 0 ? (
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
          {categorySuggestions.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>

        <ListTabs
          tabs={listTabs}
          activeId={activeListId}
          onSelect={(id) => {
            setActiveListId(id);
            setNewItem("");
          }}
          canCreate={lists.canCreate}
          onCreate={(name) => {
            void commitNewList(name);
          }}
          onCreateBlocked={() =>
            setActionError(
              `You can have up to ${MAX_CUSTOM_LISTS} custom lists.`,
            )
          }
        />

        {/* Stats + list admin. Admin (rename/delete) must show even on empty
            custom lists — previously totalCount>0 hid Delete forever. */}
        {(totalCount > 0 ||
          isOwnedCustomListId(activeListId) ||
          isSharedImportListId(activeListId)) && (
          <div className="list-summary">
            <div className="list-meta-row">
              <span className="stats-text">
                {totalCount === 0 ? (
                  <>Empty list</>
                ) : isSearching ? (
                  <>
                    <strong>{filteredCount}</strong> match
                    {filteredCount === 1 ? "" : "es"}
                    {statsDone > 0 && ` · ${statsDone} done`}
                  </>
                ) : (
                  <>
                    <strong>{statsLeft}</strong> left
                    {statsDone > 0 && ` · ${statsDone} done`}
                  </>
                )}
              </span>

              {totalCount > 0 && (
                <div
                  className="sort-toggle"
                  role="group"
                  aria-label="Sort list"
                >
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
                      onClick={() => changeSortMode(mode.id)}
                    >
                      {mode.shortLabel}
                    </button>
                  ))}
                </div>
              )}

              <ListAdminControls
                key={activeListId}
                listId={activeListId}
                listName={activeTabName}
                isOwnedCustom={isOwnedCustomListId(activeListId)}
                isSharedImport={isSharedImportListId(activeListId)}
                showClearDone={allDoneCount > 0 && !isSearching}
                onClearDone={() => setConfirmAction("clearCompleted")}
                onRename={(name) => {
                  void commitRenameList(name);
                }}
                onRequestDelete={() => setConfirmAction("deleteCustomList")}
                onRequestRemoveShared={() =>
                  setConfirmAction("removeSharedList")
                }
              />
            </div>
            {totalCount > 0 && !isSearching && interfacePrefs.progressBar && (
              <div
                className="progress-track"
                role="progressbar"
                aria-label={`${allDoneCount} of ${totalCount} items picked up`}
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
            activeItems={displayActiveItems}
            doneItems={doneItems}
            activeGroups={displayActiveGroups}
            doneGroups={doneGroups}
            sortMode={sortMode}
            edit={edit}
            reorder={reorderState}
            doneCollapsed={doneCollapsed}
            isSearching={isSearching}
            totalCount={totalCount}
            activeListName={activeTabName}
            emptyTips={interfacePrefs.emptyTips}
            importantStars={interfacePrefs.importantStars}
            customList={isOwnedCustomListId(activeListId)}
            sharedList={isSharedImportListId(activeListId)}
            onToggleDone={toggleDoneCollapsed}
            onToggle={toggleComplete}
            onImportant={toggleImportant}
            onDelete={deleteItem}
            onDeleteList={() => setConfirmAction("deleteCustomList")}
            onRemoveList={() => setConfirmAction("removeSharedList")}
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

      {shareOpen && (
        <ShareDialog
          isSharing={isSharing}
          shareUrl={shareUrl}
          shareCode={shareCode}
          shareStatus={shareStatus}
          busy={shareBusy}
          permissions={permissions}
          allowAnonymousEdits={allowAnonymousEdits}
          initialTab={shareTab}
          sharedListName={PERSONAL_LIST_NAME}
          hasOtherLists={showListTabs}
          onClose={() => setShareOpen(false)}
          onStartSharing={startSharing}
          onCopyLink={copyShareLink}
          onCopyCode={copyShareCode}
          onSystemShare={shareViaSystem}
          onTogglePermission={togglePermission}
          onToggleAnonymousEdits={toggleAnonymousEdits}
          onRequestStopSharing={() => setConfirmAction("stopSharing")}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          userId={user?.uid ?? null}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Confirm must stack above Share (same base z-index would leave it trapped behind). */}
      {confirmAction && (
        <ConfirmDialog
          action={confirmAction}
          itemCount={
            confirmAction === "clearCompleted"
              ? allDoneCount
              : currentListItems.length
          }
          listName={activeTabName}
          busy={shareBusy && confirmAction === "stopSharing"}
          onCancel={() => setConfirmAction(null)}
          onConfirm={runConfirmedAction}
        />
      )}
    </div>
  );
};

export default ShoppingList;
