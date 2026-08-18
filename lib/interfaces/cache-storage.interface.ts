/**
 * Cache entry with content and expiration timestamp
 */
export interface CacheEntry {
  /**
   * The cached HTML content
   */
  content: string;

  /**
   * Timestamp when this cache entry expires
   */
  expiresAt: number;

  /**
   * HTTP status the render produced, when Angular asked for one other than
   * 200. Replayed on cache hits — without it a cached 404 body would be
   * served as a 200, which is the soft-404 this cache would otherwise
   * reintroduce on every hit.
   *
   * Optional so entries written by earlier versions (and custom CacheStorage
   * implementations that don't know the field) still load.
   */
  status?: number;

  /**
   * Response headers the render produced, lowercased. Carries `Location` for
   * redirects and anything a server route configured. Values may be arrays
   * (`Set-Cookie` is kept as separate entries rather than comma-joined).
   *
   * Per-visitor headers are stripped before an entry is stored — see
   * `cacheableOutcome` — because the default cache key carries no `Vary`
   * awareness and replaying them would hand one visitor's session to another.
   *
   * Same optionality note as `status`.
   */
  headers?: Record<string, string | string[]>;
}

/**
 * Interface for implementing custom cache storage mechanisms
 */
export interface CacheStorage {
  /**
   * Retrieve a cached entry by key
   * @param key The cache key
   * @returns The cached entry or undefined if not found/expired
   */
  get(key: string): Promise<CacheEntry | undefined> | CacheEntry | undefined;

  /**
   * Store an entry in the cache
   * @param key The cache key
   * @param entry The cache entry to store
   */
  set(key: string, entry: CacheEntry): Promise<void> | void;

  /**
   * Remove an entry from the cache.
   *
   * Returns `true` when the operation completed successfully. This mirrors
   * `cache-manager` / Redis semantics — a missing key is not an error, so
   * implementations SHOULD return `true` regardless of whether a key was
   * actually removed. Callers that need "was a key removed?" information
   * should call `has()` first.
   *
   * @param key The cache key to remove
   */
  delete(key: string): Promise<boolean> | boolean;

  /**
   * Clear all entries from the cache
   */
  clear(): Promise<void> | void;

  /**
   * Check if a key exists in the cache
   * @param key The cache key
   */
  has(key: string): Promise<boolean> | boolean;
}
