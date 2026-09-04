import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyStoredTheme, useDarkMode } from "./useDarkMode";

type Listener = (event: { matches: boolean }) => void;

function mockSystemScheme(dark: boolean) {
  const listeners = new Set<Listener>();
  const media = {
    matches: dark,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_: string, cb: Listener) => listeners.add(cb)),
    removeEventListener: vi.fn((_: string, cb: Listener) => listeners.delete(cb)),
    dispatchEvent: vi.fn(),
  };
  window.matchMedia = vi.fn().mockReturnValue(media) as typeof window.matchMedia;
  return {
    flip(next: boolean) {
      media.matches = next;
      listeners.forEach((cb) => cb({ matches: next }));
    },
  };
}

describe("useDarkMode", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("follows the device setting when the user has not chosen", () => {
    const system = mockSystemScheme(true);
    applyStoredTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    const { result } = renderHook(() => useDarkMode());
    expect(result.current.dark).toBe(true);
    // Following the system must not pin a choice into storage.
    expect(localStorage.getItem("theme")).toBeNull();

    act(() => system.flip(false));
    expect(result.current.dark).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("pins an explicit toggle and stops tracking the device", () => {
    const system = mockSystemScheme(false);
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.dark).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.dark).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");

    act(() => system.flip(false));
    expect(result.current.dark).toBe(true);
  });

  it("honours a saved light choice over a dark device", () => {
    localStorage.setItem("theme", "light");
    mockSystemScheme(true);
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.dark).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
