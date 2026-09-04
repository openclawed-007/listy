import { renderHook, act } from "@testing-library/react";
import { useContext } from "react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "./AuthContext.shared";
import { AuthProvider } from "./AuthContext";

const {
  mockAuth,
  mockProvider,
  mockSignInWithPopup,
  mockSignInWithRedirect,
  mockGetRedirectResult,
  mockOnAuthStateChanged,
} = vi.hoisted(() => ({
  mockAuth: { app: "test-auth" },
  mockProvider: { providerId: "google.com" },
  mockSignInWithPopup: vi.fn(),
  mockSignInWithRedirect: vi.fn(),
  mockGetRedirectResult: vi.fn(),
  mockOnAuthStateChanged: vi.fn(),
}));

vi.mock("../firebase", () => ({
  auth: mockAuth,
  googleProvider: mockProvider,
}));

vi.mock("firebase/auth", () => ({
  getRedirectResult: mockGetRedirectResult,
  onAuthStateChanged: mockOnAuthStateChanged,
  signInWithPopup: mockSignInWithPopup,
  signInWithRedirect: mockSignInWithRedirect,
  signOut: vi.fn(),
}));

function authError(code: string) {
  return Object.assign(new Error(code), { code });
}

function setStandalone(standalone: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: standalone && query === "(display-mode: standalone)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

function renderAuth() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );
  return renderHook(() => useContext(AuthContext), { wrapper });
}

describe("AuthProvider login fallback", () => {
  beforeEach(() => {
    mockSignInWithPopup.mockReset();
    mockSignInWithRedirect.mockReset().mockResolvedValue(undefined);
    mockGetRedirectResult.mockReset().mockResolvedValue(null);
    mockOnAuthStateChanged.mockReset().mockImplementation(() => () => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    setStandalone(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signs in with a popup when it succeeds", async () => {
    mockSignInWithPopup.mockResolvedValue({ user: { uid: "u1" } });
    const { result } = renderAuth();

    await act(async () => {
      await result.current!.login();
    });

    expect(mockSignInWithPopup).toHaveBeenCalledWith(mockAuth, mockProvider);
    expect(mockSignInWithRedirect).not.toHaveBeenCalled();
  });

  it("falls back to redirect when the browser blocks the popup", async () => {
    mockSignInWithPopup.mockRejectedValue(authError("auth/popup-blocked"));
    const { result } = renderAuth();

    await act(async () => {
      await result.current!.login();
    });

    expect(mockSignInWithRedirect).toHaveBeenCalledWith(mockAuth, mockProvider);
  });

  it("does not redirect when the user closes the popup in a normal tab", async () => {
    mockSignInWithPopup.mockRejectedValue(
      authError("auth/popup-closed-by-user"),
    );
    const { result } = renderAuth();

    await expect(
      act(async () => {
        await result.current!.login();
      }),
    ).rejects.toThrow("Sign-in popup was closed before completing login.");

    expect(mockSignInWithRedirect).not.toHaveBeenCalled();
  });

  it("treats a closed popup as blocked inside an installed PWA", async () => {
    setStandalone(true);
    mockSignInWithPopup.mockRejectedValue(
      authError("auth/popup-closed-by-user"),
    );
    const { result } = renderAuth();

    await act(async () => {
      await result.current!.login();
    });

    expect(mockSignInWithRedirect).toHaveBeenCalledWith(mockAuth, mockProvider);
  });

  it("surfaces a friendly error when the redirect itself fails", async () => {
    mockSignInWithPopup.mockRejectedValue(authError("auth/popup-blocked"));
    mockSignInWithRedirect.mockRejectedValue(
      authError("auth/network-request-failed"),
    );
    const { result } = renderAuth();

    await expect(
      act(async () => {
        await result.current!.login();
      }),
    ).rejects.toThrow("Unable to sign in right now. Please try again.");
  });
});
