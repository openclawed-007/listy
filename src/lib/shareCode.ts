// Short share codes for shopping lists.
//
// QR links are fine when you're next to someone; codes work over a phone call
// or a quick text. Codes are unguessable (cryptographic random), not sequential,
// and only valid while sharing is on — the mapping is deleted when sharing stops.

/** Crockford-style alphabet: no 0/O, 1/I/L to avoid spoken/typed mix-ups. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const SHARE_CODE_LENGTH = 8;
export const SHARE_CODE_RAW_PATTERN = new RegExp(
  `^[${ALPHABET}]{${SHARE_CODE_LENGTH}}$`,
);

/**
 * Cryptographically random raw code (no separators). Falls back to Math.random
 * only when Web Crypto is unavailable (still non-sequential).
 */
export function generateShareCode(length = SHARE_CODE_LENGTH): string {
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return code;
}

/** Strip spaces/dashes and uppercase so "ab3d k7mp" and "AB3D-K7MP" match. */
export function normalizeShareCodeInput(input: string): string {
  return input.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, "");
}

export function isValidShareCode(code: string): boolean {
  return SHARE_CODE_RAW_PATTERN.test(code);
}

/** Display form for people: AB3D-K7MP */
export function formatShareCode(code: string): string {
  const raw = normalizeShareCodeInput(code);
  if (raw.length !== SHARE_CODE_LENGTH) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Path segment used in /c/{code} URLs (no separators). */
export function shareCodePath(code: string): string {
  return normalizeShareCodeInput(code);
}

export function buildShareCodeUrl(origin: string, code: string): string {
  const raw = shareCodePath(code);
  return `${origin.replace(/\/$/, "")}/c/${raw}`;
}
