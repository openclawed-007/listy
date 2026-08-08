// Owned multi-list registry (My List + custom lists like Costco).
//
// Shared imports stay derived from items (`shared:{ownerId}`). This module only
// tracks lists the user created. Local storage first; cloud via userSettings.

export const MAX_CUSTOM_LISTS = 8;
export const MAX_LIST_NAME_LENGTH = 40;
export const LIST_ID_PREFIX = "list_";

export interface UserList {
  id: string;
  name: string;
  createdAt: number;
}

const LOCAL_KEY = "cartlink:user-lists:v1";

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
  return id.startsWith("shared:");
}

/** Owned lists the user can write freely (not a shared import). */
export function isOwnedListId(id: string) {
  return id === "personal" || isOwnedCustomListId(id);
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
    if (lists.length >= MAX_CUSTOM_LISTS) break;
  }
  return lists;
}

export function readLocalUserLists(): UserList[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
    return normalizeUserLists(parsed);
  } catch {
    return [];
  }
}

export function writeLocalUserLists(lists: UserList[]) {
  try {
    localStorage.setItem(
      LOCAL_KEY,
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
