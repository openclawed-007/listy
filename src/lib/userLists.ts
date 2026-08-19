// Owned multi-list registry (My List + custom lists like Costco).
//
// Shared imports stay derived from items (`shared:{ownerId}`). This module only
// tracks lists the user created. Local storage first; cloud via userSettings.

export const MAX_CUSTOM_LISTS = 8;
/** Persist cap — high enough to keep recovered lists, not a create quota. */
export const MAX_STORED_LISTS = 16;
export const MAX_LIST_NAME_LENGTH = 40;
export const LIST_ID_PREFIX = "list_";
export const SHARED_LIST_PREFIX = "shared:";
export const PERSONAL_TAB_ID = "personal";
export const PERSONAL_TAB_NAME = "My List";

export interface ListTab {
  id: string;
  name: string;
}

export interface UserList {
  id: string;
  name: string;
  createdAt: number;
}

const LEGACY_LOCAL_KEY = "cartlink:user-lists:v1";

function listsStorageKey(userId?: string | null) {
  return userId
    ? `${LEGACY_LOCAL_KEY}:${userId}`
    : `${LEGACY_LOCAL_KEY}:guest`;
}

export function createListId() {
  const rand =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${LIST_ID_PREFIX}${rand}`;
}

export function isOwnedCustomListId(id: string) {
  return id.startsWith(LIST_ID_PREFIX);
}

export function isSharedImportListId(id: string) {
  return id.startsWith(SHARED_LIST_PREFIX);
}

export function sharedOwnerIdFromListId(id: string) {
  return isSharedImportListId(id)
    ? id.slice(SHARED_LIST_PREFIX.length)
    : undefined;
}

/** Owned lists the user can write freely (not a shared import). */
export function isOwnedListId(id: string) {
  return id === PERSONAL_TAB_ID || isOwnedCustomListId(id);
}

export function normalizeListName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim().slice(0, MAX_LIST_NAME_LENGTH);
  return name || undefined;
}

export function normalizeUserList(value: unknown): UserList | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!isOwnedCustomListId(id)) return null;
  const name = normalizeListName(record.name);
  if (!name) return null;
  const createdAt =
    typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
      ? record.createdAt
      : 0;
  return { id, name, createdAt };
}

export function normalizeUserLists(value: unknown): UserList[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const lists: UserList[] = [];
  for (const entry of value) {
    const list = normalizeUserList(entry);
    if (!list || seen.has(list.id)) continue;
    seen.add(list.id);
    lists.push(list);
    if (lists.length >= MAX_STORED_LISTS) break;
  }
  return lists;
}

/** Record an existing list id (orphaned items) without applying the create cap. */
export function ensureListInRegistry(
  lists: UserList[],
  id: string,
  name: string,
): UserList[] {
  if (!isOwnedCustomListId(id) || lists.some((list) => list.id === id)) {
    return lists;
  }
  if (lists.length >= MAX_STORED_LISTS) return lists;
  const normalized = normalizeListName(name) ?? "List";
  return [...lists, { id, name: normalized, createdAt: Date.now() }];
}

export interface RemoteListsSnapshot {
  exists: boolean;
  data?: Record<string, unknown>;
}

/**
 * Cloud wins when the `lists` field exists (including []). Missing field
 * means this account has never stored lists — keep local and upload it.
 */
export function resolveRemoteLists(
  snapshot: RemoteListsSnapshot,
  userId?: string | null,
): {
  lists: UserList[];
  uploadLocal: boolean;
} {
  if (!snapshot.exists || !snapshot.data) {
    const local = readLocalUserLists(userId);
    return { lists: local, uploadLocal: local.length > 0 };
  }
  if (!Object.prototype.hasOwnProperty.call(snapshot.data, "lists")) {
    const local = readLocalUserLists(userId);
    return { lists: local, uploadLocal: local.length > 0 };
  }
  return {
    lists: normalizeUserLists(snapshot.data.lists),
    uploadLocal: false,
  };
}

/** Tabs: My List + registry (names / empty lists) + item membership leftovers + shared. */
export function buildListTabs(
  lists: UserList[],
  items: Array<{ listId?: string; listName?: string }>,
): ListTab[] {
  const known = new Set(lists.map((list) => list.id));
  const leftover = new Map<string, string>();
  const shared = new Map<string, string>();

  for (const item of items) {
    const listId = item.listId ?? PERSONAL_TAB_ID;
    if (isSharedImportListId(listId)) {
      const label = item.listName?.trim() || "Shared list";
      if (!shared.has(listId)) shared.set(listId, label);
    } else if (isOwnedCustomListId(listId) && !known.has(listId)) {
      if (!leftover.has(listId)) {
        leftover.set(listId, normalizeListName(item.listName) ?? "List");
      }
    }
  }

  return [
    { id: PERSONAL_TAB_ID, name: PERSONAL_TAB_NAME },
    ...lists.map((list) => ({ id: list.id, name: list.name })),
    ...Array.from(leftover, ([id, name]) => ({ id, name })),
    ...Array.from(shared, ([id, name]) => ({ id, name })),
  ];
}

export function readLocalUserLists(userId?: string | null): UserList[] {
  try {
    const scopedRaw = localStorage.getItem(listsStorageKey(userId));
    if (scopedRaw != null) {
      return normalizeUserLists(JSON.parse(scopedRaw) as unknown);
    }
    // Adopt the unscoped key only for a signed-in user, once. That stops a
    // shared phone from copying the previous person's custom lists into the
    // next account via the guest bucket.
    if (userId) {
      const legacyRaw = localStorage.getItem(LEGACY_LOCAL_KEY);
      if (legacyRaw) {
        const lists = normalizeUserLists(JSON.parse(legacyRaw) as unknown);
        writeLocalUserLists(lists, userId);
        localStorage.removeItem(LEGACY_LOCAL_KEY);
        return lists;
      }
    }
    return [];
  } catch {
    return [];
  }
}

export function writeLocalUserLists(
  lists: UserList[],
  userId?: string | null,
) {
  try {
    localStorage.setItem(
      listsStorageKey(userId),
      JSON.stringify(normalizeUserLists(lists)),
    );
  } catch {
    // Storage blocked — in-memory state still works for the session.
  }
}

export function canAddCustomList(lists: UserList[]) {
  return lists.length < MAX_CUSTOM_LISTS;
}

export function addCustomList(
  lists: UserList[],
  name: string,
  options: { id?: string; createdAt?: number } = {},
): { lists: UserList[]; list: UserList } | { error: string } {
  if (!canAddCustomList(lists)) {
    return { error: `You can have up to ${MAX_CUSTOM_LISTS} custom lists.` };
  }
  const normalized = normalizeListName(name);
  if (!normalized) return { error: "Give the list a name." };

  const list: UserList = {
    id: options.id ?? createListId(),
    name: normalized,
    createdAt: options.createdAt ?? Date.now(),
  };
  return { lists: [...lists, list], list };
}

export function renameCustomList(
  lists: UserList[],
  id: string,
  name: string,
): { lists: UserList[] } | { error: string } {
  const normalized = normalizeListName(name);
  if (!normalized) return { error: "Give the list a name." };
  if (!lists.some((list) => list.id === id)) {
    return { error: "That list was not found." };
  }
  return {
    lists: lists.map((list) =>
      list.id === id ? { ...list, name: normalized } : list,
    ),
  };
}

export function removeCustomList(lists: UserList[], id: string): UserList[] {
  return lists.filter((list) => list.id !== id);
}
