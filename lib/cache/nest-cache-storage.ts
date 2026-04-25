import { isExpired } from './expiry';
import type { CacheEntry, CacheStorage } from '../interfaces';
import type { Cache } from '@nestjs/cache-manager';

/**
 * `CacheStorage` adapter that delegates to a `@nestjs/cache-manager`
 * `Cache` service. See the README's "Using `@nestjs/cache-manager` as
 * the cache backend" section for usage.
 *
 * TTL is delegated to cache-manager (the backend decides when an entry
 * is evicted); the service's `cache.expiresIn` is still forwarded as
 * the per-entry TTL so the two configs stay in sync.
 */
export class NestCacheStorage implements CacheStorage {
  constructor(private readonly cache: Cache) {}

  async get(key: string): Promise<CacheEntry | undefined> {
    const stored = await this.cache.get<CacheEntry>(key);
    if (!stored) {
      return undefined;
    }
    if (isExpired(stored)) {
      // Fire-and-forget — cache-manager's own TTL should have evicted
      // this already; the explicit del() is belt-and-braces for keyv
      // adapters configured without eviction. Awaiting the RTT would
      // double the cost of every stale read on Redis/memcached.
      // eslint-disable-next-line promise/prefer-await-to-then -- intentional fire-and-forget
      void this.cache.del(key).catch(() => {
        /* swallow — best-effort eviction */
      });
      return undefined;
    }
    return stored;
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    await this.cache.set(key, entry, deriveTtl(entry));
  }

  async delete(key: string): Promise<boolean> {
    return await this.cache.del(key);
  }

  async clear(): Promise<void> {
    await this.cache.clear();
  }

  /**
   * Read-only — does NOT evict stale entries (see `get()` for the
   * eviction path). Keeps `has()` cheap enough to use as a predicate
   * from caller code.
   */
  async has(key: string): Promise<boolean> {
    const stored = await this.cache.get<CacheEntry>(key);
    return stored != null && !isExpired(stored);
  }
}

/**
 * Translate the service's absolute `expiresAt` into cache-manager's
 * relative TTL. A past or present timestamp collapses to `undefined`,
 * handing control back to the `CacheModule.ttl` default so the caller
 * isn't silently writing entries that immediately expire.
 */
function deriveTtl(entry: CacheEntry): number | undefined {
  const ttl = entry.expiresAt - Date.now();
  return ttl > 0 ? ttl : undefined;
}
