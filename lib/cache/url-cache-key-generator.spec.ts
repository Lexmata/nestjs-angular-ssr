import { describe, expect, it } from 'vitest';
import { UrlCacheKeyGenerator } from './url-cache-key-generator';
import type { Request } from 'express';

describe('UrlCacheKeyGenerator', () => {
  let generator: UrlCacheKeyGenerator;

  beforeEach(() => {
    generator = new UrlCacheKeyGenerator();
  });

  describe('generateCacheKey()', () => {
    it('should generate key from hostname and originalUrl', () => {
      const request = {
        hostname: 'example.com',
        originalUrl: '/products/123',
        url: '/products/123',
      } as Request;

      const key = generator.generateCacheKey(request);

      expect(key).toBe('example.com/products/123');
    });

    it('should convert key to lowercase', () => {
      const request = {
        hostname: 'Example.COM',
        originalUrl: '/Products/ABC',
        url: '/Products/ABC',
      } as Request;

      const key = generator.generateCacheKey(request);

      expect(key).toBe('example.com/products/abc');
    });

    it('should use default hostname when not provided', () => {
      const request = {
        hostname: undefined,
        originalUrl: '/page',
        url: '/page',
      } as unknown as Request;

      const key = generator.generateCacheKey(request);

      expect(key).toBe('localhost/page');
    });

    it('should fallback to url when originalUrl is not provided', () => {
      const request = {
        hostname: 'example.com',
        originalUrl: undefined,
        url: '/fallback-page',
      } as unknown as Request;

      const key = generator.generateCacheKey(request);

      expect(key).toBe('example.com/fallback-page');
    });

    it('should use root path when neither originalUrl nor url is provided', () => {
      const request = {
        hostname: 'example.com',
        originalUrl: undefined,
        url: undefined,
      } as unknown as Request;

      const key = generator.generateCacheKey(request);

      expect(key).toBe('example.com/');
    });

    it('should handle query strings', () => {
      const request = {
        hostname: 'example.com',
        originalUrl: '/search?q=test&page=1',
        url: '/search?q=test&page=1',
      } as Request;

      const key = generator.generateCacheKey(request);

      expect(key).toBe('example.com/search?q=test&page=1');
    });

    it('should handle hash fragments', () => {
      const request = {
        hostname: 'example.com',
        originalUrl: '/page#section',
        url: '/page#section',
      } as Request;

      const key = generator.generateCacheKey(request);

      expect(key).toBe('example.com/page#section');
    });

    it('should handle complex URLs', () => {
      const request = {
        hostname: 'api.example.com',
        originalUrl: '/v1/users/123/posts?sort=date&order=desc',
        url: '/v1/users/123/posts?sort=date&order=desc',
      } as Request;

      const key = generator.generateCacheKey(request);

      expect(key).toBe('api.example.com/v1/users/123/posts?sort=date&order=desc');
    });
  });
});
