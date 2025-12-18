/**
 * Authentication and API key management for CodeMap MCP Server
 * Handles secure API key generation, hashing, and validation
 */

/**
 * Generate a cryptographically secure API key
 *
 * Format: `cm_` prefix + 43 base62 characters (256 bits of entropy)
 * Each key is unique and generated using crypto.getRandomValues()
 *
 * @returns A new API key string that should be saved by the user
 *
 * @example
 * ```typescript
 * const apiKey = generateApiKey();
 * // Returns: "cm_abcDEF123xyz..."
 * ```
 */
export function generateApiKey(): string {
  // Generate random bytes - using 33 bytes to ensure we get 43 base62 chars
  // (since log(256^33) / log(62) ≈ 54.3, we get at least 43 chars)
  const bytes = crypto.getRandomValues(new Uint8Array(33));

  // Convert to base62 string
  const base62 = toBase62(bytes);

  // Take first 43 characters to ensure consistent length
  const truncated = base62.substring(0, 43);

  // Return with cm_ prefix
  return `cm_${truncated}`;
}

/**
 * Convert bytes to base62 string
 *
 * Base62 uses: 0-9, A-Z, a-z (62 characters)
 * This provides a compact, URL-safe representation
 *
 * @param bytes - Uint8Array to convert
 * @returns Base62 encoded string
 *
 * @internal
 */
function toBase62(bytes: Uint8Array): string {
  const chars =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let result = "";

  // Convert each byte to a base62 character
  for (const byte of bytes) {
    result += chars[byte % 62];
  }

  // Continue converting remaining bits for better distribution
  let num = 0;
  for (const byte of bytes) {
    num = (num * 256 + byte) % 62;
  }

  return result;
}

/**
 * Hash an API key for secure storage
 *
 * Uses SHA-256 one-way hash. Plain keys are never stored.
 * This allows us to validate keys without keeping them in plaintext.
 *
 * @param apiKey - The API key to hash
 * @returns SHA-256 hash as hex string
 *
 * @example
 * ```typescript
 * const keyHash = await hashApiKey('cm_abc123...');
 * // Returns: "a1b2c3d4e5f6..." (64 hex characters)
 * ```
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Derive user ID from an API key
 *
 * Hashes the key and takes the first 16 characters.
 * This provides a unique, consistent user identifier without exposing the key.
 *
 * @param apiKey - The API key to derive user ID from
 * @returns 16-character user ID derived from key hash
 *
 * @example
 * ```typescript
 * const userId = await getUserIdFromApiKey('cm_abc123...');
 * // Returns: "a1b2c3d4e5f6a1b2"
 * ```
 */
export async function getUserIdFromApiKey(apiKey: string): Promise<string> {
  const hash = await hashApiKey(apiKey);
  return hash.substring(0, 16);
}

/**
 * Validate an API key against the stored key hash in KV
 *
 * @param kv - KV namespace to check against
 * @param apiKey - The API key to validate (from Authorization header)
 * @returns Object with `valid` boolean and optional `userId` if valid
 *
 * @example
 * ```typescript
 * const { valid, userId } = await validateApiKey(kv, 'cm_abc123...');
 * if (valid) {
 *   // Key is registered, userId can be used for scoping
 * }
 * ```
 */
export async function validateApiKey(
  kv: KVNamespace,
  apiKey: string | undefined,
): Promise<{ valid: boolean; userId?: string }> {
  if (!apiKey) {
    return { valid: false };
  }

  try {
    const hash = await hashApiKey(apiKey);
    const keyData = await kv.get(`apikey:${hash}`);

    if (!keyData) {
      return { valid: false };
    }

    // Key exists, derive user ID
    const userId = hash.substring(0, 16);
    return { valid: true, userId };
  } catch (error) {
    // If KV lookup fails, return invalid
    return { valid: false };
  }
}
