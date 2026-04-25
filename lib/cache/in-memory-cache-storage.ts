import { isExpired } from './expiry';
import type { CacheEntry, CacheStorage } from '../interfaces';

/**
 * Default upper bound on cached entries. Once the cache holds this many
 * distinct keys, the next `set` evicts the least-recently-used entry.
 */
export const DEFAULT_CACHE_MAX_ENTRIES = 1024;

/**
 * In-memory `CacheStorage` with LRU eviction.
 *
 * The Map's insertion-order iteration is leveraged for recency tracking:
 * every `get` (and `set` of an existing key) re-inserts the entry, so the
 * first key returned by `cache.keys()` is always the least-recently used.
 * When `set` would exceed `maxEntries`, the oldest entries are dropped
 * until the size is back under the limit.
 *
 * @param maxEntries — upper bound on cached entries. Pass `0` (or a
 *   negative number) to disable the bound entirely (not recommended for
 *   production, but useful in tests).
 */
export class InMemoryCacheStorage implements CacheStorage {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxEntries: number;

  constructor(maxEntries: number = DEFAULT_CACHE_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  get(key: string): CacheEntry | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }
    if (isExpired(entry)) {
      this.cache.delete(key);
      return undefined;
    }
    // Mark as most-recently-used by re-inserting at the tail.
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }

  set(key: string, entry: CacheEntry): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, entry);
    this.evictIfOverCapacity();
  }

  /**
   * @returns always `true` — matches `cache-manager` / Redis semantics
   * where a missing key is not an error.
   */
  delete(key: string): boolean {
    this.cache.delete(key);
    return true;
  }

  clear(): void {
    this.cache.clear();
  }

  /**
   * Read-only existence check. Does NOT evict stale entries — pairs with
   * `CacheStorage.has()`'s contract, so callers using it as a predicate
   * don't trigger unexpected writes.
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    return entry !== undefined && !isExpired(entry);
  }

  /**
   * Current entry count (including any not-yet-pruned expired entries).
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Remove all expired entries.
   */
  prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (isExpired(entry, now)) {
        this.cache.delete(key);
      }
    }
  }

  private evictIfOverCapacity(): void {
    if (this.maxEntries <= 0) {
      return;
    }
    for (const oldest of this.cache.keys()) {
      if (this.cache.size <= this.maxEntries) {
        return;
      }
      this.cache.delete(oldest);
    }
  }
}
