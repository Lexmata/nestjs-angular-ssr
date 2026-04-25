import { createCache } from 'cache-manager';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NestCacheStorage } from './nest-cache-storage';
import type { CacheEntry } from '../interfaces';
import type { Cache } from '@nestjs/cache-manager';

// A real `cache-manager` instance is used rather than a hand-rolled mock so
// the adapter's expectations about the Cache API stay honest against the
// library it's adapting. The default in-memory store is fine — we never
// leave the process.

const fresh = (content: string, ttlMs = 60_000): CacheEntry => ({
  content,
  expiresAt: Date.now() + ttlMs,
});

describe('NestCacheStorage', () => {
  let cache: Cache;
  let storage: NestCacheStorage;

  beforeEach(() => {
    // cache-manager v7 returns a bare `Cache` instance; that matches the
    // token @nestjs/cache-manager re-exports.
    cache = createCache() as unknown as Cache;
    storage = new NestCacheStorage(cache);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get()', () => {
    it('returns undefined for a missing key', async () => {
      expect(await storage.get('missing')).toBeUndefined();
    });

    it('returns the stored entry', async () => {
      const entry = fresh('<html>ok</html>');
      await storage.set('k', entry);

      const result = await storage.get('k');
      expect(result?.content).toBe('<html>ok</html>');
    });

    it('treats a past expiresAt as a miss even if the store has the value', async () => {
      // Bypass the adapter's own clock to seed a stale entry — cache-manager
      // would otherwise have evicted it on its own TTL too.
      const stale: CacheEntry = { content: '<html>old</html>', expiresAt: Date.now() - 1 };
      await cache.set('k', stale);

      expect(await storage.get('k')).toBeUndefined();
    });

    it('fire-and-forget-evicts the stale entry so a subsequent read is still a miss', async () => {
      const stale: CacheEntry = { content: '<html>old</html>', expiresAt: Date.now() - 1 };
      await cache.set('k', stale);

      await storage.get('k');
      // The del() is intentionally not awaited so the render path
      // doesn't pay a second RTT on Redis-backed stores. Flush the
      // microtask queue before asserting.
      await new Promise((resolve) => setImmediate(resolve));

      expect(await cache.get('k')).toBeUndefined();
    });

    it('ignores errors from the fire-and-forget eviction', async () => {
      const stale: CacheEntry = { content: '<html>old</html>', expiresAt: Date.now() - 1 };
      await cache.set('k', stale);
      vi.spyOn(cache, 'del').mockRejectedValueOnce(new Error('boom'));

      // No unhandled rejection, no throw.
      expect(await storage.get('k')).toBeUndefined();
    });
  });

  describe('set()', () => {
    it('stores an entry retrievable via get()', async () => {
      await storage.set('k', fresh('<html>ok</html>'));
      const result = await storage.get('k');
      expect(result?.content).toBe('<html>ok</html>');
    });

    it('derives cache-manager TTL from expiresAt', async () => {
      const setSpy = vi.spyOn(cache, 'set');
      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      await storage.set('k', { content: 'x', expiresAt: now + 5000 });

      expect(setSpy).toHaveBeenCalledWith('k', expect.any(Object), 5000);
    });

    it('passes undefined when expiresAt is in the past so cache-manager uses its default TTL', async () => {
      const setSpy = vi.spyOn(cache, 'set');
      await storage.set('k', { content: 'x', expiresAt: Date.now() - 1 });

      expect(setSpy).toHaveBeenCalledWith('k', expect.any(Object), undefined);
    });
  });

  describe('delete()', () => {
    it('returns true after deleting a stored key', async () => {
      await storage.set('k', fresh('<html>ok</html>'));
      expect(await storage.delete('k')).toBe(true);
      expect(await storage.get('k')).toBeUndefined();
    });

    it('returns true for a missing key (matches CacheStorage contract)', async () => {
      // CacheStorage.delete() returns true on successful completion,
      // not "true iff a key existed." See `cache-storage.interface.ts`.
      expect(await storage.delete('nope')).toBe(true);
    });
  });

  describe('clear()', () => {
    it('empties the store', async () => {
      await storage.set('a', fresh('A'));
      await storage.set('b', fresh('B'));

      await storage.clear();

      expect(await storage.get('a')).toBeUndefined();
      expect(await storage.get('b')).toBeUndefined();
    });
  });

  describe('has()', () => {
    it('returns false for a missing key', async () => {
      expect(await storage.has('missing')).toBe(false);
    });

    it('returns true for a valid key', async () => {
      await storage.set('k', fresh('ok'));
      expect(await storage.has('k')).toBe(true);
    });

    it('returns false for a stale key without deleting it', async () => {
      const stale: CacheEntry = { content: 'old', expiresAt: Date.now() - 1 };
      await cache.set('k', stale);
      const delSpy = vi.spyOn(cache, 'del');

      expect(await storage.has('k')).toBe(false);
      expect(delSpy).not.toHaveBeenCalled();
    });
  });
});
