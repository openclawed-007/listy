import { describe, expect, it } from "vitest";
import {
  anonymousPermissions,
  effectivePermissionsFor,
  hasAnyPermission,
  NO_PERMISSIONS,
  normalizeSharePermissions,
} from "./sharePermissions";

const FULL = { toggle: true, add: true, remove: true };

describe("sharePermissions", () => {
  it("normalizes unknown input to all-false", () => {
    expect(normalizeSharePermissions(undefined)).toEqual(NO_PERMISSIONS);
    expect(normalizeSharePermissions({ toggle: "yes", add: true })).toEqual({
      toggle: false,
      add: true,
      remove: false,
    });
    expect(hasAnyPermission(NO_PERMISSIONS)).toBe(false);
  });

  describe("anonymousPermissions", () => {
    it("grants nothing unless the owner opted in", () => {
      expect(anonymousPermissions(FULL, false)).toEqual(NO_PERMISSIONS);
    });

    it("never grants remove, even when the owner allows it for collaborators", () => {
      expect(anonymousPermissions(FULL, true)).toEqual({
        toggle: true,
        add: true,
        remove: false,
      });
    });

    it("still respects the owner's toggle/add choices", () => {
      expect(
        anonymousPermissions({ toggle: true, add: false, remove: true }, true),
      ).toEqual({ toggle: true, add: false, remove: false });
    });
  });

  it("effectivePermissionsFor narrows only anonymous viewers", () => {
    expect(effectivePermissionsFor(FULL, true, false)).toEqual(FULL);
    expect(effectivePermissionsFor(FULL, true, true)).toEqual({
      ...FULL,
      remove: false,
    });
    expect(effectivePermissionsFor(FULL, false, true)).toEqual(NO_PERMISSIONS);
  });
});
