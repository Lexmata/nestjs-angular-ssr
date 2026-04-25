import type { CacheEntry, CacheStorage } from '../interfaces';
import type { Cache } from '@nestjs/cache-manager';

/**
 * `CacheStorage` adapter that delegates persistence to a
 * `@nestjs/cache-manager` `Cache` service. Use this when the host app
 * already configures `CacheModule` — for example to share a Redis /
 * memcached / multi-store backend across the rest of the application,
 * or to get observability (metrics, tracing) that the default
 * in-memory storage lacks.
 *
 * TTL is **delegated to cache-manager**. `CacheEntry.expiresAt` is
 * still honoured on read (stale entries are reported as misses) but
 * cache-manager's own TTL is what actually reclaims memory; the
 * service's `cache.expiresIn` still drives both values so they stay
 * in sync. If you want cache-manager to own expiration exclusively,
 * set a long `expiresIn` on the service and a shorter TTL on
 * `CacheModule`.
 *
 * @example
 * ```ts
 * import { Inject, Module } from '@nestjs/common';
 * import { Cache, CacheModule } from '@nestjs/cache-manager';
 * import { AngularSSRModule, NestCacheStorage } from '@lexmata/nestjs-angular-ssr';
 *
 * @Module({
 *   imports: [
 *     CacheModule.register({ ttl: 60_000 }),
 *     AngularSSRModule.forRootAsync({
 *       imports: [CacheModule.register({ ttl: 60_000 })],
 *       inject: [Cache],
 *       useFactory: (cache: Cache) => ({
 *         browserDistFolder: '...',
 *         bootstrap: () => getAngularAppEngine(),
 *         cache: { storage: new NestCacheStorage(cache) },
 *       }),
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
export class NestCacheStorage implements CacheStorage {
  constructor(private readonly cache: Cache) {}

  async get(key: string): Promise<CacheEntry | undefined> {
    const stored = await this.cache.get<CacheEntry>(key);
    if (!stored) {
      return undefined;
    }
    // cache-manager's own TTL should have evicted this already, but
    // honour the embedded expiresAt anyway so custom stores that never
    // evict (e.g. keyv with TTL disabled) don't serve stale content.
    if (Date.now() > stored.expiresAt) {
      await this.cache.del(key);
      return undefined;
    }
    return stored;
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    // Translate the service's absolute expiresAt into a relative TTL
    // for cache-manager. A past timestamp collapses to 0, which tells
    // cache-manager to use its own default TTL.
    const ttl = Math.max(0, entry.expiresAt - Date.now());
    await this.cache.set(key, entry, ttl > 0 ? ttl : undefined);
  }

  async delete(key: string): Promise<boolean> {
    return await this.cache.del(key);
  }

  async clear(): Promise<void> {
    await this.cache.clear();
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }
}
