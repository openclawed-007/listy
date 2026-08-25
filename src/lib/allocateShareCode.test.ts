import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSetDoc, mockGetDoc, mockGenerate } = vi.hoisted(() => ({
  mockSetDoc: vi.fn(),
  mockGetDoc: vi.fn(),
  mockGenerate: vi.fn(() => "AB3DK7MP"),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  })),
  setDoc: mockSetDoc,
  getDoc: mockGetDoc,
  serverTimestamp: vi.fn(() => "server-time"),
}));

vi.mock("./shareCode", async () => {
  const actual = await vi.importActual<typeof import("./shareCode")>("./shareCode");
  return {
    ...actual,
    generateShareCode: mockGenerate,
  };
});

import {
  allocateShareCode,
  resolveValidatedShareCode,
} from "./allocateShareCode";

const firestore = { app: "test" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerate.mockReturnValue("AB3DK7MP");
});

describe("allocateShareCode", () => {
  it("returns the code when create succeeds", async () => {
    mockSetDoc.mockResolvedValue(undefined);

    await expect(allocateShareCode(firestore, "owner-1")).resolves.toBe(
      "AB3DK7MP",
    );
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it("reuses a mapping we already created instead of minting a second code", async () => {
    mockSetDoc.mockRejectedValue(new Error("network"));
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner-1" }),
    });

    await expect(allocateShareCode(firestore, "owner-1")).resolves.toBe(
      "AB3DK7MP",
    );
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("retries when the code belongs to someone else", async () => {
    mockSetDoc
      .mockRejectedValueOnce(new Error("already exists"))
      .mockResolvedValueOnce(undefined);
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "other-owner" }),
    });
    mockGenerate.mockReturnValueOnce("AB3DK7MP").mockReturnValueOnce("XY9F2NPQ");

    await expect(allocateShareCode(firestore, "owner-1")).resolves.toBe(
      "XY9F2NPQ",
    );
    expect(mockSetDoc).toHaveBeenCalledTimes(2);
  });
});

describe("resolveValidatedShareCode", () => {
  it("rejects invalid input without querying Firestore", async () => {
    await expect(
      resolveValidatedShareCode(firestore, "not-a-code"),
    ).resolves.toEqual({ status: "invalid" });
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it("normalizes and resolves an active code", async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ ownerId: "owner-1" }),
    });

    await expect(
      resolveValidatedShareCode(firestore, "ab3d-k7mp"),
    ).resolves.toEqual({
      status: "ok",
      code: "AB3DK7MP",
      ownerId: "owner-1",
    });
    expect(mockGetDoc).toHaveBeenCalledOnce();
  });

  it("reports a valid but inactive code", async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    });

    await expect(
      resolveValidatedShareCode(firestore, "AB3DK7MP"),
    ).resolves.toEqual({ status: "inactive" });
  });
});
