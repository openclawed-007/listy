import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { generateShareCode, isValidShareCode } from "./shareCode";

const MAX_ATTEMPTS = 8;

/**
 * Reserve a unique shareCodes/{code} → ownerId mapping.
 * Retries on collision (vanishingly rare at 8 chars of 32-symbol alphabet).
 */
export async function allocateShareCode(
  firestore: Firestore,
  ownerId: string,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = generateShareCode();
    const ref = doc(firestore, "shareCodes", code);

    try {
      // Create-only: security rules reject update, so a taken code fails.
      await setDoc(ref, {
        ownerId,
        createdAt: serverTimestamp(),
      });
      return code;
    } catch (error) {
      // Another owner claimed it, or a network blip — try a new code.
      const existing = await getDoc(ref);
      if (existing.exists()) continue;
      throw error;
    }
  }

  throw new Error("Unable to allocate a share code right now.");
}

/** Read ownerId for a raw code, or null if missing/invalid. */
export async function resolveShareCode(
  firestore: Firestore,
  rawCode: string,
): Promise<string | null> {
  if (!isValidShareCode(rawCode)) return null;

  const snapshot = await getDoc(doc(firestore, "shareCodes", rawCode));
  if (!snapshot.exists()) return null;

  const ownerId = snapshot.data()?.ownerId;
  return typeof ownerId === "string" && ownerId.trim() ? ownerId : null;
}
