import type { CacheEntry } from '../interfaces';

/**
 * Returns true when the entry's `expiresAt` has passed. Shared by every
 * `CacheStorage` implementation so "expired" always means the same thing.
 */
export function isExpired(entry: CacheEntry, now: number = Date.now()): boolean {
  return now > entry.expiresAt;
}
