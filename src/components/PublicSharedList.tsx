import React, { useEffect, useMemo, useState } from "react";
import {
  doc,
  onSnapshot,
} from "firebase/firestore";
import {
  Check,
  PackageOpen,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { db } from "../firebase";
import { resolveValidatedShareCode } from "../lib/allocateShareCode";
import {
  isValidShareCode,
  normalizeShareCodeInput,
} from "../lib/shareCode";
import {
  hasAnyPermission,
  NO_PERMISSIONS,
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
import {
  createCollaboratorItemId,
  MAX_PUBLIC_ITEMS,
  normalizePublicSharedList,
  payloadToPublicItems,
  type PublicItem,
  type SharedItemData,
} from "../lib/publicSharedListModel";
import {
  applySharedListMutation,
  commitSharedListMutation,
  type SharedListMutation,
} from "../lib/sharedListMutations";
import { useAuth } from "../context/useAuth";
import { usePreferences } from "../context/usePreferences";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
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
import ThemeToggle from "./ThemeToggle";

const PublicSharedList: React.FC = () => {
  const { shareId: shareIdParam, code: codeParam } = useParams();
  const [resolvedShareId, setResolvedShareId] = useState(shareIdParam ?? "");
  const { user } = useAuth();
  const { interfacePrefs } = usePreferences();
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
  const seenShareSnapshotRef = React.useRef(false);
  const lastShareFingerprintRef = React.useRef("");
  const allowEdits = hasAnyPermission(permissions);
  // Ticks this device made on a list it is not allowed to write to.
  const shareId = resolvedShareId;
  const [localTicks, setLocalTicks] = useState<LocalTicks>({});
  useDocumentTitle(loading || error ? null : ownerName);

  useEffect(() => {
    if (shareIdParam) {
      setResolvedShareId(shareIdParam);
      return;
    }

    const raw = codeParam ? normalizeShareCodeInput(codeParam) : "";
    if (!raw || !db) {
      setResolvedShareId("");
      return;
    }
    if (!isValidShareCode(raw)) {
      setError("That share code is not valid.");
      setLoading(false);
      setResolvedShareId("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    void resolveValidatedShareCode(db, raw).then((result) => {
      if (cancelled) return;
      if (result.status === "inactive") {
        setError("This shared list is no longer available.");
        setLoading(false);
        setResolvedShareId("");
        return;
      }
      if (result.status === "ok") setResolvedShareId(result.ownerId);
    }).catch((resolveError) => {
      if (cancelled) return;
      console.error("Resolve share code error:", resolveError);
      setError("Unable to load this shared list right now.");
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [shareIdParam, codeParam]);

  useEffect(() => {
    if (!shareId) {
      setLocalTicks({});
      return;
    }
    setLocalTicks(readLocalTicks(shareId));
  }, [shareId]);

  useEffect(() => {
    if (!shareId || !db) return;
    seenShareSnapshotRef.current = false;
    lastShareFingerprintRef.current = "";

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
        const data = normalizePublicSharedList(raw);
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

        const fingerprint = JSON.stringify(
          data.items.map((item) => [
            item.id,
            item.text,
            item.completed,
            item.quantity,
            item.note,
          ]),
        );
        if (seenShareSnapshotRef.current) {
          if (fingerprint !== lastShareFingerprintRef.current) {
            void import("../lib/shareChangeNotifications").then(
              ({ notifyShareListChange }) =>
                notifyShareListChange({
                  enabled: interfacePrefs.shareChangeNotices,
                  ownerId: data.ownerId,
                  ownerName: data.ownerName,
                  changeCount: 1,
                }),
            );
          }
        } else {
          seenShareSnapshotRef.current = true;
        }
        lastShareFingerprintRef.current = fingerprint;

        setError("");
        setOwnerName(data.ownerName);
        setOwnerId(data.ownerId);
        setPermissions(data.permissions);
        setItems(payloadToPublicItems(data.items));
        setLoading(false);
      },
      (loadError) => {
        console.error("Load public shared list error:", loadError);
        setError("Unable to load this shared list right now.");
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [interfacePrefs.shareChangeNotices, shareId]);

  useEffect(() => {
    if (!addNotice) return undefined;

    const timeoutId = window.setTimeout(() => setAddNotice(""), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [addNotice]);

  // Prefer the specific resolve/snapshot error. An empty shareId after a failed
  // /c/:code lookup used to hide that message behind a generic unavailable line.
  const displayError =
    error ||
    (!shareId || !db ? "This shared list is not available." : "");
  const emptyTitle = "Bag is empty";
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

  const groups = useMemo(() => {
    // Important floats first within each aisle so must-get items stay obvious.
    const ordered = [...viewItems].sort((a, b) => {
      const aImportant = a.important === true;
      const bImportant = b.important === true;
      if (aImportant !== bImportant) return aImportant ? -1 : 1;
      return 0;
    });
    return groupItemsByCategory(ordered);
  }, [viewItems]);
  const doneCount = useMemo(
    () => viewItems.filter((item) => item.completed).length,
    [viewItems],
  );
  const progress = viewItems.length
    ? Math.round((doneCount / viewItems.length) * 100)
    : 0;
  const preview = useMemo(() => parseItemInput(newItemText), [newItemText]);

  const persistMutation = (
    mutation: SharedListMutation,
    onError: () => void,
  ) => {
    if (!db || !shareId) return;

    const payload = applySharedListMutation(rawItemsRef.current, mutation);
    rawItemsRef.current = payload;

    void commitSharedListMutation(db, shareId, mutation).catch(
      (updateError) => {
        console.error("Collaborator update error:", updateError);
        onError();
        setSaveError("Couldn't save that change. Please try again.");
      },
    );

    return payload;
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

    const previousRaw = rawItemsRef.current;
    const previousItems = items;
    const mutation: SharedListMutation = {
      type: "setCompleted",
      target: item,
      completed: !item.completed,
    };
    const payload = persistMutation(mutation, () => {
      rawItemsRef.current = previousRaw;
      setItems(previousItems);
    });
    if (payload) {
      setItems(payloadToPublicItems(payload));
      setSaveError("");
    }
  };

  const resetLocalTicks = () => {
    if (!shareId) return;
    clearLocalTicks(shareId);
    setLocalTicks({});
  };

  const removeItem = (item: PublicItem) => {
    if (!canRemove) return;

    const previousRaw = rawItemsRef.current;
    const previousItems = items;
    const payload = persistMutation({ type: "remove", target: item }, () => {
      rawItemsRef.current = previousRaw;
      setItems(previousItems);
    });
    if (payload) {
      setItems(payloadToPublicItems(payload));
      setSaveError("");
    }
  };

  // Visitors get the same smart field as the list owner: "2 milk" sets the
  // quantity and files the item under the right aisle.
  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdd) return;

    const { text, quantity, category } = parseItemInput(newItemText);
    if (!text) return;
    if (items.length >= MAX_PUBLIC_ITEMS) {
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
      id: createCollaboratorItemId(),
      text,
      completed: false,
      ...(quantity ? { quantity } : {}),
      ...(category ? { category } : {}),
    };
    const previousRaw = rawItemsRef.current;
    const previousItems = items;
    const payload = persistMutation({ type: "add", item: newItem }, () => {
      rawItemsRef.current = previousRaw;
      setItems(previousItems);
    });
    if (payload) {
      setItems(payloadToPublicItems(payload));
      setNewItemText("");
      setSaveError("");
      setAddNotice("");
    }
  };

  if (loading && !error) {
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
          <Link
            to={user ? "/" : "/login"}
            className={`nav-brand ${interfacePrefs.brandLogo ? "" : "is-text-only"}`}
          >
            {interfacePrefs.brandLogo && (
              <div className="nav-brand-icon">
                <BrandMark className="brand-mark" />
              </div>
            )}
            <span className="nav-brand-name">
              Cart<em>Link</em>
            </span>
          </Link>

          <div className="user-actions">
            <ThemeToggle className="theme-toggle" />
            <Link className="nav-text-link" to={user ? "/" : "/login"}>
              {user ? "My list" : "Sign in"}
            </Link>
          </div>
        </div>
      </header>

      <main className="container">
        <div className="page-heading">
          <h1 className="page-title">{ownerName}</h1>
          {items.length === 0 && !displayError && (
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
          {shareId && !isOwnerViewing && !displayError && (
            <Link
              className="import-link-btn"
              to={
                user
                  ? `/import/${shareId}`
                  : `/login?redirect=${encodeURIComponent(`/import/${shareId}`)}`
              }
            >
              {user
                ? "Add this list to my tabs"
                : allowEdits
                  ? "Sign in to edit this list"
                  : "Sign in to save this list"}
            </Link>
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
            <PackageOpen size={40} className="empty-icon" strokeWidth={1.25} />
            {!displayError && <p className="empty-title">{emptyTitle}</p>}
            <p className="empty-text">{emptyText}</p>
          </div>
        ) : (
          <>
            {/* Same progress summary as the owner's screen — a shared list is
                still a shop to get through. */}
            <div className="list-summary">
              <div className="list-meta-row">
                <span className="stats-text">
                  <strong>{viewItems.length - doneCount}</strong> left
                  {doneCount > 0 && ` · ${doneCount} done`}
                </span>
                <div className="stats-actions">
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
              </div>
              {interfacePrefs.progressBar && (
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
              )}
            </div>

            {ticksAreLocal && interfacePrefs.onboardingCopy && (
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
                    <h3 className="category-heading">{group.category}</h3>
                  )}
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className={`item-row public-item-row ${item.completed ? "completed" : ""} ${interfacePrefs.importantStars && item.important ? "is-important" : ""}`}
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
                        aria-label={
                          item.important
                            ? `Important: ${item.text}${item.note ? ` — ${item.note}` : ""}`
                            : `${item.text}${item.note ? ` — ${item.note}` : ""}`
                        }
                      >
                        <span className="item-main-line">
                          <span className="item-text">{item.text}</span>
                          {item.quantity && (
                            <span className="item-qty">
                              {formatQuantity(item.quantity)}
                            </span>
                          )}
                          {interfacePrefs.importantStars && item.important && (
                            <span
                              className="item-important-badge"
                              aria-hidden="true"
                              title="Important"
                            >
                              ★
                            </span>
                          )}
                        </span>
                        {item.note && (
                          <span className="item-note" title={item.note}>
                            {item.note}
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

          </>
        )}
      </main>
    </div>
  );
};

export default PublicSharedList;
