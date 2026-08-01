// Reconciling the owner's items with the public shared copy of them.
//
// The owner publishes their list to `sharedLists/{uid}` and simultaneously
// listens to it, because collaborators write to the same document. Comparing
// the incoming document against the owner's *current* items is wrong: the
// owner's own edits land locally before the debounced publish reaches the
// server, so a freshly edited or deleted item looks exactly like a
// collaborator addition or removal — and gets resurrected or destroyed.
//
// Instead we remember the state we last published and diff against that.
// Anything that differs from what *we* wrote must have come from someone
// else, which is the only thing worth syncing back.
//
// Pure functions plus a small localStorage cache, so this is testable without
// Firebase and survives a reload (collaborator changes made while the owner's
// app was closed are still picked up on the next open).

import { getSharedItemKey, type SharedItemPayload } from "./shoppingItem";

/** Map of shared-item key -> completed flag, as last seen on the server. */
export type PublishedState = Record<string, boolean>;

export interface SharedDiff {
  /** Same item, someone else changed whether it is ticked off. */
  toggled: Array<{ key: string; completed: boolean }>;
  /** Keys that appeared remotely since we published. */
  added: string[];
  /** Keys that disappeared remotely since we published. */
  removed: string[];
}

const STORAGE_PREFIX = "cartlink:published:";

export function buildPublishedState(
  items: Array<{
    text: string;
    completed: boolean;
    quantity?: string;
    category?: string;
  }>,
): PublishedState {
  const state: PublishedState = {};
  items.forEach((item) => {
    state[getSharedItemKey(item)] = item.completed;
  });
  return state;
}

/** What changed on the server relative to the snapshot we last published. */
export function diffSharedState(
  published: PublishedState,
  remote: PublishedState,
): SharedDiff {
  const toggled: SharedDiff["toggled"] = [];
  const added: string[] = [];
  const removed: string[] = [];

  Object.entries(remote).forEach(([key, completed]) => {
    if (!(key in published)) added.push(key);
    else if (published[key] !== completed) toggled.push({ key, completed });
  });

  Object.keys(published).forEach((key) => {
    if (!(key in remote)) removed.push(key);
  });

  return { toggled, added, removed };
}

export function hasSharedChanges(diff: SharedDiff) {
  return (
    diff.toggled.length > 0 || diff.added.length > 0 || diff.removed.length > 0
  );
}

/** Index shared items by their stable key so a diff can be turned into writes. */
export function indexSharedItems(items: SharedItemPayload[]) {
  const byKey = new Map<string, SharedItemPayload>();
  items.forEach((item) => byKey.set(getSharedItemKey(item), item));
  return byKey;
}

export function readPublishedState(ownerId: string): PublishedState | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${ownerId}`);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const state: PublishedState = {};
    Object.entries(parsed as Record<string, unknown>).forEach(
      ([key, value]) => {
        if (typeof value === "boolean") state[key] = value;
      },
    );
    return state;
  } catch {
    return null;
  }
}

export function writePublishedState(ownerId: string, state: PublishedState) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${ownerId}`, JSON.stringify(state));
  } catch {
    // Private browsing modes can block localStorage; syncing still works for
    // as long as the tab stays open, it just won't survive a reload.
  }
}

export function clearPublishedState(ownerId: string) {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${ownerId}`);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
