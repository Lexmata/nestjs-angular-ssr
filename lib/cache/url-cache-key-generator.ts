import type { CacheKeyGenerator } from '../interfaces';
import type { Request } from 'express';

/**
 * Default cache key: `<METHOD> <host>/<path?query>`. Host is lower-cased
 * (RFC 3986); path and query stay case-sensitive.
 *
 * HEAD is collapsed to GET so a HEAD probe (load balancer health check,
 * crawler pre-fetch, etc.) hits the same slot as the subsequent GET —
 * the response body is identical and Express strips it for HEAD
 * automatically.
 */
export class UrlCacheKeyGenerator implements CacheKeyGenerator {
  generateCacheKey(request: Request): string {
    const rawMethod = (request.method || 'GET').toUpperCase();
    const method = rawMethod === 'HEAD' ? 'GET' : rawMethod;
    const hostname = (request.hostname || 'localhost').toLowerCase();
    const url = request.originalUrl || request.url || '/';
    return `${method} ${hostname}${url}`;
  }
}
