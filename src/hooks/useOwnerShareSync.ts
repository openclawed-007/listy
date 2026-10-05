import { useEffect, useRef } from "react";
import type { User } from "firebase/auth";
import { db } from "../firestore";
import { notifyShareListChange } from "../lib/shareChangeNotifications";
import { hasAnyPermission, type SharePermissions } from "../lib/sharePermissions";
import {
  buildPublishedState,
  clearPublishedState,
  diffSharedState,
  hasSharedChanges,
  indexSharedItems,
  mergeOwnerPublish,
  readPublishedState,
  writePublishedState,
  type PublishedState,
} from "../lib/sharedSync";
import {
  getSharedItemContentKey,
  getSharedItemKey,
  PERSONAL_LIST_ID,
  PERSONAL_LIST_NAME,
  toSharedItemPayload,
  type ShoppingItem,
} from "../lib/shoppingItem";
import {
  publishOwnerSnapshot,
  subscribeToSharedList,
} from "../services/sharedLists";
import {
  addShoppingItem,
  deleteShoppingItem,
  updateShoppingItem,
} from "../services/shoppingItems";

const PUBLISH_DEBOUNCE_MS = 350;

interface Options {
  user: User | null;
  ownerName: string;
  /** The owner's "My List" items — the only list that is ever published. */
  personalItems: ShoppingItem[];
  itemsLoaded: boolean;
  isSharing: boolean;
  permissions: SharePermissions;
  allowAnonymousEdits: boolean;
  shareCode: string;
  notifyChanges: boolean;
}

const logError = (label: string) => (error: unknown) =>
  console.error(`${label}:`, error);

/**
 * Two-way sync between the owner's items and their public shared list.
 *
 * Out: every change to My List is published (debounced) to sharedLists/{uid}.
 * In: collaborators write to that same document, so their ticks, adds and
 * removals are pulled back into the owner's own items.
 *
 * Only differences from the snapshot *we* last published count as theirs.
 * Comparing against the live list instead would treat the owner's own
 * not-yet-published edits as collaborator activity and undo them — see
 * src/lib/sharedSync.ts.
 */
export function useOwnerShareSync({
  user,
  ownerName,
  personalItems,
  itemsLoaded,
  isSharing,
  permissions,
  allowAnonymousEdits,
  shareCode,
  notifyChanges,
}: Options) {
  const publishedRef = useRef<PublishedState | null>(
    user ? readPublishedState(user.uid) : null,
  );
  // Latest personal items, readable from the listener without making the
  // subscription tear down and replay on every keystroke.
  const personalItemsRef = useRef(personalItems);
  const allowEdits = hasAnyPermission(permissions);

  useEffect(() => {
    personalItemsRef.current = personalItems;
  }, [personalItems]);

  // Sharing switched off: forget the baseline, so sharing again later starts
  // from the fresh snapshot rather than diffing against a stale one. Only on
  // the on→off transition — the remembered baseline is what lets us pick up
  // collaborator edits made while this app was closed.
  const wasSharingRef = useRef(isSharing);
  useEffect(() => {
    if (wasSharingRef.current && !isSharing && user) {
      publishedRef.current = null;
      clearPublishedState(user.uid);
    } else if (isSharing && user && !publishedRef.current) {
      publishedRef.current = readPublishedState(user.uid);
    }
    wasSharingRef.current = isSharing;
  }, [isSharing, user]);

  // Out: publish My List whenever it (or the share settings) change.
  useEffect(() => {
    if (!isSharing || !itemsLoaded || !user || !db) return undefined;
    const firestore = db;

    const timeout = window.setTimeout(() => {
      const ownerItems = personalItems.map(toSharedItemPayload);
      const lastPublished = publishedRef.current;

      publishOwnerSnapshot(
        firestore,
        {
          ownerId: user.uid,
          ownerName,
          permissions,
          allowAnonymousEdits,
          items: ownerItems,
          shareCode: shareCode || undefined,
        },
        (remoteItems) => {
          const items =
            remoteItems && lastPublished
              ? mergeOwnerPublish(ownerItems, lastPublished, remoteItems)
              : ownerItems;
          // Record before commit: the listener echo must match what we wrote.
          publishedRef.current = buildPublishedState(items);
          writePublishedState(user.uid, publishedRef.current);
          return items;
        },
      ).catch(logError("Auto share sync error"));
    }, PUBLISH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [
    allowAnonymousEdits,
    isSharing,
    itemsLoaded,
    ownerName,
    permissions,
    personalItems,
    shareCode,
    user,
  ]);

  // In: apply collaborator changes to the owner's own items.
  useEffect(() => {
    if (!isSharing || !allowEdits || !user || !db) return undefined;
    const firestore = db;

    return subscribeToSharedList(
      firestore,
      user.uid,
      (shared) => {
        if (!shared) return;
        const remoteState = buildPublishedState(shared.items);
        const published = publishedRef.current;

        // Nothing to compare against yet (first ever share, or storage was
        // cleared). Adopt the server copy as the baseline instead of guessing
        // who changed what.
        if (!published) {
          publishedRef.current = remoteState;
          writePublishedState(user.uid, remoteState);
          return;
        }

        const diff = diffSharedState(published, remoteState);
        if (!hasSharedChanges(diff)) return;

        // Accept the collaborator's version as the new baseline up front, so a
        // second snapshot for the same change cannot apply it twice.
        publishedRef.current = remoteState;
        writePublishedState(user.uid, remoteState);

        void notifyShareListChange({
          enabled: notifyChanges,
          ownerId: user.uid,
          ownerName: "Someone",
          changeCount:
            diff.toggled.length + diff.added.length + diff.removed.length,
        });

        const sharedByKey = indexSharedItems(shared.items);
        // Index by stable id and by content so legacy shared docs (no id)
        // still match personal rows after we started publishing ids.
        const personalByKey = new Map<string, ShoppingItem>();
        personalItemsRef.current.forEach((item) => {
          personalByKey.set(getSharedItemKey(item), item);
          personalByKey.set(getSharedItemContentKey(item), item);
        });

        if (permissions.toggle) {
          diff.toggled.forEach(({ key, completed }) => {
            const item = personalByKey.get(key);
            if (!item || item.completed === completed) return;
            updateShoppingItem(firestore, item.id, { completed }).catch(
              logError("Collaborator toggle sync-back error"),
            );
          });
        }

        if (permissions.add) {
          diff.added.forEach((key) => {
            const sharedItem = sharedByKey.get(key);
            if (!sharedItem || personalByKey.has(key)) return;
            addShoppingItem(firestore, user.uid, {
              ...sharedItem,
              listId: PERSONAL_LIST_ID,
              listName: PERSONAL_LIST_NAME,
            }).catch(logError("Collaborator add sync-back error"));
          });
        }

        if (permissions.remove) {
          diff.removed.forEach((key) => {
            const item = personalByKey.get(key);
            if (!item) return;
            deleteShoppingItem(firestore, item.id).catch(
              logError("Collaborator remove sync-back error"),
            );
          });
        }
      },
      logError("Collaborator listener error"),
    );
  }, [allowEdits, notifyChanges, permissions, isSharing, user]);
}
