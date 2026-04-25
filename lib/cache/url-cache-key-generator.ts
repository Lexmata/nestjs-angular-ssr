import type { CacheKeyGenerator } from '../interfaces';
import type { Request } from 'express';

/**
 * Default cache key generator: combines HTTP method, hostname, and the full
 * request URL.
 *
 * - Method is included so `GET /foo` and `POST /foo` cannot collide.
 * - Hostname is lower-cased per RFC 3986 (host component is case-insensitive).
 * - Path and query string are preserved as-is — paths are case-sensitive per
 *   RFC 3986 and lower-casing them would collapse `/Users/Alice` and
 *   `/users/alice` into the same cache slot.
 */
export class UrlCacheKeyGenerator implements CacheKeyGenerator {
  generateCacheKey(request: Request): string {
    const method = (request.method || 'GET').toUpperCase();
    const hostname = (request.hostname || 'localhost').toLowerCase();
    const url = request.originalUrl || request.url || '/';
    return `${method} ${hostname}${url}`;
  }
}
