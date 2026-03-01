import React, { useState, useEffect, useMemo } from "react";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  Trash2,
  Plus,
  LogOut,
  ShoppingBag,
  PackageOpen,
  Search,
  X,
  Check,
  Moon,
  Sun,
} from "lucide-react";

interface ShoppingItem {
  id: string;
  text: string;
  completed: boolean;
  userId: string;
  createdAt?: any;
}

type FilterType = "all" | "active" | "done";

/* ——— Dark mode hook ——— */
function useDarkMode() {
  const [dark, setDark] = React.useState<boolean>(() => {
    return localStorage.getItem("theme") === "dark";
  });

  React.useEffect(() => {
    document.body.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

/* ——— Swipe hook: returns touch handlers to attach to a container ——— */
const FILTERS: FilterType[] = ["all", "active", "done"];

function useSwipeTabs(
  filter: FilterType,
  setFilter: (f: FilterType) => void
) {
  const touchStartX = React.useRef<number>(0);
  const touchStartY = React.useRef<number>(0);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;

    // Only handle clearly horizontal swipes (dx > 50px, not mostly vertical)
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.8) return;

    const idx = FILTERS.indexOf(filter);
    if (dx < 0 && idx < FILTERS.length - 1) setFilter(FILTERS[idx + 1]); // swipe left → next
    if (dx > 0 && idx > 0) setFilter(FILTERS[idx - 1]);                  // swipe right → prev
  };

  return { onTouchStart, onTouchEnd };
}


const ShoppingList: React.FC = () => {
  const { user, logout } = useAuth();
  const { dark, toggle: toggleDark } = useDarkMode();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [newItem, setNewItem] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const swipeHandlers = useSwipeTabs(filter, setFilter);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "shoppingItems"),
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const itemsData = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as ShoppingItem[];

        itemsData.sort((a, b) => {
          const timeA = a.createdAt?.toMillis() || 0;
          const timeB = b.createdAt?.toMillis() || 0;
          return timeB - timeA;
        });

        setItems(itemsData);
      },
      (error) => {
        console.error("Snapshot error:", error);
      }
    );

    return unsubscribe;
  }, [user]);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.trim() || !user) return;

    try {
      await addDoc(collection(db, "shoppingItems"), {
        text: newItem.trim(),
        completed: false,
        userId: user.uid,
        createdAt: serverTimestamp(),
      });
      setNewItem("");
    } catch (error) {
      console.error("Add item error:", error);
    }
  };

  const toggleComplete = async (id: string, completed: boolean) => {
    try {
      await updateDoc(doc(db, "shoppingItems", id), { completed: !completed });
    } catch (error) {
      console.error("Update item error:", error);
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, "shoppingItems", id));
    } catch (error) {
      console.error("Delete item error:", error);
    }
  };

  const clearCompleted = async () => {
    const done = items.filter((i) => i.completed);
    await Promise.all(done.map((i) => deleteItem(i.id)));
  };

  const filtered = useMemo(() => {
    let list = items;

    if (filter === "active") list = list.filter((i) => !i.completed);
    else if (filter === "done") list = list.filter((i) => i.completed);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) => i.text.toLowerCase().includes(q));
    }

    return list;
  }, [items, filter, search]);

  const activeItems = filtered.filter((i) => !i.completed);
  const doneItems = filtered.filter((i) => i.completed);
  const allDoneCount = items.filter((i) => i.completed).length;

  const filterLabels: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Needed" },
    { key: "done", label: "Got it" },
  ];

  return (
    <div className="app-wrapper">
      {/* ——— HEADER ——— */}
      <header className="navbar">
        <div className="navbar-content">
          <div className="nav-brand">
            <div className="nav-brand-icon">
              <ShoppingBag size={18} strokeWidth={2.5} />
            </div>
            <span className="nav-brand-name">List<em>y</em></span>
          </div>

          <div className="user-actions">
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
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button onClick={logout} className="logout-btn" title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* ——— MAIN ——— */}
      <main className="container" {...swipeHandlers}>
        {/* Heading */}
        <div className="page-heading">
          <h1 className="page-title">My List</h1>
          <p className="page-subtitle">
            {items.length === 0
              ? "Nothing here yet."
              : `${items.length} ${items.length === 1 ? "item" : "items"} · ${allDoneCount} checked off`}
          </p>
        </div>

        {/* Search */}
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
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch("")}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Add item */}
        <form onSubmit={addItem} className="add-form">
          <input
            type="text"
            className="add-input"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Add an item…"
            autoFocus
          />
          <button type="submit" className="add-btn" title="Add item">
            <Plus size={22} strokeWidth={2.5} />
          </button>
        </form>

        {/* Filter tabs + stats */}
        <div className="filter-tabs">
          {filterLabels.map(({ key, label }) => (
            <button
              key={key}
              className={`filter-tab ${filter === key ? "active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Stats + clear button */}
        {items.length > 0 && (
          <div className="stats-bar">
            <span className="stats-text">
              <strong>{activeItems.length}</strong> remaining
            </span>
            {allDoneCount > 0 && (
              <button className="clear-done-btn" onClick={clearCompleted}>
                Clear {allDoneCount} done
              </button>
            )}
          </div>
        )}

        {/* List */}
        <div className="items-section">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <PackageOpen size={56} className="empty-icon" strokeWidth={1} />
              <p className="empty-title">
                {search ? "No matches" : items.length === 0 ? "Bag is empty" : "Nothing here"}
              </p>
              <p className="empty-text">
                {search
                  ? "Try a different search term."
                  : items.length === 0
                    ? "Add your first item above to get started."
                    : "Switch filters to see other items."}
              </p>
            </div>
          ) : (
            <div className="items-list">
              {/* Active items */}
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
                    />
                  ))}
                </>
              )}

              {/* Completed items */}
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
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

/* ——— User Avatar with initials fallback ——— */
interface UserAvatarProps {
  user: any;
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

  return (
    <div className="user-avatar user-avatar-initials">
      {initial}
    </div>
  );
};

/* ——— Single Item Row ——— */
interface ItemRowProps {
  item: ShoppingItem;
  index: number;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}

const ItemRow: React.FC<ItemRowProps> = ({ item, index, onToggle, onDelete }) => (
  <div
    className={`item-row ${item.completed ? "completed" : ""}`}
    style={{ animationDelay: `${index * 0.04}s`, cursor: "pointer" }}
    onClick={() => onToggle(item.id, item.completed)}
  >
    <button
      className={`toggle-btn ${item.completed ? "is-checked" : ""}`}
      onClick={(e) => { e.stopPropagation(); onToggle(item.id, item.completed); }}
      tabIndex={-1}
      aria-hidden="true"
    >
      {item.completed && <Check size={13} strokeWidth={3} />}
    </button>

    <span className="item-text">{item.text}</span>

    <button
      className="delete-btn"
      onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
      title="Remove item"
    >
      <Trash2 size={15} />
    </button>
  </div>
);

export default ShoppingList;
