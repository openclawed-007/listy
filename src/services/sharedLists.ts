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
  items: SharedItemData[];
  shareCode?: string;
}

export async function loadSharedList(firestore: Firestore, ownerId: string) {
  const snapshot = await getDoc(doc(firestore, "sharedLists", ownerId));
  if (!snapshot.exists()) return null;
  return normalizeSharedListSnapshot(snapshot.data());
}

export function publishSharedList(
  firestore: Firestore,
  value: SharedListWrite,
) {
  return setDoc(doc(firestore, "sharedLists", value.ownerId), {
    ...value,
    allowEdits: Object.values(value.permissions).some(Boolean),
    updatedAt: serverTimestamp(),
  });
}

export function updateSharedListPermissions(
  firestore: Firestore,
  ownerId: string,
  permissions: SharePermissions,
) {
  return updateDoc(doc(firestore, "sharedLists", ownerId), {
    permissions,
    allowEdits: Object.values(permissions).some(Boolean),
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
