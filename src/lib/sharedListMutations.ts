// Mutations against the public `sharedLists/{ownerId}.items` array.
//
// The shared list is one document, so two shoppers writing the whole array
// can overwrite each other. Apply one absolute change (set completed / add /
// remove / replace) inside a Firestore transaction so the write is retried
// against the latest server copy instead of last-write-wins.

import {
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import {
  hasAnyPermission,
  normalizeSharePermissions,
  type SharePermissions,
} from "./sharePermissions";
import {
  getSharedItemContentKey,
  isRecord,
  toSharedItemPayload,
  type SharedItemPayload,
} from "./shoppingItem";

export interface SharedItemTarget {
  id?: string;
  sharedSourceItemId?: string;
  index?: number;
  text: string;
  quantity?: string;
  category?: string;
}

export type SharedListMutation =
  | {
      type: "setCompleted";
      target: SharedItemTarget;
      completed: boolean;
    }
  | { type: "remove"; target: SharedItemTarget }
  | { type: "add"; item: SharedItemPayload }
  | { type: "replace"; target: SharedItemTarget; item: SharedItemPayload };

export type SharedListPermissionGate = keyof SharePermissions | "edit";

export function mutationPermissionGate(
  mutation: SharedListMutation,
): SharedListPermissionGate {
  if (mutation.type === "setCompleted") return "toggle";
  if (mutation.type === "add") return "add";
  if (mutation.type === "replace") return "edit";
  return "remove";
}

export function isMutationPermitted(
  permissions: SharePermissions,
  allowEdits: boolean,
  gate: SharedListPermissionGate,
) {
  if (!allowEdits || !hasAnyPermission(permissions)) return false;
  if (gate === "edit") return permissions.add && permissions.remove;
  return permissions[gate] === true;
}

/** Prefer stable ids so a quantity edit does not look like a different row. */
export function findRawItemIndex(
  rawItems: unknown[],
  target: SharedItemTarget,
) {
  const bySourceId = rawItems.findIndex((item) => {
    if (!isRecord(item) || typeof item.id !== "string") return false;
    if (target.sharedSourceItemId) return item.id === target.sharedSourceItemId;
    return false;
  });
  if (bySourceId !== -1) return bySourceId;

  const byId = rawItems.findIndex((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || !target.id) {
      return false;
    }
    return item.id === target.id;
  });
  if (byId !== -1) return byId;

  if (
    Number.isInteger(target.index) &&
    (target.index ?? -1) >= 0 &&
    (target.index ?? 0) < rawItems.length
  ) {
    return target.index as number;
  }

  const contentKey = getSharedItemContentKey({
    text: target.text,
    quantity: target.quantity,
    category: target.category,
  });

  return rawItems.findIndex((item) => {
    if (!isRecord(item) || typeof item.text !== "string") return false;
    return (
      getSharedItemContentKey({
        text: item.text,
        quantity: typeof item.quantity === "string" ? item.quantity : undefined,
        category: typeof item.category === "string" ? item.category : undefined,
      }) === contentKey
    );
  });
}

function toPayload(item: unknown): SharedItemPayload {
  const record = isRecord(item) ? item : {};
  return toSharedItemPayload({
    id: typeof record.id === "string" ? record.id : undefined,
    text: typeof record.text === "string" ? record.text : "",
    completed: record.completed === true,
    quantity: typeof record.quantity === "string" ? record.quantity : undefined,
    category: typeof record.category === "string" ? record.category : undefined,
    note: typeof record.note === "string" ? record.note : undefined,
    important: record.important === true,
  });
}

/**
 * Apply one change to whatever the current items array is. Absolute, not a
 * flip: two clients toggling different rows both land, and a retry does not
 * undo a completed write.
 */
export function applySharedListMutation(
  rawItems: unknown,
  mutation: SharedListMutation,
): SharedItemPayload[] {
  const existing = Array.isArray(rawItems) ? rawItems : [];

  if (mutation.type === "add") {
    const duplicate = findRawItemIndex(existing, {
      id: mutation.item.id,
      text: mutation.item.text,
      quantity: mutation.item.quantity,
      category: mutation.item.category,
    });
    if (duplicate !== -1) return existing.map(toPayload);
    return [...existing.map(toPayload), mutation.item];
  }

  const index = findRawItemIndex(existing, mutation.target);
  if (index === -1) return existing.map(toPayload);

  if (mutation.type === "remove") {
    return existing
      .filter((_item, itemIndex) => itemIndex !== index)
      .map(toPayload);
  }

  if (mutation.type === "replace") {
    return existing.map((item, itemIndex) =>
      itemIndex === index ? mutation.item : toPayload(item),
    );
  }

  return existing.map((item, itemIndex) =>
    itemIndex === index
      ? toPayload({
          ...(isRecord(item) ? item : {}),
          completed: mutation.completed,
        })
      : toPayload(item),
  );
}

export async function commitSharedListMutation(
  firestore: Firestore,
  ownerId: string,
  mutation: SharedListMutation,
): Promise<SharedItemPayload[] | null> {
  const gate = mutationPermissionGate(mutation);

  return runTransaction(firestore, async (transaction) => {
    const ref = doc(firestore, "sharedLists", ownerId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return null;

    const raw = snapshot.data();
    const permissions = normalizeSharePermissions(raw?.permissions);
    const allowEdits = raw?.allowEdits === true && hasAnyPermission(permissions);
    if (!isMutationPermitted(permissions, allowEdits, gate)) return null;

    const next = applySharedListMutation(raw?.items, mutation);
    transaction.update(ref, {
      items: next,
      updatedAt: serverTimestamp(),
    });
    return next;
  });
}
