import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";

export type ShoppingItemWrite = Record<string, unknown>;

export async function createShoppingItem(
  firestore: Firestore,
  payload: ShoppingItemWrite,
) {
  return addDoc(collection(firestore, "shoppingItems"), {
    ...payload,
    createdAt: payload.createdAt ?? serverTimestamp(),
  });
}

export function updateShoppingItem(
  firestore: Firestore,
  itemId: string,
  updates: ShoppingItemWrite,
) {
  return updateDoc(doc(firestore, "shoppingItems", itemId), updates);
}

export function deleteShoppingItem(firestore: Firestore, itemId: string) {
  return deleteDoc(doc(firestore, "shoppingItems", itemId));
}

export function restoreShoppingItem(
  firestore: Firestore,
  itemId: string,
  payload: ShoppingItemWrite,
) {
  return setDoc(doc(firestore, "shoppingItems", itemId), {
    ...payload,
    createdAt: serverTimestamp(),
  });
}
