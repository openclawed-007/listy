/**
 * Firestore boundary for complex list orchestration.
 * React components import database operations from this module only; focused
 * services can progressively replace individual primitives without coupling
 * rendering code to the Firebase package.
 */
export {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type WriteBatch,
} from "firebase/firestore";
