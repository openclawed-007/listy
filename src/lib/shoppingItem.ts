// Shapes, validation and small helpers for shopping items.
//
// Kept out of the components so both the list screen and its child rows share
// one definition of what a valid item looks like, and so anything read back
// from Firestore is sanitised in exactly one place.

import {
  writeBatch,
  type Firestore,
  type Timestamp,
  type WriteBatch,
} from "firebase/firestore";
import {
  DEFAULT_CATEGORY,
  MAX_CATEGORY_LENGTH,
  MAX_ITEM_TEXT_LENGTH,
  MAX_QUANTITY_LENGTH,
} from "./itemInput";

export const PERSONAL_LIST_ID = "personal";
export const PERSONAL_LIST_NAME = "My List";
export const MAX_FIRESTORE_BATCH_WRITES = 450;

export interface ShoppingItem {
  id: string;
  text: string;
  completed: boolean;
  userId: string;
  quantity?: string;
  category?: string;
  listId?: string;
  listName?: string;
  sharedFromUserId?: string;
  createdAt?: Timestamp;
}

export interface SharedItemPayload {
  text: string;
  completed: boolean;
  quantity?: string;
  category?: string;
}

export interface SharedListSnapshot {
  ownerId: string;
  ownerName: string;
  items: SharedItemPayload[];
}

export function getItemListId(item: ShoppingItem) {
  return item.listId ?? PERSONAL_LIST_ID;
}

export function getItemListName(item: ShoppingItem) {
  return item.listName ?? PERSONAL_LIST_NAME;
}

export function getItemCategory(item: ShoppingItem) {
  return item.category ?? DEFAULT_CATEGORY;
}

/** Stable identity for matching a personal item to its shared-doc counterpart. */
export function getSharedItemKey(item: {
  text: string;
  quantity?: string;
  category?: string;
}) {
  return [item.text, item.quantity ?? "", item.category ?? ""].join("\u0000");
}

/** Strip an item down to the fields published on a public shared list. */
export function toSharedItemPayload(item: {
  text: string;
  completed: boolean;
  quantity?: string;
  category?: string;
}): SharedItemPayload {
  return {
    text: item.text,
    completed: item.completed,
    ...(item.quantity ? { quantity: item.quantity } : {}),
    ...(item.category ? { category: item.category } : {}),
  };
}

export function getSafeOwnerName(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 120)
    : "Shared user";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function normalizeOptionalString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : undefined;
}

export function normalizeShoppingItem(
  id: string,
  data: unknown,
): ShoppingItem | null {
  if (!isRecord(data)) return null;

  const text = normalizeOptionalString(data.text, MAX_ITEM_TEXT_LENGTH);
  const userId = normalizeOptionalString(data.userId, 128);
  if (!text || !userId || typeof data.completed !== "boolean") return null;

  return {
    id,
    text,
    completed: data.completed,
    userId,
    quantity: normalizeOptionalString(data.quantity, MAX_QUANTITY_LENGTH),
    category: normalizeOptionalString(data.category, MAX_CATEGORY_LENGTH),
    listId: normalizeOptionalString(data.listId, 200),
    listName: normalizeOptionalString(data.listName, 120),
    sharedFromUserId: normalizeOptionalString(data.sharedFromUserId, 128),
    createdAt:
      data.createdAt &&
      typeof data.createdAt === "object" &&
      "toMillis" in data.createdAt
        ? (data.createdAt as Timestamp)
        : undefined,
  };
}

export function normalizeSharedItems(items: unknown): SharedItemPayload[] {
  if (!Array.isArray(items)) return [];

  return items.flatMap((item) => {
    if (!isRecord(item)) return [];

    const text = normalizeOptionalString(item.text, MAX_ITEM_TEXT_LENGTH);
    if (!text) return [];

    return [
      {
        text,
        completed: item.completed === true,
        quantity: normalizeOptionalString(item.quantity, MAX_QUANTITY_LENGTH),
        category: normalizeOptionalString(item.category, MAX_CATEGORY_LENGTH),
      },
    ];
  });
}

export function normalizeSharedListSnapshot(
  data: unknown,
): SharedListSnapshot | null {
  if (!isRecord(data)) return null;

  const ownerId = normalizeOptionalString(data.ownerId, 128);
  if (!ownerId) return null;

  return {
    ownerId,
    ownerName: getSafeOwnerName(data.ownerName),
    items: normalizeSharedItems(data.items),
  };
}

/** Group items by category, keeping the catch-all group last. */
export function groupItemsByCategory(items: ShoppingItem[]) {
  const groups = new Map<string, ShoppingItem[]>();

  items.forEach((item) => {
    const category = getItemCategory(item);
    const existing = groups.get(category);
    if (existing) existing.push(item);
    else groups.set(category, [item]);
  });

  return Array.from(groups, ([category, categoryItems]) => ({
    category,
    items: categoryItems,
  })).sort((a, b) => {
    if (a.category === DEFAULT_CATEGORY) return 1;
    if (b.category === DEFAULT_CATEGORY) return -1;
    return a.category.localeCompare(b.category);
  });
}

/** Run write operations in chunks that stay inside Firestore's batch limit. */
export async function commitBatchOperations(
  firestore: Firestore,
  operations: Array<(batch: WriteBatch) => void>,
) {
  for (
    let index = 0;
    index < operations.length;
    index += MAX_FIRESTORE_BATCH_WRITES
  ) {
    const batch = writeBatch(firestore);
    operations
      .slice(index, index + MAX_FIRESTORE_BATCH_WRITES)
      .forEach((operation) => operation(batch));
    await batch.commit();
  }
}
