import { describe, expect, it } from "vitest";
import {
  SHARE_CODE_LENGTH,
  buildShareCodeUrl,
  formatShareCode,
  generateShareCode,
  isValidShareCode,
  normalizeShareCodeInput,
  shareCodePath,
} from "./shareCode";

describe("shareCode", () => {
  it("generates fixed-length codes from the safe alphabet", () => {
    const code = generateShareCode();
    expect(code).toHaveLength(SHARE_CODE_LENGTH);
    expect(isValidShareCode(code)).toBe(true);
  });

  it("normalises typed codes with spaces, dashes and lowercase", () => {
    expect(normalizeShareCodeInput(" ab3d-k7mp ")).toBe("AB3DK7MP");
    expect(normalizeShareCodeInput("ab3d k7mp")).toBe("AB3DK7MP");
  });

  it("rejects codes that are too short or use ambiguous glyphs", () => {
    expect(isValidShareCode("SHORT")).toBe(false);
    expect(isValidShareCode("OOOOOOOO")).toBe(false);
    expect(isValidShareCode("11111111")).toBe(false);
  });

  it("formats for speaking and builds the join URL", () => {
    expect(formatShareCode("AB3DK7MP")).toBe("AB3D-K7MP");
    expect(shareCodePath("ab3d-k7mp")).toBe("AB3DK7MP");
    expect(buildShareCodeUrl("https://cartlink.co.uk/", "AB3DK7MP")).toBe(
      "https://cartlink.co.uk/c/AB3DK7MP",
    );
  });
});
