import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryCacheStorage } from './in-memory-cache-storage';
import type { CacheEntry } from '../interfaces';

describe('InMemoryCacheStorage', () => {
  let storage: InMemoryCacheStorage;

  beforeEach(() => {
    storage = new InMemoryCacheStorage();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('set()', () => {
    it('should store a cache entry', () => {
      const entry: CacheEntry = {
        content: '<html>Test</html>',
        expiresAt: Date.now() + 60_000,
      };

      storage.set('test-key', entry);

      expect(storage.size).toBe(1);
    });

    it('should overwrite existing entry with same key', () => {
      const entry1: CacheEntry = {
        content: '<html>First</html>',
        expiresAt: Date.now() + 60_000,
      };
      const entry2: CacheEntry = {
        content: '<html>Second</html>',
        expiresAt: Date.now() + 60_000,
      };

      storage.set('test-key', entry1);
      storage.set('test-key', entry2);

      expect(storage.size).toBe(1);
      expect(storage.get('test-key')?.content).toBe('<html>Second</html>');
    });
  });

  describe('get()', () => {
    it('should return undefined for non-existent key', () => {
      expect(storage.get('non-existent')).toBeUndefined();
    });

    it('should return the cached entry for valid key', () => {
      const entry: CacheEntry = {
        content: '<html>Test</html>',
        expiresAt: Date.now() + 60_000,
      };

      storage.set('test-key', entry);

      const result = storage.get('test-key');
      expect(result).toEqual(entry);
    });

    it('should return undefined and delete entry if expired', () => {
      const now = Date.now();
      const entry: CacheEntry = {
        content: '<html>Expired</html>',
        expiresAt: now + 1000, // Expires in 1 second
      };

      storage.set('test-key', entry);

      // Advance time past expiration
      vi.advanceTimersByTime(2000);

      const result = storage.get('test-key');
      expect(result).toBeUndefined();
      expect(storage.size).toBe(0);
    });

    it('should return entry if not yet expired', () => {
      const now = Date.now();
      const entry: CacheEntry = {
        content: '<html>Valid</html>',
        expiresAt: now + 10_000, // Expires in 10 seconds
      };

      storage.set('test-key', entry);

      // Advance time but not past expiration
      vi.advanceTimersByTime(5000);

      const result = storage.get('test-key');
      expect(result).toBeDefined();
      expect(result?.content).toBe('<html>Valid</html>');
    });
  });

  describe('delete()', () => {
    it('should return false for non-existent key', () => {
      expect(storage.delete('non-existent')).toBe(false);
    });

    it('should delete entry and return true', () => {
      const entry: CacheEntry = {
        content: '<html>Test</html>',
        expiresAt: Date.now() + 60_000,
      };

      storage.set('test-key', entry);
      expect(storage.size).toBe(1);

      const result = storage.delete('test-key');
      expect(result).toBe(true);
      expect(storage.size).toBe(0);
    });
  });

  describe('clear()', () => {
    it('should remove all entries', () => {
      const entry: CacheEntry = {
        content: '<html>Test</html>',
        expiresAt: Date.now() + 60_000,
      };

      storage.set('key1', entry);
      storage.set('key2', entry);
      storage.set('key3', entry);

      expect(storage.size).toBe(3);

      storage.clear();

      expect(storage.size).toBe(0);
    });
  });

  describe('has()', () => {
    it('should return false for non-existent key', () => {
      expect(storage.has('non-existent')).toBe(false);
    });

    it('should return true for existing valid key', () => {
      const entry: CacheEntry = {
        content: '<html>Test</html>',
        expiresAt: Date.now() + 60_000,
      };

      storage.set('test-key', entry);

      expect(storage.has('test-key')).toBe(true);
    });

    it('should return false for expired key', () => {
      const now = Date.now();
      const entry: CacheEntry = {
        content: '<html>Expired</html>',
        expiresAt: now + 1000,
      };

      storage.set('test-key', entry);

      vi.advanceTimersByTime(2000);

      expect(storage.has('test-key')).toBe(false);
    });
  });

  describe('size', () => {
    it('should return 0 for empty storage', () => {
      expect(storage.size).toBe(0);
    });

    it('should return correct count', () => {
      const entry: CacheEntry = {
        content: '<html>Test</html>',
        expiresAt: Date.now() + 60_000,
      };

      storage.set('key1', entry);
      expect(storage.size).toBe(1);

      storage.set('key2', entry);
      expect(storage.size).toBe(2);
    });
  });

  describe('prune()', () => {
    it('should remove all expired entries', () => {
      const now = Date.now();

      // Add some entries with different expiration times
      storage.set('valid1', {
        content: '<html>Valid1</html>',
        expiresAt: now + 10_000,
      });
      storage.set('expired1', {
        content: '<html>Expired1</html>',
        expiresAt: now + 1000,
      });
      storage.set('valid2', {
        content: '<html>Valid2</html>',
        expiresAt: now + 10_000,
      });
      storage.set('expired2', {
        content: '<html>Expired2</html>',
        expiresAt: now + 500,
      });

      expect(storage.size).toBe(4);

      // Advance time past some expirations
      vi.advanceTimersByTime(2000);

      storage.prune();

      expect(storage.size).toBe(2);
      expect(storage.has('valid1')).toBe(true);
      expect(storage.has('valid2')).toBe(true);
      expect(storage.has('expired1')).toBe(false);
      expect(storage.has('expired2')).toBe(false);
    });

    it('should handle empty storage', () => {
      expect(() => storage.prune()).not.toThrow();
      expect(storage.size).toBe(0);
    });
  });
});
