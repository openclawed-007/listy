import React, { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { Check, PackageOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { db } from "../firebase";
import {
  anonymousPermissions,
  hasAnyPermission,
  NO_PERMISSIONS,
  normalizeSharePermissions,
  type SharePermissions,
} from "../lib/sharePermissions";
import { useAuth } from "../context/useAuth";
import BrandMark from "./BrandMark";

const MAX_ITEM_TEXT_LENGTH = 500;
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
  allowAnonymousEdits: boolean;
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

  const permissions = normalizeSharePermissions(data.permissions);

  return {
    ownerId: data.ownerId,
    ownerName: getSafeOwnerName(data.ownerName),
    allowEdits: data.allowEdits === true && hasAnyPermission(permissions),
    allowAnonymousEdits: data.allowAnonymousEdits === true,
    permissions,
    items: normalizeSharedItems(data.items),
  };
}

// Map a single raw stored item into the clean payload shape, dropping empty
// optional fields so writes stay consistent with what the owner stores.
function toPayloadItem(item: unknown, override?: Partial<SharedItemData>): SharedItemData {
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
      ? toPayloadItem(item, { completed: !(isRecord(item) && item.completed === true) })
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
  const { user, loginAnonymously } = useAuth();
  const [ownerName, setOwnerName] = useState("Shared list");
  const [items, setItems] = useState<PublicItem[]>([]);
  const [permissions, setPermissions] =
    useState<SharePermissions>(NO_PERMISSIONS);
  const [allowAnonymousEdits, setAllowAnonymousEdits] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [newItemText, setNewItemText] = useState("");
  const rawItemsRef = React.useRef<unknown>([]);
  const anonSignInAttempted = React.useRef(false);
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
        setAllowAnonymousEdits(data.allowAnonymousEdits);
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

  const signedIn = Boolean(user) && Boolean(db) && Boolean(shareId);
  const isAnonymous = Boolean(user?.isAnonymous);
  const isOwnerViewing = Boolean(user) && user?.uid === ownerId;

  // The owner allows anonymous (not-signed-in) visitors to edit when sharing is
  // on, at least one permission is granted, and they opted in. Anonymous
  // visitors are limited to toggle/add (never remove) by anonymousPermissions.
  const anonymousEditingOffered =
    allowEdits && allowAnonymousEdits && !isOwnerViewing;

  // Effective permissions for THIS viewer: anonymous users get the narrowed
  // anonymous set; signed-in collaborators get the owner's full grant.
  const effectivePermissions: SharePermissions =
    isAnonymous && !isOwnerViewing
      ? anonymousPermissions(permissions, allowAnonymousEdits)
      : permissions;

  const canToggle = signedIn && effectivePermissions.toggle;
  const canAdd = signedIn && effectivePermissions.add;
  const canRemove = signedIn && effectivePermissions.remove;
  const canEdit = signedIn && hasAnyPermission(effectivePermissions);

  // Silently sign visitors in anonymously when the owner has opted in, so a
  // QR/link scanner can edit (toggle/add) without a Google sign-in popup.
  // App Check is enforced server-side, so these anonymous writes still require
  // a valid app attestation and carry a real, traceable uid.
  useEffect(() => {
    if (
      !db ||
      !shareId ||
      user ||
      !anonymousEditingOffered ||
      anonSignInAttempted.current
    )
      return;

    anonSignInAttempted.current = true;
    loginAnonymously().catch((signInError) => {
      console.error("Anonymous sign-in for shared list failed:", signInError);
    });
  }, [user, anonymousEditingOffered, shareId, loginAnonymously]);

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

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newItemText.trim().slice(0, MAX_ITEM_TEXT_LENGTH);
    if (!trimmed || !canAdd) return;
    if (items.length >= MAX_ITEMS) {
      setSaveError("This list is full.");
      return;
    }

    const newItem: SharedItemData = { text: trimmed, completed: false };
    const previousItems = items;
    const nextIndex = items.length;

    setItems((currentItems) => [
      ...currentItems,
      {
        id: `${nextIndex}-${trimmed}`,
        index: nextIndex,
        text: trimmed,
        completed: false,
      },
    ]);
    setNewItemText("");
    setSaveError("");
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
                {effectivePermissions.toggle && (
                  <span className="share-cap" title="Check items off">
                    <Check size={13} strokeWidth={2.75} />
                    Check off
                  </span>
                )}
                {effectivePermissions.add && (
                  <span className="share-cap" title="Add items">
                    <Plus size={13} strokeWidth={2.75} />
                    Add
                  </span>
                )}
                {effectivePermissions.remove && (
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
                    disabled={!canToggle && signedIn}
                  >
                    {item.completed && <Check size={13} strokeWidth={3} />}
                  </button>
                  <button
                    className="item-content public-item-content"
                    onClick={() => toggleItem(item)}
                    type="button"
                    aria-pressed={item.completed}
                    aria-label={item.text}
                  >
                    <span className="item-text">{item.text}</span>
                    {(item.quantity || item.category) && (
                      <span className="item-meta">
                        {item.quantity && <span>{item.quantity}</span>}
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
                {allowEdits && !signedIn && !anonymousEditingOffered
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
