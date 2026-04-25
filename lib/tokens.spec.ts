import { describe, expect, it } from 'vitest';
import { ANGULAR_SSR_OPTIONS } from './tokens';

describe('Tokens', () => {
  describe('ANGULAR_SSR_OPTIONS', () => {
    it('is a unique symbol', () => {
      expect(typeof ANGULAR_SSR_OPTIONS).toBe('symbol');
    });

    it('has a descriptive symbol name', () => {
      expect(ANGULAR_SSR_OPTIONS.toString()).toBe('Symbol(ANGULAR_SSR_OPTIONS)');
    });
  });
});
