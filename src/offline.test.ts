import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./offline";

describe("registerServiceWorker", () => {
  const originalServiceWorker = navigator.serviceWorker;
  const register = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });
  });

  afterAll(() => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: originalServiceWorker,
    });
  });

  it("registers the service worker when forced", () => {
    registerServiceWorker({ force: true });

    window.dispatchEvent(new Event("load"));

    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("does not register during non-production test runs unless forced", () => {
    registerServiceWorker();

    window.dispatchEvent(new Event("load"));

    expect(register).not.toHaveBeenCalled();
  });
});
