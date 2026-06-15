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

/**
 * The effective permissions for a visitor who is NOT signed in (anonymous).
 *
 * Anonymous visitors are only ever allowed to toggle and add, and only when the
 * owner has opted in via `allowAnonymousEdits`. They can never remove items, no
 * matter what the owner's collaborator permissions say, because removal is the
 * one destructive, irreversible action and a random link/QR holder should not
 * be able to wipe the owner's list. This mirrors the server-side rules.
 */
export function anonymousPermissions(
  perms: SharePermissions,
  allowAnonymousEdits: boolean,
): SharePermissions {
  if (!allowAnonymousEdits) return { ...NO_PERMISSIONS };

  return {
    toggle: perms.toggle,
    add: perms.add,
    remove: false,
  };
}
