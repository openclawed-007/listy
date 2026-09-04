import React, { useEffect, useMemo, useState } from "react";
import { subscribeToRawSharedList } from "../services/sharedLists";
import {
  Check,
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
  effectivePermissionsFor,
  hasAnyPermission,
  NO_PERMISSIONS,
  type SharePermissions,
} from "../lib/sharePermissions";
import {
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
import PublicSharedItems from "./PublicSharedItems";

const PublicSharedList: React.FC = () => {
  const { shareId: shareIdParam, code: codeParam } = useParams();
  const [resolvedShareId, setResolvedShareId] = useState(shareIdParam ?? "");
  const { user, loginAnonymously } = useAuth();
  const { interfacePrefs } = usePreferences();
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
  const [addNotice, setAddNotice] = useState("");
  const rawItemsRef = React.useRef<unknown>([]);
  const seenShareSnapshotRef = React.useRef(false);
  const lastShareFingerprintRef = React.useRef("");
  const anonSignInAttempted = React.useRef(false);
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

    const unsubscribe = subscribeToRawSharedList(
      db,
      shareId,
      (exists, raw) => {
        if (!exists || !raw) {
          setError("This shared list is no longer available.");
          setItems([]);
          setLoading(false);
          return;
        }

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
        setAllowAnonymousEdits(data.allowAnonymousEdits);
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
  const isAnonymous = Boolean(user?.isAnonymous);
  // A real account holder (not an anonymous share-page session).
  const hasAccount = Boolean(user) && !isAnonymous;
  const isOwnerViewing = Boolean(user) && user?.uid === ownerId;

  // The owner offers anonymous (not-signed-in) editing when sharing is on, at
  // least one permission is granted, and they opted in.
  const anonymousEditingOffered =
    allowEdits && allowAnonymousEdits && !isOwnerViewing;

  // Effective permissions for THIS viewer: anonymous sessions get the narrowed
  // toggle/add set; signed-in collaborators get the owner's full grant.
  const effectivePermissions = effectivePermissionsFor(
    permissions,
    allowAnonymousEdits,
    isAnonymous && !isOwnerViewing,
  );

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

    void commitSharedListMutation(db, shareId, mutation, { isAnonymous }).catch(
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
            to={hasAccount ? "/" : "/login"}
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
            <Link className="nav-text-link" to={hasAccount ? "/" : "/login"}>
              {hasAccount ? "My list" : "Sign in"}
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
          {shareId && !isOwnerViewing && !displayError && (
            <Link
              className="import-link-btn"
              to={
                hasAccount
                  ? `/import/${shareId}`
                  : `/login?redirect=${encodeURIComponent(`/import/${shareId}`)}`
              }
            >
              {hasAccount
                ? "Add this list to my tabs"
                : allowEdits && !anonymousEditingOffered
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

        <PublicSharedItems
          items={viewItems}
          groups={groups}
          doneCount={doneCount}
          progress={progress}
          displayError={displayError}
          emptyTitle={emptyTitle}
          emptyText={emptyText}
          ownerName={ownerName}
          ticksAreLocal={ticksAreLocal}
          progressBar={interfacePrefs.progressBar}
          onboardingCopy={interfacePrefs.onboardingCopy}
          importantStars={interfacePrefs.importantStars}
          canRemove={canRemove}
          onToggle={toggleItem}
          onRemove={removeItem}
          onResetTicks={resetLocalTicks}
        />
      </main>
    </div>
  );
};

export default PublicSharedList;
