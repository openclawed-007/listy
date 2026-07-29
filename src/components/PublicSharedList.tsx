import React, { useEffect, useMemo, useState } from "react";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { Check, PackageOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { db } from "../firebase";
import {
  hasAnyPermission,
  NO_PERMISSIONS,
  normalizeSharePermissions,
  type SharePermissions,
} from "../lib/sharePermissions";
import {
  formatQuantity,
  getDuplicateKey,
  MAX_ITEM_TEXT_LENGTH,
  parseItemInput,
} from "../lib/itemInput";
import { isRecord } from "../lib/shoppingItem";
import { useAuth } from "../context/useAuth";
import BrandMark from "./BrandMark";

const MAX_ITEMS = 500;

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
  permissions: SharePermissions;
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

  const permissions = normalizeSharePermissions(data.permissions);

  return {
    ownerId: data.ownerId,
    ownerName: getSafeOwnerName(data.ownerName),
    allowEdits: data.allowEdits === true && hasAnyPermission(permissions),
    permissions,
    items: normalizeSharedItems(data.items),
  };
}

// Map a single raw stored item into the clean payload shape, dropping empty
// optional fields so writes stay consistent with what the owner stores.
function toPayloadItem(
  item: unknown,
  override?: Partial<SharedItemData>,
): SharedItemData {
  const record = isRecord(item) ? item : {};
  const base: SharedItemData = {
    text: typeof record.text === "string" ? record.text : "",
    completed: record.completed === true,
    ...(typeof record.quantity === "string" && record.quantity
      ? { quantity: record.quantity }
      : {}),
    ...(typeof record.category === "string" && record.category
      ? { category: record.category }
      : {}),
  };

  return { ...base, ...override };
}

// Rebuild the items array from the owner's raw data, toggling one item.
function buildToggledPayload(
  rawItems: unknown,
  toggledIndex: number,
): SharedItemData[] {
  if (!Array.isArray(rawItems)) return [];

  return rawItems.map((item, index) =>
    index === toggledIndex
      ? toPayloadItem(item, {
          completed: !(isRecord(item) && item.completed === true),
        })
      : toPayloadItem(item),
  );
}

// Rebuild the items array, removing one item by index.
function buildRemovedPayload(
  rawItems: unknown,
  removedIndex: number,
): SharedItemData[] {
  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .filter((_item, index) => index !== removedIndex)
    .map((item) => toPayloadItem(item));
}

// Rebuild the items array, appending a new item.
function buildAddedPayload(
  rawItems: unknown,
  newItem: SharedItemData,
): SharedItemData[] {
  const existing = Array.isArray(rawItems)
    ? rawItems.map((item) => toPayloadItem(item))
    : [];

  return [...existing, newItem];
}

