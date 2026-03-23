import type { Request } from 'express';

/**
 * Interface for implementing custom cache key generation logic
 */
export interface CacheKeyGenerator {
  /**
   * Generate a unique cache key for the given request
   * @param request The Express request object
   * @returns A string key to use for caching
   */
  generateCacheKey(request: Request): string;
}
