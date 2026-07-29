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
  commitBatchOperations,
  getItemListId,
  getItemListName,
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
import { useAuth } from "../context/useAuth";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useDarkMode } from "../hooks/useDarkMode";
import BrandMark from "./BrandMark";
import ConfirmDialog, { type ConfirmAction } from "./ConfirmDialog";
import DismissibleMessage from "./DismissibleMessage";
import ShareDialog from "./ShareDialog";
import UserAvatar from "./UserAvatar";
import {
  CATEGORY_DATALIST_ID,
  CategoryGroup,
  type ItemEditState,
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
  const [shareUrl, setShareUrl] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
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
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
    null,
  );
  const handledShareId = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const addInputRef = useRef<HTMLInputElement | null>(null);

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

        itemsData.sort((a, b) => {
          const timeA = a.createdAt?.toMillis() || 0;
          const timeB = b.createdAt?.toMillis() || 0;
          return timeB - timeA;
        });

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
        setShareUrl(`${window.location.origin}/share/${user.uid}`);
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

  const ownerName =
    user?.displayName?.trim() || user?.email?.split("@")[0] || "Shared user";

  useEffect(() => {
    if (!isSharing || !itemsLoaded || !user || !db) return;

    const timeout = window.setTimeout(() => {
      Promise.resolve(
        setDoc(doc(db, "sharedLists", user.uid), {
          ownerId: user.uid,
          ownerName,
          allowEdits,
          permissions,
          items: personalItems.map(toSharedItemPayload),
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
    user,
  ]);

  // When collaborators can edit, reconcile the changes they make on the public
  // shared doc back into the owner's own items: toggle completion, add new
  // items and remove deleted ones, gated by the granted permissions.
  useEffect(() => {
    if (!isSharing || !allowEdits || !user || !db) return;

    const unsubscribe = onSnapshot(
      doc(db, "sharedLists", user.uid),
      (snapshot) => {
        if (!snapshot.exists()) return;

        const shared = normalizeSharedListSnapshot(snapshot.data());
        if (!shared) return;

        const sharedByKey = new Map<string, (typeof shared.items)[number]>();
        shared.items.forEach((sharedItem) => {
          sharedByKey.set(getSharedItemKey(sharedItem), sharedItem);
        });

        const personalByKey = new Map<string, ShoppingItem>();
        personalItems.forEach((item) => {
          personalByKey.set(getSharedItemKey(item), item);
        });

        // Toggle: same item, different completion state.
        if (permissions.toggle) {
          personalItems.forEach((item) => {
            const sharedItem = sharedByKey.get(getSharedItemKey(item));
            if (!sharedItem || sharedItem.completed === item.completed) return;

            updateDoc(doc(db, "shoppingItems", item.id), {
              completed: sharedItem.completed,
            }).catch((error) => {
              console.error("Collaborator toggle sync-back error:", error);
            });
          });
        }

        // Add: shared item that has no matching personal item yet.
        if (permissions.add) {
          shared.items.forEach((sharedItem) => {
            if (personalByKey.has(getSharedItemKey(sharedItem))) return;

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

        // Remove: personal item no longer present in the shared list.
        if (permissions.remove) {
          personalItems.forEach((item) => {
            if (sharedByKey.has(getSharedItemKey(item))) return;

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
  }, [allowEdits, permissions, isSharing, personalItems, user]);

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
    change: "toggle" | "remove" | "add",
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
            : ownerPermissions.remove;
      if (!ownerAllowsEdits || !permitted) return;

      const rawItems = Array.isArray(raw?.items) ? raw.items : [];
      const itemKey = getSharedItemKey(item);
      const matchIndex = rawItems.findIndex((rawItem) => {
        const record = isRecord(rawItem) ? rawItem : {};
        return (
          getSharedItemKey({
            text: typeof record.text === "string" ? record.text : "",
            quantity:
              typeof record.quantity === "string" ? record.quantity : undefined,
            category:
              typeof record.category === "string" ? record.category : undefined,
          }) === itemKey
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
      if (change === "remove") {
        workingItems = rawItems.filter((_raw, index) => index !== matchIndex);
      } else if (change === "add") {
        workingItems = [...rawItems, toSharedItemPayload(item)];
      } else {
        workingItems = rawItems.map((rawItem, index) =>
          index === matchIndex
            ? { ...(rawItem as object), completed: !item.completed }
            : rawItem,
        );
      }

      const nextItems = workingItems.map((rawItem) => {
        const record = (
          rawItem && typeof rawItem === "object" ? rawItem : {}
        ) as Record<string, unknown>;
        return toSharedItemPayload({
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
          void propagateToSharedOwner(duplicateItem, "toggle");
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

      await addDoc(collection(db, "shoppingItems"), {
        text,
        completed: false,
        userId: user.uid,
        ...(quantity ? { quantity } : {}),
        ...(category ? { category } : {}),
        listId: activeListId,
        listName: activeTab?.name ?? PERSONAL_LIST_NAME,
        ...(sharedFromUserId ? { sharedFromUserId } : {}),
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
        void propagateToSharedOwner(item, "toggle");
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
      await setDoc(doc(db, "shoppingItems", item.id), {
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
        createdAt: item.createdAt ?? serverTimestamp(),
      });
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
      await updateDoc(doc(db, "shoppingItems", id), {
        text: trimmed,
        quantity: normalizedQuantity || deleteField(),
        category: normalizedCategory || deleteField(),
      });
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
    setShareStatus("Preparing QR code…");
    setActionError("");

    try {
      await setDoc(doc(db, "sharedLists", user.uid), {
        ownerId: user.uid,
        ownerName,
        allowEdits,
        permissions,
        items: personalItems.map(toSharedItemPayload),
        updatedAt: serverTimestamp(),
      });
      setIsSharing(true);
      setShareUrl(`${window.location.origin}/share/${user.uid}`);
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
      await deleteDoc(doc(db, "sharedLists", user.uid));
      setIsSharing(false);
      setPermissions(NO_PERMISSIONS);
      setShareUrl("");
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

  const copyShareLink = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus("Link copied");
    } catch {
      setShareStatus("Copy failed");
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

  const { activeGroups, doneGroups, activeCount, doneCount } = useMemo(() => {
    const stillNeeded = filtered.filter((item) => !item.completed);
    const alreadyGot = filtered.filter((item) => item.completed);

    return {
      activeGroups: groupItemsByCategory(stillNeeded),
      doneGroups: groupItemsByCategory(alreadyGot),
      activeCount: stillNeeded.length,
      doneCount: alreadyGot.length,
    };
  }, [filtered]);

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
  const progress = totalCount
    ? Math.round((allDoneCount / totalCount) * 100)
    : 0;
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
            <div className="user-chip">
              <UserAvatar user={user} />
              <span className="user-name">
                {user?.displayName?.split(" ")[0]}
              </span>
            </div>
            <button
              onClick={toggleDark}
              className="theme-toggle"
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
              type="button"
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={() => setShareOpen(true)}
              className={`theme-toggle share-button ${isSharing ? "is-sharing" : ""}`}
              title={isSharing ? "Sharing is on" : "Share list"}
              type="button"
              aria-label={
                isSharing ? "Share list (sharing is on)" : "Share list"
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
              <button
                className="search-clear"
                onClick={() => setSearch("")}
                type="button"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
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
                <strong>{activeCount}</strong> left
                {allDoneCount > 0 && ` · ${allDoneCount} in the bag`}
              </span>
              {allDoneCount > 0 && (
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
          </div>
        )}

        <div className="items-section">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <PackageOpen size={56} className="empty-icon" strokeWidth={1} />
              <p className="empty-title">
                {search
                  ? "No matches"
                  : totalCount === 0
                    ? "Bag is empty"
                    : "Nothing here"}
              </p>
              <p className="empty-text">
                {search
                  ? "Try a different search term."
                  : `Add your first item to ${activeTabName}.`}
              </p>
              {!search && totalCount === 0 && (
                <p className="empty-tip">
                  Try typing <code>2 milk</code> — the quantity and the aisle
                  are filled in for you.
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
                  {activeGroups.map((group) => (
                    <CategoryGroup
                      key={group.category}
                      group={group}
                      showHeading={
                        activeGroups.length > 1 ||
                        group.category !== DEFAULT_CATEGORY
                      }
                      edit={edit}
                      onToggle={toggleComplete}
                      onDelete={deleteItem}
                    />
                  ))}
                </>
              )}

              {doneCount > 0 && (
                <>
                  <div className="items-divider">
                    <span className="items-divider-label">Got it</span>
                    <div className="items-divider-line" />
                  </div>
                  {doneGroups.map((group) => (
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
                  ))}
                </>
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

      {shareOpen && (
        <ShareDialog
          isSharing={isSharing}
          shareUrl={shareUrl}
          shareStatus={shareStatus}
          busy={shareBusy}
          permissions={permissions}
          onClose={() => setShareOpen(false)}
          onStartSharing={startSharing}
          onCopyLink={copyShareLink}
          onTogglePermission={togglePermission}
          onRequestStopSharing={() => setConfirmAction("stopSharing")}
        />
      )}
    </div>
  );
};

export default ShoppingList;
