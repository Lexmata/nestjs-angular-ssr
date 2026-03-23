import type { CacheKeyGenerator } from '../interfaces';
import type { Request } from 'express';

/**
 * Default cache key generator based on URL
 */
export class UrlCacheKeyGenerator implements CacheKeyGenerator {
  generateCacheKey(request: Request): string {
    // Combine hostname and original URL for unique cache key
    const hostname = request.hostname || 'localhost';
    const url = request.originalUrl || request.url || '/';
    return `${hostname}${url}`.toLowerCase();
  }
}
