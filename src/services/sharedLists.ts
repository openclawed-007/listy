import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { normalizeSharedListSnapshot } from "../lib/shoppingItem";
import type { SharePermissions } from "../lib/sharePermissions";
import type { SharedItemData } from "../lib/publicSharedListModel";

export interface SharedListWrite {
  ownerId: string;
  ownerName: string;
  permissions: SharePermissions;
  /** Let not-signed-in visitors toggle/add (never remove). */
  allowAnonymousEdits?: boolean;
  items: SharedItemData[];
  shareCode?: string;
}

export async function loadRawSharedList(
  firestore: Firestore,
  ownerId: string,
): Promise<Record<string, unknown> | null> {
  const snapshot = await getDoc(doc(firestore, "sharedLists", ownerId));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function loadSharedList(firestore: Firestore, ownerId: string) {
  const raw = await loadRawSharedList(firestore, ownerId);
  return raw ? normalizeSharedListSnapshot(raw) : null;
}

export function publishSharedList(
  firestore: Firestore,
  value: SharedListWrite,
) {
  const allowEdits = Object.values(value.permissions).some(Boolean);
  return setDoc(doc(firestore, "sharedLists", value.ownerId), {
    ...value,
    allowEdits,
    // Anonymous editing is meaningless without a granted permission.
    allowAnonymousEdits: allowEdits && value.allowAnonymousEdits === true,
    updatedAt: serverTimestamp(),
  });
}

export function updateSharedListPermissions(
  firestore: Firestore,
  ownerId: string,
  permissions: SharePermissions,
  allowAnonymousEdits = false,
) {
  const allowEdits = Object.values(permissions).some(Boolean);
  return updateDoc(doc(firestore, "sharedLists", ownerId), {
    permissions,
    allowEdits,
    allowAnonymousEdits: allowEdits && allowAnonymousEdits,
    updatedAt: serverTimestamp(),
  });
}

export function updateSharedListAnonymousEdits(
  firestore: Firestore,
  ownerId: string,
  allowAnonymousEdits: boolean,
) {
  return updateDoc(doc(firestore, "sharedLists", ownerId), {
    allowAnonymousEdits,
    updatedAt: serverTimestamp(),
  });
}

export async function revokeSharedList(
  firestore: Firestore,
  ownerId: string,
  shareCode?: string,
) {
  await deleteDoc(doc(firestore, "sharedLists", ownerId));
  if (shareCode) await deleteDoc(doc(firestore, "shareCodes", shareCode));
}

export function subscribeToRawSharedList(
  firestore: Firestore,
  ownerId: string,
  onValue: (exists: boolean, raw: Record<string, unknown> | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(firestore, "sharedLists", ownerId),
    (snapshot) =>
      onValue(snapshot.exists(), snapshot.exists() ? snapshot.data() : null),
    onError,
  );
}

export function subscribeToSharedList(
  firestore: Firestore,
  ownerId: string,
  onValue: (value: ReturnType<typeof normalizeSharedListSnapshot> | null, raw: unknown) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(firestore, "sharedLists", ownerId),
    (snapshot) => {
      const raw = snapshot.exists() ? snapshot.data() : null;
      onValue(raw ? normalizeSharedListSnapshot(raw) : null, raw);
    },
    onError,
  );
}
