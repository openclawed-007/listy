import React, { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
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
  type Timestamp,
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
  Settings,
  ShoppingBag,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase";
import { useAuth } from "../context/useAuth";

interface ShoppingItem {
  id: string;
  text: string;
  completed: boolean;
  userId: string;
  listId?: string;
  listName?: string;
  sharedFromUserId?: string;
  createdAt?: Timestamp;
}

type FilterType = "all" | "active" | "done";

interface SharedListSnapshot {
  ownerId: string;
  ownerName: string;
  items: Array<{
    text: string;
    completed: boolean;
  }>;
}

interface ListTab {
  id: string;
  name: string;
}

const PERSONAL_LIST_ID = "personal";

function getItemListId(item: ShoppingItem) {
  return item.listId ?? PERSONAL_LIST_ID;
}

function getItemListName(item: ShoppingItem) {
  return item.listName ?? "My List";
}

function useDarkMode() {
  const [dark, setDark] = React.useState<boolean>(() => {
    return localStorage.getItem("theme") === "dark";
  });

  React.useEffect(() => {
    document.body.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((value) => !value) };
}

const FILTERS: FilterType[] = ["all", "active", "done"];

function useSwipeTabs(filter: FilterType, setFilter: (value: FilterType) => void) {
  const touchStartX = React.useRef<number>(0);
  const touchStartY = React.useRef<number>(0);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;

    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.8) return;

    const idx = FILTERS.indexOf(filter);
    if (dx < 0 && idx < FILTERS.length - 1) setFilter(FILTERS[idx + 1]);
    if (dx > 0 && idx > 0) setFilter(FILTERS[idx - 1]);
  };

  return { onTouchStart, onTouchEnd };
}

