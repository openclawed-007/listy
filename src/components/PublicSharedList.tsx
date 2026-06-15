import React, { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { Check, PackageOpen } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { db } from "../firebase";
import BrandMark from "./BrandMark";

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

interface PublicItem {
  id: string;
  text: string;
  completed: boolean;
  quantity?: string;
  category?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getSafeOwnerName(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 120)
    : "Shared list";
}

function normalizeSharedItems(items: unknown): PublicItem[] {
  if (!Array.isArray(items)) return [];

  return items.flatMap((item, index) => {
    if (!isRecord(item) || typeof item.text !== "string") return [];

    const trimmed = item.text.trim();
    if (!trimmed) return [];

    return [
      {
        id: `${index}-${trimmed}`,
        text: trimmed.slice(0, 500),
        completed: item.completed === true,
        quantity:
          typeof item.quantity === "string" && item.quantity.trim()
            ? item.quantity.trim().slice(0, 40)
            : undefined,
        category:
          typeof item.category === "string" && item.category.trim()
            ? item.category.trim().slice(0, 80)
            : undefined,
      },
    ];
  });
}

function normalizeSharedListSnapshot(data: unknown): SharedListSnapshot | null {
  if (!isRecord(data) || typeof data.ownerId !== "string") return null;

  return {
    ownerId: data.ownerId,
    ownerName: getSafeOwnerName(data.ownerName),
    items: normalizeSharedItems(data.items),
  };
}

const PublicSharedList: React.FC = () => {
  const { shareId } = useParams();
  const [ownerName, setOwnerName] = useState("Shared list");
  const [items, setItems] = useState<PublicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!shareId || !db) return;

    const unsubscribe = onSnapshot(
      doc(db, "sharedLists", shareId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setError("This shared list is no longer available.");
          setItems([]);
          setLoading(false);
          return;
        }

        const data = normalizeSharedListSnapshot(snapshot.data());
        if (!data) {
          setError("This shared list is not available.");
          setItems([]);
          setLoading(false);
          return;
        }

        setError("");
        setOwnerName(data.ownerName);
        setItems(data.items);
        setLoading(false);
      },
      (loadError) => {
        console.error("Load public shared list error:", loadError);
        setError("Unable to load this shared list right now.");
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [shareId]);

  const remainingCount = useMemo(
    () => items.filter((item) => !item.completed).length,
    [items],
  );
  const unavailableError =
    !shareId || !db ? "This shared list is not available." : "";
  const displayError = unavailableError || error;
  const emptyTitle = displayError ? "List unavailable" : "Bag is empty";
  const emptyText = displayError
    ? "Ask the owner to refresh their share link."
    : "This shared list does not have any items yet.";

  const toggleItem = (id: string) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      ),
    );
  };

  if (loading && !unavailableError) {
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
              <BrandMark className="brand-mark" />
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
          {displayError && (
            <p className="form-error inline-error" role="alert">
              {displayError}
            </p>
          )}
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <PackageOpen size={56} className="empty-icon" strokeWidth={1} />
            <p className="empty-title">{emptyTitle}</p>
            <p className="empty-text">{emptyText}</p>
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
                  <span
                    className={`toggle-btn ${item.completed ? "is-checked" : ""}`}
                  >
                    {item.completed && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="item-content">
                    <span className="item-text">{item.text}</span>
                    {(item.quantity || item.category) && (
                      <span className="item-meta">
                        {item.quantity && <span>{item.quantity}</span>}
                        {item.category && <span>{item.category}</span>}
                      </span>
                    )}
                  </span>
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
