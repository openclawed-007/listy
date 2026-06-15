// Shared definition of collaborator permissions for a shared shopping list.
// Used by both the owner app (ShoppingList) and the public share page
// (PublicSharedList) so the permission shape stays consistent.

export interface SharePermissions {
  /** Collaborators may check items off (toggle the completed flag). */
  toggle: boolean;
  /** Collaborators may add new items to the list. */
  add: boolean;
  /** Collaborators may remove items from the list. */
  remove: boolean;
}

export const NO_PERMISSIONS: SharePermissions = {
  toggle: false,
  add: false,
  remove: false,
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

/** Read a permissions map from raw Firestore data, defaulting unknown to false. */
export function normalizeSharePermissions(value: unknown): SharePermissions {
  if (!isRecord(value)) return { ...NO_PERMISSIONS };

  return {
    toggle: value.toggle === true,
    add: value.add === true,
    remove: value.remove === true,
  };
}

/** True when at least one collaborator permission is enabled. */
export function hasAnyPermission(perms: SharePermissions): boolean {
  return perms.toggle || perms.add || perms.remove;
}
