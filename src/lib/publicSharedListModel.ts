import { hasAnyPermission, normalizeSharePermissions, type SharePermissions } from "./sharePermissions";
import { isRecord, normalizeSharedItems as normalizeSharedPayloads } from "./shoppingItem";

export const MAX_PUBLIC_ITEMS = 500;

let collaboratorIdSeq = 0;

export function createCollaboratorItemId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  collaboratorIdSeq += 1;
  return `c-${collaboratorIdSeq}`;
}

export interface SharedItemData {
  id?: string;
  text: string;
  completed: boolean;
  quantity?: string;
  category?: string;
  note?: string;
  important?: boolean;
}

export interface PublicSharedListSnapshot {
  ownerId: string;
  ownerName: string;
  allowEdits: boolean;
  /** Owner opted in to letting not-signed-in visitors toggle/add. */
  allowAnonymousEdits: boolean;
  permissions: SharePermissions;
  items: SharedItemData[];
}

export interface PublicItem {
  id: string;
  index: number;
  text: string;
  completed: boolean;
  quantity?: string;
  category?: string;
  note?: string;
  important?: boolean;
}

function getSafeOwnerName(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 120)
    : "Shared list";
}

function normalizeSharedItems(items: unknown): PublicItem[] {
  return normalizeSharedPayloads(items).map((item, index) => ({
    id: item.id ?? `${index}-${item.text}`,
    index,
    text: item.text,
    completed: item.completed,
    quantity: item.quantity,
    category: item.category,
    note: item.note,
    important: item.important,
  }));
}

export function normalizePublicSharedList(
  data: unknown,
): PublicSharedListSnapshot | null {
  if (!isRecord(data) || typeof data.ownerId !== "string") return null;

  const permissions = normalizeSharePermissions(data.permissions);
  return {
    ownerId: data.ownerId,
    ownerName: getSafeOwnerName(data.ownerName),
    allowEdits: data.allowEdits === true && hasAnyPermission(permissions),
    allowAnonymousEdits: data.allowAnonymousEdits === true,
    permissions,
    items: normalizeSharedItems(data.items),
  };
}

export function payloadToPublicItems(payload: SharedItemData[]): PublicItem[] {
  return payload.map((item, index) => ({
    id: item.id ?? `${index}-${item.text}`,
    index,
    text: item.text,
    completed: item.completed,
    quantity: item.quantity,
    category: item.category,
    note: item.note,
    important: item.important,
  }));
}
