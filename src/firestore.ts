import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { app } from "./firebase";

/**
 * Firestore is by far the heaviest SDK in the app, so it lives apart from
 * auth: the landing page, sign-in and guest list never download it. Only
 * import this from lazily loaded screens (or via dynamic `import()`).
 */
export const db: Firestore | null = app
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })
  : null;
