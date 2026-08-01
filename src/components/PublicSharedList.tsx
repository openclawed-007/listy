import React, { useEffect, useMemo, useState } from "react";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  Check,
  Moon,
  PackageOpen,
  Pencil,
  Plus,
  Sun,
  Trash2,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { db } from "../firebase";
import {
  hasAnyPermission,
  NO_PERMISSIONS,
  normalizeSharePermissions,
  type SharePermissions,
} from "../lib/sharePermissions";
import {
  DEFAULT_CATEGORY,
  formatQuantity,
  getDuplicateKey,
  MAX_ITEM_TEXT_LENGTH,
  parseItemInput,
} from "../lib/itemInput";
import { groupItemsByCategory, isRecord } from "../lib/shoppingItem";
import { useAuth } from "../context/useAuth";
import { useDarkMode } from "../hooks/useDarkMode";
import {
  clearLocalTicks,
  pruneTicks,
  readLocalTicks,
  resolveCompleted,
  sameTicks,
  toggleTick,
  writeLocalTicks,
  type LocalTicks,
} from "../lib/localTicks";
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
  const { dark, toggle: toggleDark } = useDarkMode();
  // Ticks this device made on a list it is not allowed to write to.
  const [localTicks, setLocalTicks] = useState<LocalTicks>(() =>
    shareId ? readLocalTicks(shareId) : {},
  );

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
        setLocalTicks((current) => {
          if (Object.keys(current).length === 0) return current;
          const next = pruneTicks(current, data.items);
          if (sameTicks(next, current)) return current;
          if (shareId) writeLocalTicks(shareId, next);
          return next;
        });
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
  // Whoever is holding the link is usually the one at the shop, so ticking
  // always works. When it cannot be saved for everyone it is kept on this
  // device instead of being silently thrown away.
  const ticksAreLocal = !canToggle;

  // What the visitor sees: the owner's list, with this device's own ticks laid
  // over the top while they are not being published.
  const viewItems = useMemo(
    () =>
      ticksAreLocal
        ? items.map((item) => ({
            ...item,
            completed: resolveCompleted(localTicks, item),
          }))
        : items,
    [items, localTicks, ticksAreLocal],
  );

  const groups = useMemo(() => groupItemsByCategory(viewItems), [viewItems]);
  const doneCount = useMemo(
    () => viewItems.filter((item) => item.completed).length,
    [viewItems],
  );
  const progress = viewItems.length
    ? Math.round((doneCount / viewItems.length) * 100)
    : 0;
  const preview = useMemo(() => parseItemInput(newItemText), [newItemText]);

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
    if (ticksAreLocal) {
      setLocalTicks((current) => {
        const next = toggleTick(current, item);
        if (shareId) writeLocalTicks(shareId, next);
        return next;
      });
      return;
    }

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
    setSaveError("");
    persistItems(buildToggledPayload(rawItemsRef.current, item.index), flip);
  };

  const resetLocalTicks = () => {
    if (!shareId) return;
    clearLocalTicks(shareId);
    setLocalTicks({});
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

          <div className="user-actions">
            <button
              onClick={toggleDark}
              className="theme-toggle"
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
              type="button"
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>

      <main className="container">
        <div className="page-heading">
          <h1 className="page-title">{ownerName}</h1>
          {items.length === 0 && (
            <p className="page-subtitle">Nothing here yet.</p>
          )}
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
            <div className="add-primary-row">
              <input
                type="text"
                className="add-input"
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                placeholder="Add an item…"
                aria-label="Add an item to the shared list"
                aria-describedby="public-add-hint"
                maxLength={MAX_ITEM_TEXT_LENGTH}
                autoComplete="off"
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
            </div>
            {/* Same live preview as the owner's field, so a visitor can see
                that "2 milk" became a quantity and an aisle. */}
            <p id="public-add-hint" className="add-hint" aria-live="polite">
              {preview.quantity || preview.category ? (
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
        )}

        {items.length === 0 ? (
          <div className="empty-state">
            <PackageOpen size={56} className="empty-icon" strokeWidth={1} />
            <p className="empty-title">{emptyTitle}</p>
            <p className="empty-text">{emptyText}</p>
          </div>
        ) : (
          <>
            {/* Same progress summary as the owner's screen — a shared list is
                still a shop to get through. */}
            <div className="list-summary">
              <div className="stats-bar">
                <span className="stats-text">
                  <strong>{viewItems.length - doneCount}</strong> left
                  {doneCount > 0 && ` · ${doneCount} done`}
                </span>
                {ticksAreLocal && doneCount > 0 && (
                  <button
                    className="clear-done-btn"
                    type="button"
                    onClick={resetLocalTicks}
                  >
                    Reset ticks
                  </button>
                )}
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-label={`${doneCount} of ${viewItems.length} items picked up`}
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

            {ticksAreLocal && (
              <p className="local-ticks-note">
                Ticking items keeps your place on this device. It does not
                change the list for {ownerName}.
              </p>
            )}

            <div className="items-list">
              {groups.map((group) => (
                <div className="category-group" key={group.category}>
                  {(groups.length > 1 ||
                    group.category !== DEFAULT_CATEGORY) && (
                    <div className="category-heading">{group.category}</div>
                  )}
                  {group.items.map((item, index) => (
                    <div
                      key={item.id}
                      className={`item-row public-item-row ${item.completed ? "completed" : ""}`}
                      style={{
                        animationDelay: `${Math.min(index, 8) * 0.04}s`,
                      }}
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
                        {item.quantity && (
                          <span className="item-qty">
                            {formatQuantity(item.quantity)}
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
