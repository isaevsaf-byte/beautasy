import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Protecting the few secrets that have to live in Sanity.
 *
 * The dataset is public, and cannot be made private on this project's Sanity
 * plan — the CLI answers `ACL mode "private" not allowed for this project`.
 * The project id is in every product image URL, so anyone can read the whole
 * dataset. Most of what is in there is meant to be public; two things are not:
 *
 *   giftCard.code   — spendable money. Read it, spend it.
 *   order.reviewToken — the proof someone bought a piece, which is what lets a
 *                       review carry "verified purchase".
 *
 * Neither is stored in the clear any more:
 *
 *   fingerprint()  keyed, one-way, and the same input always gives the same
 *                  output — so a code can still be looked up by GROQ, but a
 *                  copy of the dataset yields nothing usable. It is keyed
 *                  rather than a plain hash because a gift card code is eight
 *                  characters from a 28-letter alphabet: a bare SHA-256 of
 *                  every possible code is minutes of work.
 *
 *   seal/unseal()  AES-256-GCM, for the one value we have to be able to read
 *                  back: a scheduled gift card is emailed weeks after it was
 *                  bought, and that email has to carry the actual code.
 *
 * The key is DATA_SECRET, a server-side environment variable. Rotating it
 * strands every existing gift card and review link, so treat it as permanent.
 */

const SEALED_PREFIX = "v1";

function rawSecret(): string | undefined {
  return process.env.DATA_SECRET;
}

/** Whether gift cards and review links can be issued or redeemed at all. */
export function secretsConfigured(): boolean {
  return !!rawSecret();
}

function key(): Buffer {
  const secret = rawSecret();
  if (!secret) {
    throw new Error(
      "DATA_SECRET is not set. Gift card codes and review links are stored keyed, so nothing can be issued or redeemed without it."
    );
  }
  // A passphrase of any length becomes the 32 bytes AES and HMAC both want
  return createHash("sha256").update(secret).digest();
}

/**
 * A stable, keyed fingerprint of a secret, safe to store in a public dataset
 * and to match on in a query.
 */
export function fingerprint(value: string): string {
  return createHmac("sha256", key()).update(value).digest("hex");
}

/** Constant-time comparison, for the rare case of comparing two fingerprints. */
export function fingerprintsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Encrypts a value so it can be read back later by this deployment only. */
export function seal(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SEALED_PREFIX}.${Buffer.concat([iv, tag, ciphertext]).toString("base64url")}`;
}

/** Reads back a sealed value, or null when it cannot be trusted. */
export function unseal(sealed: string | undefined | null): string | null {
  if (!sealed) return null;
  const [version, payload] = sealed.split(".");
  if (version !== SEALED_PREFIX || !payload) return null;

  try {
    const bytes = Buffer.from(payload, "base64url");
    const iv = bytes.subarray(0, 12);
    const tag = bytes.subarray(12, 28);
    const ciphertext = bytes.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key, or tampered-with ciphertext. Either way there is nothing to read.
    return null;
  }
}
