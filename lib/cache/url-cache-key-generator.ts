import type { CacheKeyGenerator } from '../interfaces';
import type { Request } from 'express';

/**
 * Default cache key: `<METHOD> <host>/<path?query>`. Method is included to
 * stop verb collisions; host is lower-cased (RFC 3986); path stays
 * case-sensitive.
 */
export class UrlCacheKeyGenerator implements CacheKeyGenerator {
  generateCacheKey(request: Request): string {
    const method = (request.method || 'GET').toUpperCase();
    const hostname = (request.hostname || 'localhost').toLowerCase();
    const url = request.originalUrl || request.url || '/';
    return `${method} ${hostname}${url}`;
  }
}
