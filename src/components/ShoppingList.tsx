import React, { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
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
  writeBatch,
  type Firestore,
  type Timestamp,
  type WriteBatch,
} from "firebase/firestore";
import {
  Check,
  Copy,
  LogOut,
  Moon,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  Share2,
  Sun,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase";
import { useAuth } from "../context/useAuth";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import BrandMark from "./BrandMark";

interface ShoppingItem {
  id: string;
  text: string;
  completed: boolean;
  userId: string;
  quantity?: string;
  category?: string;
  listId?: string;
  listName?: string;
  sharedFromUserId?: string;
  createdAt?: Timestamp;
}

interface SharedListSnapshot {
  ownerId: string;
  ownerName: string;
  items: Array<{
    text: string;
    completed: boolean;
    quantity?: string;
    category?: string;
  }>;
}

interface ListTab {
  id: string;
  name: string;
}

interface PendingDelete {
  item: ShoppingItem;
  timeoutId: number;
}

type ConfirmAction = "clearCompleted" | "removeSharedList" | "stopSharing";

const PERSONAL_LIST_ID = "personal";
const MAX_ITEM_TEXT_LENGTH = 500;
const MAX_QUANTITY_LENGTH = 40;
const MAX_CATEGORY_LENGTH = 80;
const MAX_FIRESTORE_BATCH_WRITES = 450;
const DEFAULT_CATEGORY = "General";

function getItemListId(item: ShoppingItem) {
  return item.listId ?? PERSONAL_LIST_ID;
}

function getItemListName(item: ShoppingItem) {
  return item.listName ?? "My List";
}

function getItemCategory(item: ShoppingItem) {
  return item.category ?? DEFAULT_CATEGORY;
}

function getSafeOwnerName(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 120)
    : "Shared user";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizeOptionalString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : undefined;
}

function normalizeShoppingItem(id: string, data: unknown): ShoppingItem | null {
  if (!isRecord(data)) return null;

  const text = normalizeOptionalString(data.text, MAX_ITEM_TEXT_LENGTH);
  const userId = normalizeOptionalString(data.userId, 128);
  if (!text || !userId || typeof data.completed !== "boolean") return null;

  return {
    id,
    text,
    completed: data.completed,
    userId,
    quantity: normalizeOptionalString(data.quantity, MAX_QUANTITY_LENGTH),
    category: normalizeOptionalString(data.category, MAX_CATEGORY_LENGTH),
    listId: normalizeOptionalString(data.listId, 200),
    listName: normalizeOptionalString(data.listName, 120),
    sharedFromUserId: normalizeOptionalString(data.sharedFromUserId, 128),
    createdAt:
      data.createdAt &&
      typeof data.createdAt === "object" &&
      "toMillis" in data.createdAt
        ? (data.createdAt as Timestamp)
        : undefined,
  };
}

function normalizeSharedItems(items: unknown) {
  if (!Array.isArray(items)) return [];

  return items.flatMap((item) => {
    if (!isRecord(item)) return [];

    const text = normalizeOptionalString(item.text, MAX_ITEM_TEXT_LENGTH);
    if (!text) return [];

    return [
      {
        text,
        completed: item.completed === true,
        quantity: normalizeOptionalString(item.quantity, MAX_QUANTITY_LENGTH),
        category: normalizeOptionalString(item.category, MAX_CATEGORY_LENGTH),
      },
    ];
  });
}

function normalizeSharedListSnapshot(data: unknown): SharedListSnapshot | null {
  if (!isRecord(data)) return null;

  const ownerId = normalizeOptionalString(data.ownerId, 128);
  if (!ownerId) return null;

  return {
    ownerId,
    ownerName: getSafeOwnerName(data.ownerName),
    items: normalizeSharedItems(data.items),
  };
}

