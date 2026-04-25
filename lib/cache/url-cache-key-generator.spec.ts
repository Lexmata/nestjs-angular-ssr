import { describe, expect, it } from 'vitest';
import { UrlCacheKeyGenerator } from './url-cache-key-generator';
import type { Request } from 'express';

describe('UrlCacheKeyGenerator', () => {
  const generator = new UrlCacheKeyGenerator();

  const make = (overrides: Partial<Request> = {}): Request =>
    ({
      method: 'GET',
      hostname: 'example.com',
      originalUrl: '/products/123',
      url: '/products/123',
      ...overrides,
    }) as unknown as Request;

  describe('generateCacheKey()', () => {
    it('prefixes the HTTP method, lower-cases the host, and preserves the URL', () => {
      expect(generator.generateCacheKey(make())).toBe('GET example.com/products/123');
    });

    it('lower-cases the hostname only — paths stay case-sensitive', () => {
      const key = generator.generateCacheKey(
        make({ hostname: 'Example.COM', originalUrl: '/Products/ABC', url: '/Products/ABC' }),
      );
      expect(key).toBe('GET example.com/Products/ABC');
    });

    it('uses default hostname when not provided', () => {
      const key = generator.generateCacheKey(
        make({
          hostname: undefined,
          originalUrl: '/page',
          url: '/page',
        } as unknown as Partial<Request>),
      );
      expect(key).toBe('GET localhost/page');
    });

    it('falls back to url when originalUrl is missing', () => {
      const key = generator.generateCacheKey(
        make({ originalUrl: undefined, url: '/fallback-page' } as unknown as Partial<Request>),
      );
      expect(key).toBe('GET example.com/fallback-page');
    });

    it('uses "/" when neither originalUrl nor url is provided', () => {
      const key = generator.generateCacheKey(
        make({ originalUrl: undefined, url: undefined } as unknown as Partial<Request>),
      );
      expect(key).toBe('GET example.com/');
    });

    it('preserves query strings', () => {
      const key = generator.generateCacheKey(
        make({ originalUrl: '/search?q=test&page=1', url: '/search?q=test&page=1' }),
      );
      expect(key).toBe('GET example.com/search?q=test&page=1');
    });

    it('preserves hash fragments', () => {
      const key = generator.generateCacheKey(
        make({ originalUrl: '/page#section', url: '/page#section' }),
      );
      expect(key).toBe('GET example.com/page#section');
    });

    it('handles complex URLs without lower-casing the path', () => {
      const key = generator.generateCacheKey(
        make({
          hostname: 'API.example.com',
          originalUrl: '/v1/Users/123/posts?sort=date',
          url: '/v1/Users/123/posts?sort=date',
        }),
      );
      expect(key).toBe('GET api.example.com/v1/Users/123/posts?sort=date');
    });

    it('produces distinct keys for different methods on the same URL', () => {
      const get = generator.generateCacheKey(make({ method: 'GET' }));
      const post = generator.generateCacheKey(make({ method: 'POST' }));
      expect(get).not.toBe(post);
    });

    it('uppercases the method for consistency', () => {
      const key = generator.generateCacheKey(
        make({ method: 'get' } as unknown as Partial<Request>),
      );
      expect(key).toBe('GET example.com/products/123');
    });

    it('defaults to GET when method is missing', () => {
      const key = generator.generateCacheKey(
        make({ method: undefined } as unknown as Partial<Request>),
      );
      expect(key).toBe('GET example.com/products/123');
    });
  });
});
