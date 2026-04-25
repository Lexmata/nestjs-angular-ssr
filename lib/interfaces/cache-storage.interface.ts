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
