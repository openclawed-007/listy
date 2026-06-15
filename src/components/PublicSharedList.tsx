import React, { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { Check, PackageOpen, Pencil } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { db } from "../firebase";
import { useAuth } from "../context/useAuth";
import BrandMark from "./BrandMark";

interface SharedItemData {
  text: string;
  completed: boolean;
  quantity?: string;
  category?: string;
}

interface SharedListSnapshot {
  ownerId: string;
  ownerName: string;
  allowEdits: boolean;
  items: SharedItemData[];
}

interface PublicItem {
  id: string;
  index: number;
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
        index,
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
    allowEdits: data.allowEdits === true,
    items: normalizeSharedItems(data.items),
  };
}

// Rebuild the raw items array the way the owner stored it, so a collaborator
// write keeps the same length, order and fields the security rules expect.
function buildItemsPayload(
  rawItems: unknown,
  toggledIndex: number,
): SharedItemData[] {
  if (!Array.isArray(rawItems)) return [];

  return rawItems.map((item, index) => {
    const record = isRecord(item) ? item : {};
    const text = typeof record.text === "string" ? record.text : "";
    const completed =
      index === toggledIndex
        ? !(record.completed === true)
        : record.completed === true;

    return {
      text,
      completed,
      ...(typeof record.quantity === "string" && record.quantity
        ? { quantity: record.quantity }
        : {}),
      ...(typeof record.category === "string" && record.category
        ? { category: record.category }
        : {}),
    };
  });
}

const PublicSharedList: React.FC = () => {
  const { shareId } = useParams();
  const { user } = useAuth();
  const [ownerName, setOwnerName] = useState("Shared list");
  const [items, setItems] = useState<PublicItem[]>([]);
  const [allowEdits, setAllowEdits] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const rawItemsRef = React.useRef<unknown>([]);

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

        const raw = snapshot.data();
        const data = normalizeSharedListSnapshot(raw);
        if (!data) {
          setError("This shared list is not available.");
          setItems([]);
          setLoading(false);
          return;
        }

        rawItemsRef.current = isRecord(raw) ? raw.items : [];
        setError("");
        setOwnerName(data.ownerName);
        setOwnerId(data.ownerId);
        setAllowEdits(data.allowEdits);
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

  const canEdit = allowEdits && Boolean(user) && Boolean(db) && Boolean(shareId);
  const isOwnerViewing = Boolean(user) && user?.uid === ownerId;

  const toggleItem = (item: PublicItem) => {
    // Always reflect the change locally for instant feedback.
    setItems((currentItems) =>
      currentItems.map((current) =>
        current.id === item.id
          ? { ...current, completed: !current.completed }
          : current,
      ),
    );

    if (!canEdit || !db || !shareId) return;

    const payload = buildItemsPayload(rawItemsRef.current, item.index);

    updateDoc(doc(db, "sharedLists", shareId), {
      items: payload,
      updatedAt: serverTimestamp(),
    }).catch((updateError) => {
      console.error("Collaborator update error:", updateError);
      // Revert the optimistic toggle on failure.
      setItems((currentItems) =>
        currentItems.map((current) =>
          current.id === item.id
            ? { ...current, completed: !current.completed }
            : current,
        ),
      );
      setSaveError("Couldn't save that change. Please try again.");
    });
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
          {!displayError && allowEdits && (
            <p
              className={`share-edit-banner ${canEdit ? "is-active" : ""}`}
              role="status"
            >
              <Pencil size={14} strokeWidth={2.5} />
              {canEdit
                ? isOwnerViewing
                  ? "Editing is on. Your changes sync to your list."
                  : "Editing is on. You can check items off this list."
                : "The owner allows editing. Sign in to check items off."}
            </p>
          )}
          {saveError && (
            <p className="form-error inline-error" role="alert">
              {saveError}
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
                  className={`item-row public-item-row ${item.completed ? "completed" : ""} ${canEdit ? "is-editable" : ""}`}
                  style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
                  onClick={() => toggleItem(item)}
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

            {shareId && !isOwnerViewing && (
              <Link className="import-link-btn" to={`/import/${shareId}`}>
                {allowEdits && !user
                  ? "Sign in to edit this list"
                  : "Sign in to save this list"}
              </Link>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default PublicSharedList;
