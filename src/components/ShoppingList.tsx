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
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type WriteBatch,
} from "firebase/firestore";
import {
  ChevronDown,
  ChevronRight,
  Download,
  LogOut,
  Moon,
  PackageOpen,
  Plus,
  Search,
  Share2,
  Sun,
  WifiOff,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase";
import {
  hasAnyPermission,
  NO_PERMISSIONS,
  normalizeSharePermissions,
  type SharePermissions,
} from "../lib/sharePermissions";
import {
  AISLES,
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
  buildPublishedState,
  clearPublishedState,
  diffSharedState,
  hasSharedChanges,
  indexSharedItems,
  readPublishedState,
  writePublishedState,
  type PublishedState,
} from "../lib/sharedSync";
import {
  commitBatchOperations,
  getItemListId,
  getItemListName,
  getSharedItemContentKey,
  getSharedItemKey,
  groupItemsByCategory,
  isRecord,
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
import { allocateShareCode } from "../lib/allocateShareCode";
import {
  buildShareCodeUrl,
  formatShareCode,
  isValidShareCode,
} from "../lib/shareCode";
import {
  assignSequentialOrders,
  compareManualOrder,
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
import { useAuth } from "../context/useAuth";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useDarkMode } from "../hooks/useDarkMode";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import BrandMark from "./BrandMark";
import ConfirmDialog, { type ConfirmAction } from "./ConfirmDialog";
import DismissibleMessage from "./DismissibleMessage";
import ShareDialog, { type ShareDialogTab } from "./ShareDialog";
import UserAvatar from "./UserAvatar";
import {
  CATEGORY_DATALIST_ID,
  CategoryGroup,
  ItemRow,
  type ItemEditState,
  type ItemReorderState,
} from "./ItemRow";

interface ListTab {
  id: string;
  name: string;
}

interface PendingDelete {
  item: ShoppingItem;
  timeoutId: number;
}

// Below this many items, searching is slower than just looking at the list, so
// the field stays out of the way until it earns its place (or "/" is pressed).
const SEARCH_VISIBILITY_THRESHOLD = 8;

const ShoppingList: React.FC = () => {
  const { user, logout } = useAuth();
  const { shareId } = useParams();
  const navigate = useNavigate();
  const { dark, toggle: toggleDark } = useDarkMode();
  const { canInstall, install } = useInstallPrompt();
  const online = useOnlineStatus();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [newItem, setNewItem] = useState("");
  const [search, setSearch] = useState("");
  const [searchPinned, setSearchPinned] = useState(false);
  const [activeListId, setActiveListId] = useState(PERSONAL_LIST_ID);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [actionError, setActionError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTab, setShareTab] = useState<ShareDialogTab>("share");
  const [shareUrl, setShareUrl] = useState("");
  const [shareCode, setShareCode] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [shareBusy, setShareBusy] = useState(false);

  const openShareDialog = (tab: ShareDialogTab = "share") => {
    setShareTab(tab);
    setShareOpen(true);
  };
  const [permissions, setPermissions] =
    useState<SharePermissions>(NO_PERMISSIONS);
  const allowEdits = hasAnyPermission(permissions);
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );
  const [sortMode, setSortMode] = useState<ListSortMode>(readListSortMode);
  const [doneCollapsed, setDoneCollapsed] = useState(readDoneCollapsed);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  // Ref so pointer-up drop always sees the id even before React re-renders.
  const draggingIdRef = useRef<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
    null,
  );
  const handledShareId = useRef<string | null>(null);
  const guestMigratedRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const addInputRef = useRef<HTMLInputElement | null>(null);
  // The snapshot we last pushed to sharedLists/{uid}. Everything the
  // collaborator listener does is measured against this, never against the
  // live list — see src/lib/sharedSync.ts for why.
  const publishedRef = useRef<PublishedState | null>(null);
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

  useEffect(() => {
    if (!user || !db) return;

    const q = query(
      collection(db, "shoppingItems"),
      where("userId", "==", user.uid),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setActionError("");
        const itemsData = snapshot.docs.flatMap((snapshotDoc) => {
          const item = normalizeShoppingItem(
            snapshotDoc.id,
            snapshotDoc.data(),
          );
          return item ? [item] : [];
        });

        itemsData.sort(compareManualOrder);

        setItems(itemsData);
        setItemsLoaded(true);
      },
      (error) => {
        console.error("Snapshot error:", error);
        setActionError(
          "We could not sync your list. Check your connection and try again.",
        );
      },
    );

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;

    const loadShareState = async () => {
      try {
        const snapshot = await getDoc(doc(db, "sharedLists", user.uid));
        if (!snapshot.exists()) return;

        const data = snapshot.data();
        setIsSharing(true);
        setPermissions(normalizeSharePermissions(data?.permissions));

        // Older shares only had a UID URL. Mint a short code once so verbal
        // sharing and the QR both use the same join path.
        let code =
          typeof data?.shareCode === "string" && isValidShareCode(data.shareCode)
            ? data.shareCode
            : "";
        if (!code) {
          code = await allocateShareCode(db, user.uid);
          await updateDoc(doc(db, "sharedLists", user.uid), {
            shareCode: code,
          });
        }

        setShareCode(code);
        setShareUrl(buildShareCodeUrl(window.location.origin, code));
        // Remember what we published last session so collaborator changes made
        // while this app was closed are still recognised as theirs.
        publishedRef.current = readPublishedState(user.uid);
      } catch (error) {
        console.error("Load share state error:", error);
      }
    };

    void loadShareState();
  }, [user]);

  const listTabs = useMemo<ListTab[]>(() => {
    const sharedTabs = new Map<string, string>();

    items.forEach((item) => {
      const listId = getItemListId(item);
      if (listId !== PERSONAL_LIST_ID)
        sharedTabs.set(listId, getItemListName(item));
    });

    return [
      { id: PERSONAL_LIST_ID, name: PERSONAL_LIST_NAME },
      ...Array.from(sharedTabs, ([id, name]) => ({ id, name })),
    ];
  }, [items]);

  useEffect(() => {
    if (!listTabs.some((tab) => tab.id === activeListId)) {
      setActiveListId(PERSONAL_LIST_ID);
    }
  }, [activeListId, listTabs]);

  const personalItems = useMemo(
    () => items.filter((item) => getItemListId(item) === PERSONAL_LIST_ID),
    [items],
  );

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

  const ownerName =
    user?.displayName?.trim() || user?.email?.split("@")[0] || "Shared user";

  useEffect(() => {
    if (!isSharing || !itemsLoaded || !user || !db) return;

    const timeout = window.setTimeout(() => {
      const published = personalItems.map(toSharedItemPayload);

      // Record before the write, not after: the local echo of our own write
      // arrives on the listener first, and it must not look like a change
      // somebody else made.
      publishedRef.current = buildPublishedState(published);
      writePublishedState(user.uid, publishedRef.current);

      Promise.resolve(
        setDoc(doc(db, "sharedLists", user.uid), {
          ownerId: user.uid,
          ownerName,
          allowEdits,
          permissions,
          items: published,
          ...(shareCode ? { shareCode } : {}),
          updatedAt: serverTimestamp(),
        }),
      ).catch((error) => {
        console.error("Auto share sync error:", error);
      });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [
    allowEdits,
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

    const unsubscribe = onSnapshot(
      doc(db, "sharedLists", user.uid),
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

        if (permissions.toggle) {
          diff.toggled.forEach(({ key, completed }) => {
            const item = personalByKey.get(key);
            if (!item || item.completed === completed) return;

            updateDoc(doc(db, "shoppingItems", item.id), { completed }).catch(
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

            addDoc(collection(db, "shoppingItems"), {
              text: sharedItem.text,
              completed: sharedItem.completed,
              userId: user.uid,
              ...(sharedItem.quantity ? { quantity: sharedItem.quantity } : {}),
              ...(sharedItem.category ? { category: sharedItem.category } : {}),
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

            deleteDoc(doc(db, "shoppingItems", item.id)).catch((error) => {
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
  }, [allowEdits, permissions, isSharing, user]);

  useEffect(() => {
    if (
      !shareId ||
      !user ||
      !db ||
      importing ||
      handledShareId.current === shareId
    )
      return;

    const importSharedList = async () => {
      handledShareId.current = shareId;
      setImporting(true);
      setNotice("");
      setActionError("");

      try {
        const snapshot = await getDoc(doc(db, "sharedLists", shareId));
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
            collection(db, "shoppingItems"),
            where("userId", "==", user.uid),
          ),
        );

        const operations: Array<(batch: WriteBatch) => void> = [];
        existingItems.forEach((itemDoc) => {
          const item = normalizeShoppingItem(itemDoc.id, itemDoc.data());
          if (item && getItemListId(item) === importedListId) {
            operations.push((batch) =>
              batch.delete(doc(db, "shoppingItems", itemDoc.id)),
            );
          }
        });

        sharedItems.forEach((item) => {
          const itemRef = doc(collection(db, "shoppingItems"));
          operations.push((batch) =>
            batch.set(itemRef, {
              text: item.text,
              completed: item.completed,
              userId: user.uid,
              ...(item.quantity ? { quantity: item.quantity } : {}),
              ...(item.category ? { category: item.category } : {}),
              listId: importedListId,
              listName: sharedOwnerName,
              sharedFromUserId: data.ownerId,
              createdAt: serverTimestamp(),
            }),
          );
        });

        await commitBatchOperations(db, operations);
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
  }, [importing, navigate, shareId, user]);

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

    try {
      const ownerRef = doc(db, "sharedLists", item.sharedFromUserId);
      const snapshot = await getDoc(ownerRef);
      if (!snapshot.exists()) return;

      const raw = snapshot.data();

      // Permissions live on the raw doc; the local snapshot normalizer drops
      // them, so read them directly here to honor the owner's current settings.
      const ownerPermissions = normalizeSharePermissions(
        isRecord(raw) ? raw.permissions : undefined,
      );
      const ownerAllowsEdits =
        raw?.allowEdits === true && hasAnyPermission(ownerPermissions);
      const permitted =
        change === "toggle"
          ? ownerPermissions.toggle
          : change === "add"
            ? ownerPermissions.add
            : change === "edit"
              ? ownerPermissions.add && ownerPermissions.remove
              : ownerPermissions.remove;
      if (!ownerAllowsEdits || !permitted) return;

      const rawItems = Array.isArray(raw?.items) ? raw.items : [];
      const contentKey = getSharedItemContentKey(item);
      const matchIndex = rawItems.findIndex((rawItem) => {
        const record = isRecord(rawItem) ? rawItem : {};
        // Prefer stable published id so quantity edits still match.
        if (
          item.id &&
          typeof record.id === "string" &&
          record.id === item.id
        ) {
          return true;
        }
        // Fall back to content for older shared docs that never published ids.
        return (
          getSharedItemContentKey({
            text: typeof record.text === "string" ? record.text : "",
            quantity:
              typeof record.quantity === "string" ? record.quantity : undefined,
            category:
              typeof record.category === "string" ? record.category : undefined,
          }) === contentKey
        );
      });

      // Toggle/remove need an existing match; add appends a brand new entry and
      // bails out if the item somehow already exists to avoid duplicates.
      if (change === "add") {
        if (matchIndex !== -1) return;
      } else if (matchIndex === -1) {
        return;
      }

      let workingItems: unknown[];
      if (change === "edit" && editedItem) {
        workingItems = rawItems.map((rawItem, index) =>
          index === matchIndex ? toSharedItemPayload(editedItem) : rawItem,
        );
      } else if (change === "remove") {
        workingItems = rawItems.filter((_raw, index) => index !== matchIndex);
      } else if (change === "add") {
        workingItems = [...rawItems, toSharedItemPayload(item)];
      } else {
        // Use the state we are moving *to* rather than inverting whatever the
        // caller happened to hold, so a toggle can never land the wrong way up.
        const completed = nextCompleted ?? !item.completed;
        workingItems = rawItems.map((rawItem, index) =>
          index === matchIndex
            ? { ...(rawItem as object), completed }
            : rawItem,
        );
      }

      const nextItems = workingItems.map((rawItem) => {
        const record = (
          rawItem && typeof rawItem === "object" ? rawItem : {}
        ) as Record<string, unknown>;
        return toSharedItemPayload({
          id: typeof record.id === "string" ? record.id : undefined,
          text: typeof record.text === "string" ? record.text : "",
          completed: record.completed === true,
          quantity:
            typeof record.quantity === "string" ? record.quantity : undefined,
          category:
            typeof record.category === "string" ? record.category : undefined,
        });
      });

      await updateDoc(ownerRef, {
        items: nextItems,
        updatedAt: serverTimestamp(),
      });
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
   * Add what the customer typed. Adding something already on the list bumps
   * that row instead of creating a near-identical duplicate.
   */
  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !db) return;

    const { text, quantity, category } = parseItemInput(newItem);
    if (!text) return;

    try {
      setActionError("");

      if (duplicateItem) {
        const nextQuantity = mergeQuantities(duplicateItem.quantity, quantity);
        await updateDoc(doc(db, "shoppingItems", duplicateItem.id), {
          completed: false,
          quantity: nextQuantity ?? deleteField(),
        });

        // Un-checking counts as a toggle for the list owner.
        if (duplicateItem.completed && duplicateItem.sharedFromUserId) {
          void propagateToSharedOwner(duplicateItem, "toggle", false);
        }

        setNotice(
          nextQuantity
            ? `${duplicateItem.text} was already on your list — now ${formatQuantity(nextQuantity)}.`
            : `${duplicateItem.text} is already on your list.`,
        );
        setNewItem("");
        return;
      }

      const activeTab = listTabs.find((tab) => tab.id === activeListId);

      // When adding into an imported (shared) tab, carry the owner id so the new
      // item behaves like other shared items (toggle/remove propagate too) and so
      // we can push the addition back to the owner's shared list below.
      const sharedFromUserId = activeListId.startsWith("shared:")
        ? activeListId.slice("shared:".length)
        : undefined;

      const sortOrder = nextTopSortOrder(
        currentListItems.filter((item) => !item.completed),
      );

      await addDoc(collection(db, "shoppingItems"), {
        text,
        completed: false,
        userId: user.uid,
        ...(quantity ? { quantity } : {}),
        ...(category ? { category } : {}),
        listId: activeListId,
        listName: activeTab?.name ?? PERSONAL_LIST_NAME,
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
            quantity,
            category,
            sharedFromUserId,
          },
          "add",
        );
      }

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
      if (item?.sharedFromUserId) {
        void propagateToSharedOwner(item, "toggle", !completed);
      }
    } catch (error) {
      console.error("Update item error:", error);
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
    if (!db || !pendingDelete) return;

    const { item, timeoutId } = pendingDelete;
    window.clearTimeout(timeoutId);
    setPendingDelete(null);

    try {
      setActionError("");
      const itemRef = doc(db, "shoppingItems", item.id);
      // If the row was re-created or edited elsewhere during the undo window,
      // do not overwrite that newer document with the stale snapshot.
      const existing = await getDoc(itemRef);
      if (existing.exists()) {
        setNotice("That item is already back on your list.");
        return;
      }

      await setDoc(itemRef, {
        text: item.text,
        completed: item.completed,
        userId: item.userId,
        ...(item.quantity ? { quantity: item.quantity } : {}),
        ...(item.category ? { category: item.category } : {}),
        listId: getItemListId(item),
        listName: getItemListName(item),
        ...(item.sharedFromUserId
          ? { sharedFromUserId: item.sharedFromUserId }
          : {}),
        ...(typeof item.sortOrder === "number"
          ? { sortOrder: item.sortOrder }
          : {}),
        createdAt: item.createdAt ?? serverTimestamp(),
      });

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
  ) => {
    const trimmed = text.trim();
    const normalizedQuantity = quantity.trim().slice(0, MAX_QUANTITY_LENGTH);
    const normalizedCategory = category.trim().slice(0, MAX_CATEGORY_LENGTH);
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

  const commitEdit = async () => {
    if (!editingId) return;
    const saved = await updateItemDetails(
      editingId,
      editText,
      editQuantity,
      editCategory,
    );
    if (saved) setEditingId(null);
  };

  const edit: ItemEditState = {
    editingId,
    text: editText,
    quantity: editQuantity,
    category: editCategory,
    onStart: (item) => {
      setEditingId(item.id);
      setEditText(item.text);
      setEditQuantity(item.quantity ?? "");
      setEditCategory(item.category ?? "");
    },
    onTextChange: setEditText,
    onQuantityChange: setEditQuantity,
    onCategoryChange: setEditCategory,
    onCommit: commitEdit,
    onCancel: () => setEditingId(null),
  };

  const clearCompleted = async () => {
    if (!db) return;

    const done = currentListItems.filter((item) => item.completed);
    if (done.length === 0) return;

    try {
      setActionError("");
      await commitBatchOperations(
        db,
        done.map(
          (item) => (batch) => batch.delete(doc(db, "shoppingItems", item.id)),
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

    try {
      setActionError("");
      await commitBatchOperations(
        db,
        currentListItems.map(
          (item) => (batch) => batch.delete(doc(db, "shoppingItems", item.id)),
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

  const startSharing = async () => {
    if (!user || !db || shareBusy) return;

    setShareBusy(true);
    setShareStatus("Creating share code…");
    setActionError("");

    try {
      // Reuse an existing code if we already minted one this session so a
      // failed publish after allocate doesn't orphan a fresh mapping.
      let code = shareCode;
      if (!code) {
        code = await allocateShareCode(db, user.uid);
        setShareCode(code);
      }
      const url = buildShareCodeUrl(window.location.origin, code);

      await setDoc(doc(db, "sharedLists", user.uid), {
        ownerId: user.uid,
        ownerName,
        allowEdits,
        permissions,
        items: personalItems.map(toSharedItemPayload),
        shareCode: code,
        updatedAt: serverTimestamp(),
      });
      setIsSharing(true);
      setShareUrl(url);
      setShareStatus("");
    } catch (error) {
      console.error("Share snapshot error:", error);
      setShareStatus("");
      setActionError("Unable to start sharing right now. Please try again.");
    } finally {
      setShareBusy(false);
    }
  };

  const togglePermission = async (
    key: keyof SharePermissions,
    nextValue: boolean,
  ) => {
    const previous = permissions;
    const nextPermissions = { ...permissions, [key]: nextValue };
    setPermissions(nextPermissions);

    if (!user || !db || !isSharing) return;

    try {
      setActionError("");
      await updateDoc(doc(db, "sharedLists", user.uid), {
        allowEdits: hasAnyPermission(nextPermissions),
        permissions: nextPermissions,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Toggle permission error:", error);
      setPermissions(previous);
      setActionError(
        "Unable to update sharing permissions right now. Please try again.",
      );
    }
  };

  const stopSharing = async () => {
    if (!user || !db || shareBusy) return;

    setShareBusy(true);
    setShareStatus("");
    setActionError("");

    try {
      const codeToRevoke = shareCode;
      await deleteDoc(doc(db, "sharedLists", user.uid));
      // Revoke the join code so old texts/QRs stop resolving.
      if (codeToRevoke) {
        await deleteDoc(doc(db, "shareCodes", codeToRevoke)).catch((error) => {
          console.error("Revoke share code error:", error);
        });
      }
      publishedRef.current = null;
      clearPublishedState(user.uid);
      setIsSharing(false);
      setPermissions(NO_PERMISSIONS);
      setShareUrl("");
      setShareCode("");
      setShareOpen(false);
    } catch (error) {
      console.error("Stop sharing error:", error);
      setActionError("Unable to stop sharing right now. Please try again.");
    } finally {
      setShareBusy(false);
    }
  };

  const runConfirmedAction = async () => {
    const action = confirmAction;
    setConfirmAction(null);

    if (action === "clearCompleted") await clearCompleted();
    if (action === "removeSharedList") await removeActiveSharedList();
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

  const filtered = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();
    if (!normalizedQuery) return currentListItems;

    return currentListItems.filter((item) =>
      [item.text, item.quantity, item.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [currentListItems, search]);

  const {
    activeItems,
    doneItems,
    activeGroups,
    doneGroups,
    activeCount,
    doneCount,
  } = useMemo(() => {
    const stillNeeded = sortItemsForMode(
      filtered.filter((item) => !item.completed),
      sortMode === "aisle" ? "manual" : sortMode,
    );
    const alreadyGot = sortItemsForMode(
      filtered.filter((item) => item.completed),
      sortMode === "aisle" ? "manual" : sortMode,
    );

    return {
      activeItems: stillNeeded,
      doneItems: alreadyGot,
      activeGroups: groupItemsByCategory(stillNeeded),
      doneGroups: groupItemsByCategory(alreadyGot),
      activeCount: stillNeeded.length,
      doneCount: alreadyGot.length,
    };
  }, [filtered, sortMode]);

  const changeSortMode = (mode: ListSortMode) => {
    setSortMode(mode);
    writeListSortMode(mode);
    draggingIdRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
  };

  const toggleDoneCollapsed = () => {
    setDoneCollapsed((current) => {
      const next = !current;
      writeDoneCollapsed(next);
      return next;
    });
  };

  /**
   * Persist a new order for the active (unchecked) items. In aisle mode we
   * only reorder within the same category so store layout stays intact.
   */
  const applyActiveReorder = async (
    nextActive: ShoppingItem[],
    scopeItems: ShoppingItem[],
  ) => {
    if (!db || !user) return;
    if (search.trim()) return;

    const orders = assignSequentialOrders(nextActive);
    const orderById = new Map(orders.map((entry) => [entry.id, entry.sortOrder]));
    const touched = scopeItems.filter((item) => orderById.has(item.id));

    // Optimistic local update so the row snaps immediately.
    setItems((current) =>
      current.map((item) => {
        const sortOrder = orderById.get(item.id);
        return sortOrder === undefined ? item : { ...item, sortOrder };
      }),
    );

    try {
      setActionError("");
      await commitBatchOperations(
        db,
        touched.map((item) => (batch) => {
          const sortOrder = orderById.get(item.id);
          if (sortOrder === undefined) return;
          batch.update(doc(db, "shoppingItems", item.id), { sortOrder });
        }),
      );
    } catch (error) {
      console.error("Reorder items error:", error);
      setActionError("Couldn't save the new order. Try again.");
    }
  };

  const reorderActiveItems = async (
    draggedId: string,
    targetId: string,
  ) => {
    if (draggedId === targetId) return;
    if (sortMode === "alpha") return;

    if (sortMode === "manual") {
      const next = reorderById(activeItems, draggedId, targetId);
      if (next === activeItems) return;
      await applyActiveReorder(next, activeItems);
      return;
    }

    // Aisle mode: only allow reordering inside the same category group.
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

    // Rebuild full active list with the group swapped in place.
    const nextActive: ShoppingItem[] = [];
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
    await applyActiveReorder(nextActive, groupItems);
  };

  const moveActiveItem = async (id: string, offset: -1 | 1) => {
    if (sortMode === "alpha") return;

    if (sortMode === "manual") {
      const next = moveItemByOffset(activeItems, id, offset);
      if (next === activeItems) return;
      await applyActiveReorder(next, activeItems);
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

    const nextActive: ShoppingItem[] = [];
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
    await applyActiveReorder(nextActive, groupItems);
  };

  const reorderEnabled =
    !search.trim() && sortMode !== "alpha" && activeCount > 1;

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
      void reorderActiveItems(fromId, targetId);
    },
    onMove: (id, offset) => {
      void moveActiveItem(id, offset);
    },
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

  const allDoneCount = currentListItems.filter((item) => item.completed).length;
  const totalCount = currentListItems.length;
  const allActiveCount = totalCount - allDoneCount;
  const isSearching = search.trim().length > 0;
  // Progress and "clear done" always describe the full list; the headline
  // numbers switch to match results while searching so left/done never disagree.
  const progress = totalCount
    ? Math.round((allDoneCount / totalCount) * 100)
    : 0;
  const statsLeft = isSearching ? activeCount : allActiveCount;
  const statsDone = isSearching ? doneCount : allDoneCount;
  const activeTabName =
    listTabs.find((tab) => tab.id === activeListId)?.name ?? PERSONAL_LIST_NAME;
  const showSearch =
    searchPinned ||
    totalCount > SEARCH_VISIBILITY_THRESHOLD ||
    search.length > 0;
  const modalOpen = shareOpen || confirmAction !== null;

  useEffect(() => {
    if (!modalOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (confirmAction) setConfirmAction(null);
      else setShareOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [confirmAction, modalOpen]);

  // Keyboard shortcuts for people who live at a keyboard: "/" to search,
  // "n" to jump to the add field. Ignored while typing or in a dialog.
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (modalOpen || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "/" && event.key !== "n") return;

      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      event.preventDefault();
      if (event.key === "n") {
        addInputRef.current?.focus();
        return;
      }

      setSearchPinned(true);
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [modalOpen]);

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
            <div className="user-chip" title={user?.displayName ?? undefined}>
              <UserAvatar user={user} />
              <span className="user-name">
                {user?.displayName?.split(" ")[0]}
              </span>
            </div>
            <div className="nav-icon-group">
              {canInstall && (
                <button
                  onClick={() => void install()}
                  className="theme-toggle"
                  title="Install CartLink"
                  type="button"
                  aria-label="Install CartLink"
                >
                  <Download size={16} />
                </button>
              )}
              <button
                onClick={toggleDark}
                className="theme-toggle"
                title={dark ? "Switch to light mode" : "Switch to dark mode"}
                type="button"
                aria-label={
                  dark ? "Switch to light mode" : "Switch to dark mode"
                }
              >
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
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
              <button
                onClick={logout}
                className="logout-btn"
                title="Sign out"
                type="button"
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
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
        </div>

        {showSearch && (
          <div className="search-bar">
            <span className="search-bar-icon">
              <Search size={16} />
            </span>
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="Search your list…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search items"
            />
            {search && (
              <>
                <span className="search-count" role="status">
                  {filtered.length} of {totalCount}
                </span>
                <button
                  className="search-clear"
                  onClick={() => {
                    setSearch("");
                    // Clearing should also put the bar away on a short list,
                    // otherwise "x" only half-dismisses it.
                    setSearchPinned(false);
                  }}
                  type="button"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              </>
            )}
          </div>
        )}

        {/* One field, one button. Quantity and aisle are read from what you
            type ("2 milk", "500g flour", "batteries #shed"). */}
        <form onSubmit={addItem} className="add-form">
          <div className="add-primary-row">
            <input
              ref={addInputRef}
              type="text"
              className="add-input"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Add an item…"
              aria-label="New shopping item"
              aria-describedby="add-hint"
              maxLength={MAX_ITEM_TEXT_LENGTH}
              autoComplete="off"
            />
            <button
              type="submit"
              className="add-btn"
              title="Add item"
              aria-label="Add item"
              disabled={!preview.text}
            >
              <Plus size={22} strokeWidth={2.5} />
            </button>
          </div>

          <p id="add-hint" className="add-hint" aria-live="polite">
            {duplicateItem ? (
              <>
                <strong>{duplicateItem.text}</strong> is already here — adding
                bumps the quantity.
              </>
            ) : preview.quantity || preview.category ? (
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
            ) : null}
          </p>
        </form>

        <datalist id={CATEGORY_DATALIST_ID}>
          {categorySuggestions.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>

        {listTabs.length > 1 && (
          <div className="list-tabs" aria-label="Shopping lists">
            {listTabs.map((tab) => (
              <button
                key={tab.id}
                className={`list-tab ${activeListId === tab.id ? "active" : ""}`}
                onClick={() => {
                  setActiveListId(tab.id);
                  setSearch("");
                }}
                type="button"
                aria-pressed={activeListId === tab.id}
              >
                {tab.name}
              </button>
            ))}
          </div>
        )}

        {totalCount > 0 && (
          <div className="list-summary">
            <div className="stats-bar">
              <span className="stats-text">
                {isSearching ? (
                  <>
                    <strong>{filtered.length}</strong> match
                    {filtered.length === 1 ? "" : "es"}
                    {statsDone > 0 && ` · ${statsDone} done`}
                  </>
                ) : (
                  <>
                    <strong>{statsLeft}</strong> left
                    {statsDone > 0 && ` · ${statsDone} done`}
                  </>
                )}
              </span>
              <div className="stats-actions">
                {allDoneCount > 0 && !isSearching && (
                  <button
                    className="clear-done-btn"
                    onClick={() => setConfirmAction("clearCompleted")}
                    type="button"
                  >
                    Clear {allDoneCount} done
                  </button>
                )}
                {activeListId !== PERSONAL_LIST_ID && (
                  <button
                    className="clear-done-btn"
                    onClick={() => setConfirmAction("removeSharedList")}
                    type="button"
                  >
                    Remove list
                  </button>
                )}
              </div>
            </div>
            <div className="list-toolbar">
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
                    title={mode.label}
                    onClick={() => changeSortMode(mode.id)}
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
            {!isSearching && (
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
          {filtered.length === 0 ? (
            <div className="empty-state">
              <PackageOpen size={40} className="empty-icon" strokeWidth={1.25} />
              <p className="empty-title">
                {isSearching
                  ? "No matches"
                  : totalCount === 0
                    ? "Ready when you are"
                    : "Nothing here"}
              </p>
              <p className="empty-text">
                {isSearching
                  ? "Try a different search term."
                  : totalCount === 0
                    ? "Add your first item above."
                    : `Nothing left on ${activeTabName}.`}
              </p>
              {!isSearching && totalCount === 0 && (
                <p className="empty-tip">
                  Try <code>2 milk</code> to add a quantity and aisle
                  automatically.
                </p>
              )}
            </div>
          ) : (
            <div className="items-list">
              {activeCount > 0 && (
                <>
                  {doneCount > 0 && (
                    <div className="items-divider">
                      <span className="items-divider-label">To get</span>
                      <div className="items-divider-line" />
                    </div>
                  )}
                  {sortMode === "aisle"
                    ? activeGroups.map((group) => (
                        <CategoryGroup
                          key={group.category}
                          group={group}
                          showHeading={
                            activeGroups.length > 1 ||
                            group.category !== DEFAULT_CATEGORY
                          }
                          edit={edit}
                          reorder={reorderState}
                          onToggle={toggleComplete}
                          onDelete={deleteItem}
                        />
                      ))
                    : activeItems.map((item, index) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          index={index}
                          edit={edit}
                          reorder={reorderState}
                          onToggle={toggleComplete}
                          onDelete={deleteItem}
                        />
                      ))}
                </>
              )}

              {doneCount > 0 && (
                <div className="done-section">
                  <button
                    type="button"
                    className="items-divider items-divider-btn"
                    onClick={toggleDoneCollapsed}
                    aria-expanded={!doneCollapsed}
                  >
                    {doneCollapsed ? (
                      <ChevronRight size={14} strokeWidth={2.5} />
                    ) : (
                      <ChevronDown size={14} strokeWidth={2.5} />
                    )}
                    <span className="items-divider-label">
                      Done · {doneCount}
                    </span>
                    <div className="items-divider-line" />
                  </button>
                  {!doneCollapsed &&
                    (sortMode === "aisle"
                      ? doneGroups.map((group) => (
                          <CategoryGroup
                            key={group.category}
                            group={group}
                            showHeading={
                              doneGroups.length > 1 ||
                              group.category !== DEFAULT_CATEGORY
                            }
                            edit={edit}
                            onToggle={toggleComplete}
                            onDelete={deleteItem}
                          />
                        ))
                      : doneItems.map((item, index) => (
                          <ItemRow
                            key={item.id}
                            item={item}
                            index={index}
                            edit={edit}
                            onToggle={toggleComplete}
                            onDelete={deleteItem}
                          />
                        )))}
                </div>
              )}
            </div>
          )}
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
          initialTab={shareTab}
          onClose={() => setShareOpen(false)}
          onStartSharing={startSharing}
          onCopyLink={copyShareLink}
          onCopyCode={copyShareCode}
          onSystemShare={shareViaSystem}
          onTogglePermission={togglePermission}
          onRequestStopSharing={() => setConfirmAction("stopSharing")}
        />
      )}

      {/* Confirm must stack above Share (same base z-index would leave it trapped behind). */}
      {confirmAction && (
        <ConfirmDialog
          action={confirmAction}
          itemCount={allDoneCount}
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