async function commitBatchOperations(
  firestore: Firestore,
  operations: Array<(batch: WriteBatch) => void>,
) {
  for (
    let index = 0;
    index < operations.length;
    index += MAX_FIRESTORE_BATCH_WRITES
  ) {
    const batch = writeBatch(firestore);
    operations
      .slice(index, index + MAX_FIRESTORE_BATCH_WRITES)
      .forEach((operation) => operation(batch));
    await batch.commit();
  }
}

function useDarkMode() {
  const [dark, setDark] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem("theme") === "dark";
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    document.body.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      // Some browser privacy modes can block localStorage.
    }
  }, [dark]);

  return { dark, toggle: () => setDark((value) => !value) };
}

const SEARCH_VISIBILITY_THRESHOLD = 15;

const ShoppingList: React.FC = () => {
  const { user, logout } = useAuth();
  const { shareId } = useParams();
  const navigate = useNavigate();
  const { dark, toggle: toggleDark } = useDarkMode();
  const online = useOnlineStatus();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [newItem, setNewItem] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [search, setSearch] = useState("");
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
  const [importStatus, setImportStatus] = useState("");
  const [importing, setImporting] = useState(false);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const handledShareId = React.useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (pendingDelete) window.clearTimeout(pendingDelete.timeoutId);
    };
  }, [pendingDelete]);

  useEffect(() => {
    if (!importStatus) return undefined;

    const timeoutId = window.setTimeout(() => setImportStatus(""), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [importStatus]);

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

        setIsSharing(true);
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
      { id: PERSONAL_LIST_ID, name: "My List" },
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
          items: personalItems.map((item) => ({
            text: item.text,
            completed: item.completed,
            ...(item.quantity ? { quantity: item.quantity } : {}),
            ...(item.category ? { category: item.category } : {}),
          })),
          updatedAt: serverTimestamp(),
        }),
      ).catch((error) => {
        console.error("Auto share sync error:", error);
      });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [itemsLoaded, ownerName, personalItems, isSharing, user]);

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
      setImportStatus("");
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

        const ownerName = data.ownerName;
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
              listName: ownerName,
              sharedFromUserId: data.ownerId,
              createdAt: serverTimestamp(),
            }),
          );
        });

        await commitBatchOperations(db, operations);
        setActiveListId(importedListId);
        setImportStatus(`${ownerName}'s list was added to your tabs.`);
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

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newItem.trim();
    const quantity = newQuantity.trim().slice(0, MAX_QUANTITY_LENGTH);
    const category = newCategory.trim().slice(0, MAX_CATEGORY_LENGTH);
    if (!trimmed || !user || !db) return;
    if (trimmed.length > MAX_ITEM_TEXT_LENGTH) {
      setActionError(
        `Keep items to ${MAX_ITEM_TEXT_LENGTH} characters or fewer.`,
      );
      return;
    }

    const activeTab = listTabs.find((tab) => tab.id === activeListId);

    try {
      setActionError("");
      await addDoc(collection(db, "shoppingItems"), {
        text: trimmed,
        completed: false,
        userId: user.uid,
        ...(quantity ? { quantity } : {}),
        ...(category ? { category } : {}),
        listId: activeListId,
        listName: activeTab?.name ?? "My List",
        createdAt: serverTimestamp(),
      });
      setNewItem("");
      setNewQuantity("");
      setNewCategory("");
    } catch (error) {
      console.error("Add item error:", error);
      setActionError("Unable to add that item right now. Please try again.");
    }
  };

  const toggleComplete = async (id: string, completed: boolean) => {
    if (!db) return;

    try {
      setActionError("");
      await updateDoc(doc(db, "shoppingItems", id), { completed: !completed });
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
      setActionError("Unable to restore that item right now. Please try again.");
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
    if (!trimmed || !db) return;
    if (trimmed.length > MAX_ITEM_TEXT_LENGTH) {
      setActionError(
        `Keep items to ${MAX_ITEM_TEXT_LENGTH} characters or fewer.`,
      );
      return;
    }

    try {
      setActionError("");
      await updateDoc(doc(db, "shoppingItems", id), {
        text: trimmed,
        quantity: normalizedQuantity || deleteField(),
        category: normalizedCategory || deleteField(),
      });
    } catch (error) {
      console.error("Update item details error:", error);
      setActionError("Unable to save your edit right now. Please try again.");
    }
  };

  const startEdit = (item: ShoppingItem) => {
    setEditingId(item.id);
    setEditText(item.text);
    setEditQuantity(item.quantity ?? "");
    setEditCategory(item.category ?? "");
  };

  const commitEdit = async () => {
    if (editingId)
      await updateItemDetails(editingId, editText, editQuantity, editCategory);
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const clearCompleted = async () => {
    if (!db) return;

    const done = items.filter(
      (item) => item.completed && getItemListId(item) === activeListId,
    );
    if (done.length === 0) return;

    try {
      setActionError("");
      await commitBatchOperations(
        db,
        done.map(
          (item) => (batch) =>
            batch.delete(doc(db, "shoppingItems", item.id)),
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
      const sharedItems = items.filter(
        (item) => getItemListId(item) === activeListId,
      );
      await commitBatchOperations(
        db,
        sharedItems.map(
          (item) => (batch) =>
            batch.delete(doc(db, "shoppingItems", item.id)),
        ),
      );
      setActiveListId(PERSONAL_LIST_ID);
      setImportStatus("");
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
        items: personalItems.map((item) => ({
          text: item.text,
          completed: item.completed,
          ...(item.quantity ? { quantity: item.quantity } : {}),
          ...(item.category ? { category: item.category } : {}),
        })),
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

  const stopSharing = async () => {
    if (!user || !db || shareBusy) return;

    setShareBusy(true);
    setShareStatus("");
    setActionError("");

    try {
      await deleteDoc(doc(db, "sharedLists", user.uid));
      setIsSharing(false);
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
    let list = items.filter((item) => getItemListId(item) === activeListId);

    if (search.trim()) {
      const normalizedQuery = search.trim().toLowerCase();
      list = list.filter((item) =>
        [item.text, item.quantity, item.category]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      );
    }

    return list;
  }, [activeListId, items, search]);

  const activeItems = filtered.filter((item) => !item.completed);
  const doneItems = filtered.filter((item) => item.completed);
  const groupedActiveItems = groupItemsByCategory(activeItems);
  const groupedDoneItems = groupItemsByCategory(doneItems);
  const currentListItems = items.filter(
    (item) => getItemListId(item) === activeListId,
  );
  const allDoneCount = currentListItems.filter((item) => item.completed).length;
  const activeTabName =
    listTabs.find((tab) => tab.id === activeListId)?.name ?? "My List";
  const showSearch =
    currentListItems.length > SEARCH_VISIBILITY_THRESHOLD || search.length > 0;

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
          {importStatus && (
            <DismissibleMessage
              kind="success"
              message={importStatus}
              onDismiss={() => setImportStatus("")}
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

        <form onSubmit={addItem} className="add-form enhanced-add-form">
          <input
            type="text"
            className="add-input"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Add an item…"
            aria-label="New shopping item"
            maxLength={MAX_ITEM_TEXT_LENGTH}
          />
          <input
            type="text"
            className="add-input add-meta-input quantity-input"
            value={newQuantity}
            onChange={(e) => setNewQuantity(e.target.value)}
            placeholder="Qty"
            aria-label="Item quantity"
            maxLength={MAX_QUANTITY_LENGTH}
          />
          <input
            type="text"
            className="add-input add-meta-input category-input"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Category"
            aria-label="Item category or aisle"
            maxLength={MAX_CATEGORY_LENGTH}
          />
          <button
            type="submit"
            className="add-btn"
            title="Add item"
            aria-label="Add item"
          >
            <Plus size={22} strokeWidth={2.5} />
          </button>
        </form>

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

        {currentListItems.length > 0 && (
          <div className="stats-bar">
            <span className="stats-text">
              <strong>{activeItems.length}</strong> remaining
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
        )}

        <div className="items-section">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <PackageOpen size={56} className="empty-icon" strokeWidth={1} />
              <p className="empty-title">
                {search
                  ? "No matches"
                  : currentListItems.length === 0
                    ? "Bag is empty"
                    : "Nothing here"}
              </p>
              <p className="empty-text">
                {search
                  ? "Try a different search term."
                  : `Add your first item to ${activeTabName}.`}
              </p>
            </div>
          ) : (
            <div className="items-list">
              {activeItems.length > 0 && (
                <>
                  {doneItems.length > 0 && (
                    <div className="items-divider">
                      <span className="items-divider-label">To get</span>
                      <div className="items-divider-line" />
                    </div>
                  )}
                  {groupedActiveItems.map((group) => (
                    <CategoryGroup
                      key={group.category}
                      group={group}
                      onToggle={toggleComplete}
                      onDelete={deleteItem}
                      editingId={editingId}
                      editText={editText}
                      editQuantity={editQuantity}
                      editCategory={editCategory}
                      onEditStart={startEdit}
                      onEditTextChange={setEditText}
                      onEditQuantityChange={setEditQuantity}
                      onEditCategoryChange={setEditCategory}
                      onEditCommit={commitEdit}
                      onEditCancel={cancelEdit}
                    />
                  ))}
                </>
              )}

              {doneItems.length > 0 && (
                <>
                  <div className="items-divider">
                    <span className="items-divider-label">Got it</span>
                    <div className="items-divider-line" />
                  </div>
                  {groupedDoneItems.map((group) => (
                    <CategoryGroup
                      key={group.category}
                      group={group}
                      onToggle={toggleComplete}
                      onDelete={deleteItem}
                      editingId={editingId}
                      editText={editText}
                      editQuantity={editQuantity}
                      editCategory={editCategory}
                      onEditStart={startEdit}
                      onEditTextChange={setEditText}
                      onEditQuantityChange={setEditQuantity}
                      onEditCategoryChange={setEditCategory}
                      onEditCommit={commitEdit}
                      onEditCancel={cancelEdit}
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
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setShareOpen(false)}
        >
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2 id="share-title">Share list</h2>
                <p>
                  {isSharing
                    ? "Anyone with the link or QR code can view your list."
                    : "Publish your list to a public link or QR code."}
                </p>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setShareOpen(false)}
                aria-label="Close share dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="share-panel">
              {isSharing ? (
                <>
                  <div className="qr-frame">
                    {shareUrl ? (
                      <QRCodeSVG value={shareUrl} size={184} marginSize={2} />
                    ) : (
                      <div className="qr-placeholder" />
                    )}
                  </div>
                  <p className="share-status" role="status">
                    {shareStatus || "Live - changes publish automatically"}
                  </p>
                  <div className="share-actions">
                    <button
                      className="secondary-btn"
                      type="button"
                      onClick={copyShareLink}
                      disabled={!shareUrl}
                    >
                      <Copy size={15} />
                      Copy link
                    </button>
                  </div>
                  <button
                    className="text-action-btn danger"
                    type="button"
                    onClick={() => setConfirmAction("stopSharing")}
                    disabled={shareBusy}
                  >
                    {shareBusy ? "Stopping..." : "Stop sharing"}
                  </button>
                </>
              ) : (
                <>
                  <div className="share-empty">
                    <Share2 size={36} strokeWidth={1.5} />
                    <p>Sharing is off.</p>
                    <p className="share-empty-text">
                      Anyone with the link can view (not edit) your list.
                    </p>
                  </div>
                  {shareStatus && (
                    <p className="share-status" role="status">
                      {shareStatus}
                    </p>
                  )}
                  <button
                    className="primary-btn"
                    type="button"
                    onClick={startSharing}
                    disabled={shareBusy}
                  >
                    {shareBusy ? "Starting..." : "Start sharing"}
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

function groupItemsByCategory(items: ShoppingItem[]) {
  const groups = new Map<string, ShoppingItem[]>();

  items.forEach((item) => {
    const category = getItemCategory(item);
    groups.set(category, [...(groups.get(category) ?? []), item]);
  });

  return Array.from(groups, ([category, categoryItems]) => ({
    category,
    items: categoryItems,
  })).sort((a, b) => {
    if (a.category === DEFAULT_CATEGORY) return 1;
    if (b.category === DEFAULT_CATEGORY) return -1;
    return a.category.localeCompare(b.category);
  });
}

interface DismissibleMessageProps {
  kind: "error" | "success";
  message: string;
  onDismiss: () => void;
}

const DismissibleMessage: React.FC<DismissibleMessageProps> = ({
  kind,
  message,
  onDismiss,
}) => (
  <div
    className={`${kind === "error" ? "form-error" : "form-success"} inline-error dismissible-message`}
    role={kind === "error" ? "alert" : "status"}
  >
    <span>{message}</span>
    <button type="button" onClick={onDismiss} aria-label="Dismiss message">
      <X size={14} />
    </button>
  </div>
);

interface ConfirmDialogProps {
  action: ConfirmAction;
  itemCount: number;
  listName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function getConfirmCopy(action: ConfirmAction, itemCount: number, listName: string) {
  if (action === "clearCompleted") {
    return {
      title: "Clear completed items?",
      body: `This will permanently remove ${itemCount} completed ${
        itemCount === 1 ? "item" : "items"
      } from ${listName}.`,
      confirmLabel: "Clear items",
    };
  }

  if (action === "removeSharedList") {
    return {
      title: "Remove this list?",
      body: `${listName} and its saved items will be removed from your account.`,
      confirmLabel: "Remove list",
    };
  }

  return {
    title: "Stop sharing?",
    body: "Anyone with your current share link or QR code will no longer be able to view this list.",
    confirmLabel: "Stop sharing",
  };
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  action,
  itemCount,
  listName,
  busy,
  onCancel,
  onConfirm,
}) => {
  const copy = getConfirmCopy(action, itemCount, listName);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="settings-modal confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="confirm-title">{copy.title}</h2>
            <p>{copy.body}</p>
          </div>
          <button
            className="modal-close"
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
          >
            <X size={18} />
          </button>
        </div>
        <div className="confirm-actions">
          <button className="secondary-btn" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="danger-btn"
            type="button"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working..." : copy.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
};

interface UserAvatarProps {
  user: User | null;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ user }) => {
  const [imgFailed, setImgFailed] = React.useState(false);
  const initial = user?.displayName?.[0]?.toUpperCase() ?? "?";

  if (user?.photoURL && !imgFailed) {
    return (
      <img
        src={user.photoURL}
        alt=""
        className="user-avatar"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return <div className="user-avatar user-avatar-initials">{initial}</div>;
};

interface CategoryGroupProps {
  group: { category: string; items: ShoppingItem[] };
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  editingId: string | null;
  editText: string;
  editQuantity: string;
  editCategory: string;
  onEditStart: (item: ShoppingItem) => void;
  onEditTextChange: (value: string) => void;
  onEditQuantityChange: (value: string) => void;
  onEditCategoryChange: (value: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
}

const CategoryGroup: React.FC<CategoryGroupProps> = ({
  group,
  onToggle,
  onDelete,
  editingId,
  editText,
  editQuantity,
  editCategory,
  onEditStart,
  onEditTextChange,
  onEditQuantityChange,
  onEditCategoryChange,
  onEditCommit,
  onEditCancel,
}) => (
  <div className="category-group">
    <div className="category-heading">{group.category}</div>
    {group.items.map((item, index) => (
      <ItemRow
        key={item.id}
        item={item}
        index={index}
        onToggle={onToggle}
        onDelete={onDelete}
        isEditing={editingId === item.id}
        editText={editText}
        editQuantity={editQuantity}
        editCategory={editCategory}
        onEditStart={onEditStart}
        onEditTextChange={onEditTextChange}
        onEditQuantityChange={onEditQuantityChange}
        onEditCategoryChange={onEditCategoryChange}
        onEditCommit={onEditCommit}
        onEditCancel={onEditCancel}
      />
    ))}
  </div>
);

interface ItemRowProps {
  item: ShoppingItem;
  index: number;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  isEditing: boolean;
  editText: string;
  editQuantity: string;
  editCategory: string;
  onEditStart: (item: ShoppingItem) => void;
  onEditTextChange: (value: string) => void;
  onEditQuantityChange: (value: string) => void;
  onEditCategoryChange: (value: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
}

const ItemRow: React.FC<ItemRowProps> = ({
  item,
  index,
  onToggle,
  onDelete,
  isEditing,
  editText,
  editQuantity,
  editCategory,
  onEditStart,
  onEditTextChange,
  onEditQuantityChange,
  onEditCategoryChange,
  onEditCommit,
  onEditCancel,
}) => {
  const handleClick = () => {
    if (!isEditing) onToggle(item.id, item.completed);
  };

  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isEditing) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle(item.id, item.completed);
    }
  };

  return (
    <div
      className={`item-row ${item.completed ? "completed" : ""} ${isEditing ? "is-editing" : ""}`}
      style={{
        animationDelay: `${Math.min(index, 8) * 0.04}s`,
        cursor: isEditing ? "default" : "pointer",
      }}
      onClick={handleClick}
      role="button"
      tabIndex={isEditing ? -1 : 0}
      onKeyDown={handleRowKeyDown}
      aria-label={`${item.completed ? "Mark as needed" : "Mark as completed"}: ${item.text}`}
    >
      <button
        className={`toggle-btn ${item.completed ? "is-checked" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!isEditing) onToggle(item.id, item.completed);
        }}
        type="button"
        aria-label={
          item.completed
            ? `Mark "${item.text}" as needed`
            : `Mark "${item.text}" as completed`
        }
        aria-pressed={item.completed}
      >
        {item.completed && <Check size={13} strokeWidth={3} />}
      </button>

      {isEditing ? (
        <div
          className="item-edit-fields"
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              onEditCommit();
            }
          }}
        >
          <input
            className="item-edit-input"
            value={editText}
            autoFocus
            onChange={(e) => onEditTextChange(e.target.value)}
            maxLength={MAX_ITEM_TEXT_LENGTH}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onEditCommit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onEditCancel();
              }
            }}
            aria-label="Edit item text"
          />
          <input
            className="item-edit-input item-edit-meta"
            value={editQuantity}
            onChange={(e) => onEditQuantityChange(e.target.value)}
            maxLength={MAX_QUANTITY_LENGTH}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onEditCommit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onEditCancel();
              }
            }}
            placeholder="Qty"
            aria-label="Edit item quantity"
          />
          <input
            className="item-edit-input item-edit-meta"
            value={editCategory}
            onChange={(e) => onEditCategoryChange(e.target.value)}
            maxLength={MAX_CATEGORY_LENGTH}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onEditCommit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onEditCancel();
              }
            }}
            placeholder="Category"
            aria-label="Edit item category"
          />
        </div>
      ) : (
        <span className="item-content">
          <span className="item-text">{item.text}</span>
          {(item.quantity || item.category) && (
            <span className="item-meta">
              {item.quantity && <span>{item.quantity}</span>}
              {item.category && <span>{item.category}</span>}
            </span>
          )}
        </span>
      )}

      {!isEditing && (
        <button
          className="edit-btn"
          onClick={(e) => {
            e.stopPropagation();
            onEditStart(item);
          }}
          title="Edit item"
          type="button"
          aria-label={`Edit "${item.text}"`}
        >
          <Pencil size={14} />
        </button>
      )}

      <button
        className="delete-btn"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(item.id);
        }}
        title="Remove item"
        type="button"
        aria-label={`Remove "${item.text}"`}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
};

export default ShoppingList;
