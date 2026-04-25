import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
};

const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? "";
const appCheckDebugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN ?? "";

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;

if (app && recaptchaSiteKey && typeof window !== "undefined") {
  if (appCheckDebugToken && !import.meta.env.PROD) {
    (window as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean })
      .FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
  }

  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.error("App Check initialization failed:", error);
  }
}

export const auth: Auth | null = app ? getAuth(app) : null;
export const googleProvider = isFirebaseConfigured ? new GoogleAuthProvider() : null;
export const db: Firestore | null = app
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })
  : null;