const ShoppingList: React.FC = () => {
  const { user, logout } = useAuth();
  const { shareId } = useParams();
  const navigate = useNavigate();
  const { dark, toggle: toggleDark } = useDarkMode();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [newItem, setNewItem] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [activeListId, setActiveListId] = useState(PERSONAL_LIST_ID);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [actionError, setActionError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [importing, setImporting] = useState(false);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [shareAutoPublish, setShareAutoPublish] = useState(false);
  const handledShareId = React.useRef<string | null>(null);
  const swipeHandlers = useSwipeTabs(filter, setFilter);

  useEffect(() => {
    if (!user || !db) return;

    const q = query(collection(db, "shoppingItems"), where("userId", "==", user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setActionError("");
        const itemsData = snapshot.docs.map((snapshotDoc) => ({
          id: snapshotDoc.id,
          ...snapshotDoc.data(),
        })) as ShoppingItem[];

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
        setActionError("We could not sync your list. Check your connection and try again.");
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

        setShareAutoPublish(true);
        setShareUrl(`${window.location.origin}/share/${user.uid}`);
        setImportUrl(`${window.location.origin}/import/${user.uid}`);
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
      if (listId !== PERSONAL_LIST_ID) sharedTabs.set(listId, getItemListName(item));
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

  const ownerName = user?.displayName?.trim() || user?.email?.split("@")[0] || "Shared user";

  useEffect(() => {
    if (!shareAutoPublish || !itemsLoaded || !user || !db) return;

    const timeout = window.setTimeout(() => {
      void setDoc(doc(db, "sharedLists", user.uid), {
        ownerId: user.uid,
        ownerName,
        items: personalItems.map((item) => ({
          text: item.text,
          completed: item.completed,
        })),
        updatedAt: serverTimestamp(),
      }).catch((error) => {
        console.error("Auto share sync error:", error);
      });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [itemsLoaded, ownerName, personalItems, shareAutoPublish, user]);

  const importedOwnerIds = useMemo(() => {
    const ownerIds = new Set<string>();

    items.forEach((item) => {
      if (item.sharedFromUserId) ownerIds.add(item.sharedFromUserId);
      else if (item.listId?.startsWith("shared:")) ownerIds.add(item.listId.slice("shared:".length));
    });

    ownerIds.delete(user?.uid ?? "");
    return Array.from(ownerIds).sort();
  }, [items, user]);

  useEffect(() => {
    if (!user || !db || importedOwnerIds.length === 0) return;

    const syncImportedSnapshot = async (data: SharedListSnapshot) => {
      const sharedItems = Array.isArray(data.items)
        ? data.items.filter((item) => item.text.trim())
        : [];
      const importedListId = `shared:${data.ownerId}`;
      const existingItems = items.filter((item) => getItemListId(item) === importedListId);
      const alreadySynced =
        existingItems.length === sharedItems.length &&
        existingItems.every((item, index) => {
          const sharedItem = sharedItems[index];
          return (
            item.text === sharedItem.text.trim() &&
            item.completed === sharedItem.completed &&
            getItemListName(item) === data.ownerName
          );
        });

      if (alreadySynced) return;

      const batch = writeBatch(db);
      existingItems.forEach((item) => batch.delete(doc(db, "shoppingItems", item.id)));
      sharedItems.forEach((item) => {
        batch.set(doc(collection(db, "shoppingItems")), {
          text: item.text.trim(),
          completed: item.completed,
          userId: user.uid,
          listId: importedListId,
          listName: data.ownerName,
          sharedFromUserId: data.ownerId,
          createdAt: serverTimestamp(),
        });
      });

      await batch.commit();
    };

    const unsubscribes = importedOwnerIds.map((ownerId) =>
      onSnapshot(
        doc(db, "sharedLists", ownerId),
        (snapshot) => {
          if (!snapshot.exists()) return;
          void syncImportedSnapshot(snapshot.data() as SharedListSnapshot).catch((error) => {
            console.error("Imported list sync error:", error);
          });
        },
        (error) => {
          console.error("Imported list listener error:", error);
        },
      ),
    );

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [importedOwnerIds, items, user]);

  useEffect(() => {
    if (!shareId || !user || !db || importing || handledShareId.current === shareId) return;

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

        const data = snapshot.data() as SharedListSnapshot;
        const sharedItems = Array.isArray(data.items) ? data.items : [];
        if (data.ownerId === user.uid) {
          setActionError("This is your own share code.");
          navigate("/", { replace: true });
          return;
        }

        const importedListId = `shared:${data.ownerId}`;
        const existingItems = await getDocs(
          query(collection(db, "shoppingItems"), where("userId", "==", user.uid)),
        );

        const batch = writeBatch(db);
        let writeCount = 0;
        existingItems.forEach((itemDoc) => {
          if (getItemListId(itemDoc.data() as ShoppingItem) === importedListId) {
            batch.delete(doc(db, "shoppingItems", itemDoc.id));
            writeCount += 1;
          }
        });

        sharedItems.forEach((item) => {
          if (!item.text.trim()) return;

          const itemRef = doc(collection(db, "shoppingItems"));
          batch.set(itemRef, {
            text: item.text.trim(),
            completed: item.completed,
            userId: user.uid,
            listId: importedListId,
            listName: data.ownerName,
            sharedFromUserId: data.ownerId,
            createdAt: serverTimestamp(),
          });
          writeCount += 1;
        });

        if (writeCount > 0) await batch.commit();
        setActiveListId(importedListId);
        setImportStatus(`${data.ownerName}'s list was added to your tabs.`);
        navigate("/", { replace: true });
      } catch (error) {
        console.error("Import shared list error:", error);
        setActionError("Unable to import that shared list right now. Please try again.");
        navigate("/", { replace: true });
      } finally {
        setImporting(false);
      }
    };

    void importSharedList();
  }, [importing, navigate, shareId, user]);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.trim() || !user || !db) return;

    const activeTab = listTabs.find((tab) => tab.id === activeListId);

    try {
      setActionError("");
      await addDoc(collection(db, "shoppingItems"), {
        text: newItem.trim(),
        completed: false,
        userId: user.uid,
        listId: activeListId,
        listName: activeTab?.name ?? "My List",
        createdAt: serverTimestamp(),
      });
      setNewItem("");
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

    try {
      setActionError("");
      await deleteDoc(doc(db, "shoppingItems", id));
    } catch (error) {
      console.error("Delete item error:", error);
      setActionError("Unable to remove this item right now. Please try again.");
    }
  };

  const updateItemText = async (id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !db) return;

    try {
      setActionError("");
      await updateDoc(doc(db, "shoppingItems", id), { text: trimmed });
    } catch (error) {
      console.error("Update text error:", error);
      setActionError("Unable to save your edit right now. Please try again.");
    }
  };

  const startEdit = (item: ShoppingItem) => {
    setEditingId(item.id);
    setEditText(item.text);
  };

  const commitEdit = async () => {
    if (editingId) await updateItemText(editingId, editText);
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const clearCompleted = async () => {
    if (!db) return;

    const done = items.filter((item) => item.completed && getItemListId(item) === activeListId);
    try {
      setActionError("");
      await Promise.all(done.map((item) => deleteDoc(doc(db, "shoppingItems", item.id))));
    } catch (error) {
      console.error("Clear completed error:", error);
      setActionError("Unable to clear completed items right now. Please try again.");
    }
  };

  const removeActiveSharedList = async () => {
    if (!db || activeListId === PERSONAL_LIST_ID) return;

    try {
      setActionError("");
      const sharedItems = items.filter((item) => getItemListId(item) === activeListId);
      await Promise.all(sharedItems.map((item) => deleteDoc(doc(db, "shoppingItems", item.id))));
      setActiveListId(PERSONAL_LIST_ID);
      setImportStatus("");
    } catch (error) {
      console.error("Remove shared list error:", error);
      setActionError("Unable to remove that shared list right now. Please try again.");
    }
  };

  const publishShareSnapshot = async () => {
    if (!user || !db) return;

    const nextShareUrl = `${window.location.origin}/share/${user.uid}`;
    const nextImportUrl = `${window.location.origin}/import/${user.uid}`;

    try {
      setShareStatus("Preparing QR code...");
      setActionError("");
      await setDoc(doc(db, "sharedLists", user.uid), {
        ownerId: user.uid,
        ownerName,
        items: personalItems.map((item) => ({
          text: item.text,
          completed: item.completed,
        })),
        updatedAt: serverTimestamp(),
      });
      setShareAutoPublish(true);
      setShareUrl(nextShareUrl);
      setImportUrl(nextImportUrl);
      setShareStatus("Ready to scan");
    } catch (error) {
      console.error("Share snapshot error:", error);
      setShareStatus("");
      setActionError("Unable to prepare your share code right now. Please try again.");
    }
  };

  const openSettings = () => {
    setSettingsOpen(true);
    void publishShareSnapshot();
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

  const copyImportLink = async () => {
    if (!importUrl) return;

    try {
      await navigator.clipboard.writeText(importUrl);
      setShareStatus("Import link copied");
    } catch {
      setShareStatus("Copy failed");
    }
  };

  const filtered = useMemo(() => {
    let list = items.filter((item) => getItemListId(item) === activeListId);

    if (filter === "active") list = list.filter((item) => !item.completed);
    else if (filter === "done") list = list.filter((item) => item.completed);

    if (search.trim()) {
      const normalizedQuery = search.trim().toLowerCase();
      list = list.filter((item) => item.text.toLowerCase().includes(normalizedQuery));
    }

    return list;
  }, [activeListId, items, filter, search]);

  const activeItems = filtered.filter((item) => !item.completed);
  const doneItems = filtered.filter((item) => item.completed);
  const currentListItems = items.filter((item) => getItemListId(item) === activeListId);
  const allDoneCount = currentListItems.filter((item) => item.completed).length;
  const activeTabName = listTabs.find((tab) => tab.id === activeListId)?.name ?? "My List";

  const filterLabels: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Needed" },
    { key: "done", label: "Got it" },
  ];

  return (
    <div className="app-wrapper">
      <header className="navbar">
        <div className="navbar-content">
          <div className="nav-brand">
            <div className="nav-brand-icon">
              <ShoppingBag size={18} strokeWidth={2.5} />
            </div>
            <span className="nav-brand-name">
              Cart<em>Link</em>
            </span>
          </div>

          <div className="user-actions">
            <div className="user-chip">
              <UserAvatar user={user} />
              <span className="user-name">{user?.displayName?.split(" ")[0]}</span>
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
              onClick={openSettings}
              className="theme-toggle"
              title="Settings"
              type="button"
              aria-label="Settings"
            >
              <Settings size={16} />
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

      <main className="container" {...swipeHandlers}>
        <div className="page-heading">
          <h1 className="page-title">My List</h1>
          <p className="page-subtitle">
            {currentListItems.length === 0
              ? "Nothing here yet."
              : `${currentListItems.length} ${
                  currentListItems.length === 1 ? "item" : "items"
                } · ${allDoneCount} checked off`}
          </p>
          {importStatus && (
            <p className="form-success inline-error" role="status">
              {importStatus}
            </p>
          )}
          {actionError && (
            <p className="form-error inline-error" role="alert">
              {actionError}
            </p>
          )}
        </div>

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

        <form onSubmit={addItem} className="add-form">
          <input
            type="text"
            className="add-input"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Add an item…"
            autoFocus
            aria-label="New shopping item"
          />
          <button type="submit" className="add-btn" title="Add item" aria-label="Add item">
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
                  setFilter("all");
                  setSearch("");
                }}
                type="button"
              >
                {tab.name}
              </button>
            ))}
          </div>
        )}

        <div className="filter-tabs">
          {filterLabels.map(({ key, label }) => (
            <button
              key={key}
              className={`filter-tab ${filter === key ? "active" : ""}`}
              onClick={() => setFilter(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {currentListItems.length > 0 && (
          <div className="stats-bar">
            <span className="stats-text">
              <strong>{activeItems.length}</strong> remaining
            </span>
            {allDoneCount > 0 && (
              <button className="clear-done-btn" onClick={clearCompleted} type="button">
                Clear {allDoneCount} done
              </button>
            )}
            {activeListId !== PERSONAL_LIST_ID && (
              <button className="clear-done-btn" onClick={removeActiveSharedList} type="button">
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
                {search ? "No matches" : currentListItems.length === 0 ? "Bag is empty" : "Nothing here"}
              </p>
              <p className="empty-text">
                {search
                  ? "Try a different search term."
                  : currentListItems.length === 0
                    ? `Add your first item to ${activeTabName}.`
                    : "Switch filters to see other items."}
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
                  {activeItems.map((item, index) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      index={index}
                      onToggle={toggleComplete}
                      onDelete={deleteItem}
                      isEditing={editingId === item.id}
                      editText={editText}
                      onEditStart={startEdit}
                      onEditChange={setEditText}
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
                  {doneItems.map((item, index) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      index={index}
                      onToggle={toggleComplete}
                      onDelete={deleteItem}
                      isEditing={editingId === item.id}
                      editText={editText}
                      onEditStart={startEdit}
                      onEditChange={setEditText}
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

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2 id="settings-title">Settings</h2>
                <p>Share your list with a QR code.</p>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
              >
                <X size={18} />
              </button>
            </div>

            <div className="share-panel">
              <div className="qr-frame">
                {shareUrl ? (
                  <QRCodeSVG value={shareUrl} size={184} marginSize={2} />
                ) : (
                  <div className="qr-placeholder" />
                )}
              </div>
              <p className="share-status" role="status">
                {shareStatus || "Open settings to prepare your QR code"}
              </p>
              <div className="share-actions">
                <button className="secondary-btn" type="button" onClick={publishShareSnapshot}>
                  Refresh
                </button>
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
                className="text-action-btn"
                type="button"
                onClick={copyImportLink}
                disabled={!importUrl}
              >
                Copy sign-in import link
              </button>
            </div>
          </section>
        </div>
      )}
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

interface ItemRowProps {
  item: ShoppingItem;
  index: number;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  isEditing: boolean;
  editText: string;
  onEditStart: (item: ShoppingItem) => void;
  onEditChange: (value: string) => void;
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
  onEditStart,
  onEditChange,
  onEditCommit,
  onEditCancel,
}) => {
  const pressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = React.useRef(false);

  const startPress = () => {
    didLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onEditStart(item);
    }, 500);
  };

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const handleClick = () => {
    if (!isEditing && !didLongPress.current) onToggle(item.id, item.completed);
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
      style={{ animationDelay: `${index * 0.04}s`, cursor: isEditing ? "default" : "pointer" }}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
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
        aria-label={item.completed ? `Mark "${item.text}" as needed` : `Mark "${item.text}" as completed`}
        aria-pressed={item.completed}
      >
        {item.completed && <Check size={13} strokeWidth={3} />}
      </button>

      {isEditing ? (
        <input
          className="item-edit-input"
          value={editText}
          autoFocus
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onEditCommit}
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
          onClick={(e) => e.stopPropagation()}
          aria-label="Edit item text"
        />
      ) : (
        <span className="item-text">{item.text}</span>
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