const PublicSharedList: React.FC = () => {
  const { shareId } = useParams();
  const { user } = useAuth();
  const [ownerName, setOwnerName] = useState("Shared list");
  const [items, setItems] = useState<PublicItem[]>([]);
  const [permissions, setPermissions] =
    useState<SharePermissions>(NO_PERMISSIONS);
  const [ownerId, setOwnerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [newItemText, setNewItemText] = useState("");
  const [addNotice, setAddNotice] = useState("");
  const rawItemsRef = React.useRef<unknown>([]);
  const allowEdits = hasAnyPermission(permissions);

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
        setPermissions(data.permissions);
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

  useEffect(() => {
    if (!addNotice) return undefined;

    const timeoutId = window.setTimeout(() => setAddNotice(""), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [addNotice]);

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

  const signedIn = Boolean(user) && Boolean(db) && Boolean(shareId);
  const canEdit = allowEdits && signedIn;
  const canToggle = signedIn && permissions.toggle;
  const canAdd = signedIn && permissions.add;
  const canRemove = signedIn && permissions.remove;
  const isOwnerViewing = Boolean(user) && user?.uid === ownerId;

  const persistItems = (payload: SharedItemData[], onError: () => void) => {
    if (!db || !shareId) return;

    updateDoc(doc(db, "sharedLists", shareId), {
      items: payload,
      updatedAt: serverTimestamp(),
    }).catch((updateError) => {
      console.error("Collaborator update error:", updateError);
      onError();
      setSaveError("Couldn't save that change. Please try again.");
    });
  };

  const toggleItem = (item: PublicItem) => {
    const flip = () =>
      setItems((currentItems) =>
        currentItems.map((current) =>
          current.id === item.id
            ? { ...current, completed: !current.completed }
            : current,
        ),
      );

    // Optimistic local feedback first.
    flip();

    if (!canToggle) return;

    setSaveError("");
    persistItems(buildToggledPayload(rawItemsRef.current, item.index), flip);
  };

  const removeItem = (item: PublicItem) => {
    if (!canRemove) return;

    const previousItems = items;
    setItems((currentItems) =>
      currentItems.filter((current) => current.id !== item.id),
    );
    setSaveError("");
    persistItems(buildRemovedPayload(rawItemsRef.current, item.index), () =>
      setItems(previousItems),
    );
  };

  // Visitors get the same smart field as the list owner: "2 milk" sets the
  // quantity and files the item under the right aisle.
  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdd) return;

    const { text, quantity, category } = parseItemInput(newItemText);
    if (!text) return;
    if (items.length >= MAX_ITEMS) {
      setSaveError("This list is full.");
      return;
    }

    const duplicate = items.find(
      (item) => getDuplicateKey(item.text) === getDuplicateKey(text),
    );
    if (duplicate) {
      setNewItemText("");
      setSaveError("");
      setAddNotice(`${duplicate.text} is already on this list.`);
      return;
    }

    const newItem: SharedItemData = {
      text,
      completed: false,
      ...(quantity ? { quantity } : {}),
      ...(category ? { category } : {}),
    };
    const previousItems = items;
    const nextIndex = items.length;

    setItems((currentItems) => [
      ...currentItems,
      {
        id: `${nextIndex}-${text}`,
        index: nextIndex,
        text,
        completed: false,
        quantity,
        category,
      },
    ]);
    setNewItemText("");
    setSaveError("");
    setAddNotice("");
    persistItems(buildAddedPayload(rawItemsRef.current, newItem), () =>
      setItems(previousItems),
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
          {!displayError && allowEdits && (
            <div
              className={`share-caps ${canEdit ? "is-active" : ""}`}
              role="status"
            >
              <span className="share-caps-label">
                <Pencil size={13} strokeWidth={2.5} />
                {canEdit ? "You can" : "Sign in to"}
              </span>
              <span className="share-caps-chips">
                {permissions.toggle && (
                  <span className="share-cap" title="Check items off">
                    <Check size={13} strokeWidth={2.75} />
                    Check off
                  </span>
                )}
                {permissions.add && (
                  <span className="share-cap" title="Add items">
                    <Plus size={13} strokeWidth={2.75} />
                    Add
                  </span>
                )}
                {permissions.remove && (
                  <span className="share-cap" title="Remove items">
                    <Trash2 size={12} strokeWidth={2.75} />
                    Remove
                  </span>
                )}
              </span>
            </div>
          )}
          {saveError && (
            <p className="form-error inline-error" role="alert">
              {saveError}
            </p>
          )}
        </div>

        {canAdd && addNotice && (
          <p className="form-success inline-error" role="status">
            {addNotice}
          </p>
        )}

        {canAdd && (
          <form onSubmit={addItem} className="add-form">
            <input
              type="text"
              className="add-input"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              placeholder="Add an item…"
              aria-label="Add an item to the shared list"
              maxLength={MAX_ITEM_TEXT_LENGTH}
            />
            <button
              type="submit"
              className="add-btn"
              title="Add item"
              aria-label="Add item"
              disabled={!newItemText.trim()}
            >
              <Plus size={22} strokeWidth={2.5} />
            </button>
          </form>
        )}

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
                <div
                  key={item.id}
                  className={`item-row public-item-row ${item.completed ? "completed" : ""} ${canToggle ? "is-editable" : ""}`}
                  style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
                >
                  <button
                    className={`toggle-btn ${item.completed ? "is-checked" : ""}`}
                    onClick={() => toggleItem(item)}
                    type="button"
                    aria-pressed={item.completed}
                    aria-label={
                      item.completed
                        ? `Mark "${item.text}" as needed`
                        : `Mark "${item.text}" as completed`
                    }
                    disabled={!canToggle}
                  >
                    {item.completed && <Check size={13} strokeWidth={3} />}
                  </button>
                  <button
                    className="item-content public-item-content"
                    onClick={() => toggleItem(item)}
                    type="button"
                    aria-pressed={item.completed}
                    aria-label={item.text}
                    disabled={signedIn && !canToggle}
                  >
                    <span className="item-text">{item.text}</span>
                    {(item.quantity || item.category) && (
                      <span className="item-meta">
                        {item.quantity && (
                          <span>{formatQuantity(item.quantity)}</span>
                        )}
                        {item.category && <span>{item.category}</span>}
                      </span>
                    )}
                  </button>
                  {canRemove && (
                    <button
                      className="delete-btn"
                      onClick={() => removeItem(item)}
                      title="Remove item"
                      type="button"
                      aria-label={`Remove "${item.text}"`}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
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
