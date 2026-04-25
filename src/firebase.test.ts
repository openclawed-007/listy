import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetAuth,
  mockGoogleAuthProvider,
  mockInitializeApp,
  mockInitializeFirestore,
  mockPersistentLocalCache,
  mockPersistentMultipleTabManager,
} = vi.hoisted(() => ({
  mockGetAuth: vi.fn(() => ({ type: "auth" })),
  mockGoogleAuthProvider: vi.fn(function GoogleAuthProvider() {
    return { type: "provider" };
  }),
  mockInitializeApp: vi.fn(() => ({ type: "app" })),
  mockInitializeFirestore: vi.fn(() => ({ type: "firestore" })),
  mockPersistentLocalCache: vi.fn((settings) => ({ type: "persistent-cache", settings })),
  mockPersistentMultipleTabManager: vi.fn(() => ({ type: "multi-tab-manager" })),
}));

vi.mock("firebase/app", () => ({
  initializeApp: mockInitializeApp,
}));

vi.mock("firebase/auth", () => ({
  getAuth: mockGetAuth,
  GoogleAuthProvider: mockGoogleAuthProvider,
}));

vi.mock("firebase/firestore", () => ({
  initializeFirestore: mockInitializeFirestore,
  persistentLocalCache: mockPersistentLocalCache,
  persistentMultipleTabManager: mockPersistentMultipleTabManager,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Firebase initialization", () => {
  it("enables persistent multi-tab Firestore cache when configured", async () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "key");
    vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "cartlink.firebaseapp.com");
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "cartlink");
    vi.stubEnv("VITE_FIREBASE_STORAGE_BUCKET", "cartlink.firebasestorage.app");
    vi.stubEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "123");
    vi.stubEnv("VITE_FIREBASE_APP_ID", "app-id");

    const firebase = await import("./firebase");

    expect(firebase.isFirebaseConfigured).toBe(true);
    expect(mockInitializeFirestore).toHaveBeenCalledWith(
      { type: "app" },
      {
        localCache: {
          type: "persistent-cache",
          settings: {
            tabManager: { type: "multi-tab-manager" },
          },
        },
      },
    );
  });

  it("does not initialize Firebase when local credentials are missing", async () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "");
    vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "");
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "");
    vi.stubEnv("VITE_FIREBASE_STORAGE_BUCKET", "");
    vi.stubEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "");
    vi.stubEnv("VITE_FIREBASE_APP_ID", "");

    const firebase = await import("./firebase");

    expect(firebase.isFirebaseConfigured).toBe(false);
    expect(firebase.db).toBeNull();
    expect(mockInitializeApp).not.toHaveBeenCalled();
    expect(mockInitializeFirestore).not.toHaveBeenCalled();
  });
});
