import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";

export function saveUserSettings(
  firestore: Firestore,
  userId: string,
  updates: Record<string, unknown>,
) {
  return setDoc(
    doc(firestore, "userSettings", userId),
    { ...updates, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function loadUserSettings(
  firestore: Firestore,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const snapshot = await getDoc(doc(firestore, "userSettings", userId));
  return snapshot.exists() ? snapshot.data() : null;
}

export function subscribeToUserSettings(
  firestore: Firestore,
  userId: string,
  onValue: (value: Record<string, unknown> | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(firestore, "userSettings", userId),
    (snapshot) => onValue(snapshot.exists() ? snapshot.data() : null),
    onError,
  );
}
