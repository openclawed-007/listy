import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";
import { compareManualOrder } from "../lib/listOrder";
import {
  getItemListId,
  getItemListName,
  normalizeShoppingItem,
  type ShoppingItem,
} from "../lib/shoppingItem";

const ITEMS = "shoppingItems";
const MAX_BATCH_WRITES = 450;

export type ShoppingItemsSubscriber = (items: ShoppingItem[]) => void;

/** Subscribe to one user's normalized shopping items in stable manual order. */
export function subscribeToShoppingItems(
  firestore: Firestore,
  userId: string,
  onItems: ShoppingItemsSubscriber,
  onError: (error: Error) => void,
) {
  const itemsQuery = query(
    collection(firestore, ITEMS),
    where("userId", "==", userId),
  );

  return onSnapshot(
    itemsQuery,
    (snapshot) => {
      const items = snapshot.docs.flatMap((snapshotDoc) => {
        const item = normalizeShoppingItem(snapshotDoc.id, snapshotDoc.data());
        return item ? [item] : [];
      });
      items.sort(compareManualOrder);
      onItems(items);
    },
    onError,
  );
}

export interface NewItemFields {
  text: string;
  completed?: boolean;
  quantity?: string;
  category?: string;
  note?: string;
  important?: boolean;
  sortOrder?: number;
  listId: string;
  listName: string;
  sharedFromUserId?: string;
  sharedSourceItemId?: string;
}

/**
 * Firestore payload for a new item. Empty optionals are left out rather than
 * written as blanks (the security rules validate every field that is present),
 * the owner is always the signed-in uid, and createdAt always comes from the
 * server — replaying a cached Timestamp has failed restores in the wild.
 */
export function newItemPayload(userId: string, fields: NewItemFields) {
  return {
    text: fields.text,
    completed: fields.completed ?? false,
    userId,
    ...(fields.quantity ? { quantity: fields.quantity } : {}),
    ...(fields.category ? { category: fields.category } : {}),
    ...(fields.note ? { note: fields.note } : {}),
    ...(fields.important ? { important: true } : {}),
    ...(typeof fields.sortOrder === "number" && Number.isFinite(fields.sortOrder)
      ? { sortOrder: fields.sortOrder }
      : {}),
    listId: fields.listId,
    listName: fields.listName,
    ...(fields.sharedFromUserId
      ? { sharedFromUserId: fields.sharedFromUserId }
      : {}),
    ...(fields.sharedSourceItemId
      ? { sharedSourceItemId: fields.sharedSourceItemId }
      : {}),
    createdAt: serverTimestamp(),
  };
}

/** Fields an existing item may change. `undefined` clears the field. */
export type ItemUpdate = Partial<{
  text: string;
  completed: boolean;
  quantity: string | undefined;
  category: string | undefined;
  note: string | undefined;
  important: true | undefined;
  sortOrder: number;
  listName: string;
}>;

function toFirestoreUpdate(update: ItemUpdate) {
  return Object.fromEntries(
    Object.entries(update).map(([key, value]) => [
      key,
      value === undefined ? deleteField() : value,
    ]),
  );
}

export function addShoppingItem(
  firestore: Firestore,
  userId: string,
  fields: NewItemFields,
) {
  return addDoc(collection(firestore, ITEMS), newItemPayload(userId, fields));
}

export function updateShoppingItem(
  firestore: Firestore,
  itemId: string,
  update: ItemUpdate,
) {
  return updateDoc(doc(firestore, ITEMS, itemId), toFirestoreUpdate(update));
}

export function deleteShoppingItem(firestore: Firestore, itemId: string) {
  return deleteDoc(doc(firestore, ITEMS, itemId));
}

/** Run write operations in chunks that stay inside Firestore's batch limit. */
export async function commitBatchOperations(
  firestore: Firestore,
  operations: Array<(batch: WriteBatch) => void>,
) {
  for (let index = 0; index < operations.length; index += MAX_BATCH_WRITES) {
    const batch = writeBatch(firestore);
    operations
      .slice(index, index + MAX_BATCH_WRITES)
      .forEach((operation) => operation(batch));
    await batch.commit();
  }
}

export function deleteShoppingItems(firestore: Firestore, itemIds: string[]) {
  return commitBatchOperations(
    firestore,
    itemIds.map((id) => (batch) => batch.delete(doc(firestore, ITEMS, id))),
  );
}

export function updateShoppingItems(
  firestore: Firestore,
  updates: Array<{ id: string; update: ItemUpdate }>,
) {
  return commitBatchOperations(
    firestore,
    updates.map(({ id, update }) => (batch) =>
      batch.update(doc(firestore, ITEMS, id), toFirestoreUpdate(update)),
    ),
  );
}

/**
 * Put a just-deleted item back. Reuses the original id where possible so
 * anything still pointing at it (shared copies, open edits) lines up again.
 *
 * Resolves as soon as the restore is applied locally; `written` settles when
 * the server has it (never while offline — don't make the UI wait on it).
 */
export async function restoreShoppingItem(
  firestore: Firestore,
  userId: string,
  item: ShoppingItem,
): Promise<{ status: "already-present" } | { status: "restored"; written: Promise<unknown> }> {
  const payload = newItemPayload(userId, {
    ...item,
    listId: getItemListId(item),
    listName: getItemListName(item),
    // Imported copies keep pointing at the owner's row, so edits still sync.
    sharedSourceItemId: item.sharedSourceItemId,
  });
  const itemRef = doc(firestore, ITEMS, item.id);

  // Best-effort only — a failed lookup must never block the restore.
  try {
    if ((await getDoc(itemRef)).exists()) return { status: "already-present" };
  } catch (error) {
    console.warn("Undo existence check failed; continuing restore:", error);
  }

  const written = setDoc(itemRef, payload).catch((error) => {
    // The original id could not be recreated (rules/offline race): a fresh
    // document still gets the customer their item back.
    console.warn("Undo setDoc failed; falling back to addDoc:", error);
    return addDoc(collection(firestore, ITEMS), payload);
  });
  return { status: "restored", written };
}

/**
 * Replace this user's copy of someone else's shared list with a fresh one.
 * Imports are one-shot snapshots: the tab is rebuilt, never merged.
 */
export async function replaceImportedList(
  firestore: Firestore,
  userId: string,
  source: {
    ownerId: string;
    ownerName: string;
    items: Array<{
      id?: string;
      text: string;
      completed: boolean;
      quantity?: string;
      category?: string;
      note?: string;
    }>;
  },
) {
  const listId = `shared:${source.ownerId}`;
  const existing = await getDocs(
    query(collection(firestore, ITEMS), where("userId", "==", userId)),
  );

  const operations: Array<(batch: WriteBatch) => void> = [];
  existing.forEach((itemDoc) => {
    const item = normalizeShoppingItem(itemDoc.id, itemDoc.data());
    if (item && getItemListId(item) === listId) {
      operations.push((batch) => batch.delete(doc(firestore, ITEMS, itemDoc.id)));
    }
  });

  source.items.forEach((item) => {
    const itemRef = doc(collection(firestore, ITEMS));
    operations.push((batch) =>
      batch.set(
        itemRef,
        newItemPayload(userId, {
          text: item.text,
          completed: item.completed,
          quantity: item.quantity,
          category: item.category,
          note: item.note,
          listId,
          listName: source.ownerName,
          sharedFromUserId: source.ownerId,
          sharedSourceItemId: item.id,
        }),
      ),
    );
  });

  await commitBatchOperations(firestore, operations);
  return listId;
}
