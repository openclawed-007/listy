import React, { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { Check, PackageOpen, ShoppingBag } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { db } from "../firebase";

interface SharedListSnapshot {
  ownerId: string;
  ownerName: string;
  items: Array<{
    text: string;
    completed: boolean;
  }>;
}

interface PublicItem {
  id: string;
  text: string;
  completed: boolean;
}

const PublicSharedList: React.FC = () => {
  const { shareId } = useParams();
  const [ownerName, setOwnerName] = useState("Shared list");
  const [items, setItems] = useState<PublicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!shareId || !db) {
      setError("This shared list is not available.");
      setLoading(false);
      return;
    }

    const loadSharedList = async () => {
      try {
        const snapshot = await getDoc(doc(db, "sharedLists", shareId));
        if (!snapshot.exists()) {
          setError("This shared list is no longer available.");
          return;
        }

        const data = snapshot.data() as SharedListSnapshot;
        const sharedItems = Array.isArray(data.items) ? data.items : [];
        setOwnerName(data.ownerName || "Shared list");
        setItems(
          sharedItems
            .filter((item) => item.text.trim())
            .map((item, index) => ({
              id: `${index}-${item.text}`,
              text: item.text.trim(),
              completed: item.completed,
            })),
        );
      } catch (loadError) {
        console.error("Load public shared list error:", loadError);
        setError("Unable to load this shared list right now.");
      } finally {
        setLoading(false);
      }
    };

    void loadSharedList();
  }, [shareId]);

  const remainingCount = useMemo(() => items.filter((item) => !item.completed).length, [items]);

  const toggleItem = (id: string) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      ),
    );
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

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
        </div>
      </header>

      <main className="container">
        <div className="page-heading">
          <h1 className="page-title">{ownerName}</h1>
          <p className="page-subtitle">
            {items.length === 0
              ? "Nothing here yet."
              : `${items.length} ${items.length === 1 ? "item" : "items"} · ${remainingCount} remaining`}
          </p>
          {error && (
            <p className="form-error inline-error" role="alert">
              {error}
            </p>
          )}
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <PackageOpen size={56} className="empty-icon" strokeWidth={1} />
            <p className="empty-title">List unavailable</p>
            <p className="empty-text">Ask the owner to refresh their share link.</p>
          </div>
        ) : (
          <>
            <div className="items-list">
              {items.map((item, index) => (
                <button
                  key={item.id}
                  className={`item-row public-item-row ${item.completed ? "completed" : ""}`}
                  style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
                  onClick={() => toggleItem(item.id)}
                  type="button"
                  aria-pressed={item.completed}
                >
                  <span className={`toggle-btn ${item.completed ? "is-checked" : ""}`}>
                    {item.completed && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="item-text">{item.text}</span>
                </button>
              ))}
            </div>

            {shareId && (
              <Link className="import-link-btn" to={`/import/${shareId}`}>
                Sign in to save this list
              </Link>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default PublicSharedList;
