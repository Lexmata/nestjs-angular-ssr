import type { AngularSSRModuleOptions } from './interfaces';

/**
 * Injection token for Express Request object
 * Use with @Inject(REQUEST) in your Angular components (server-side only)
 *
 * This is a string token that can be used with both NestJS and Angular DI systems.
 */
export const REQUEST = 'ANGULAR_SSR_REQUEST';

/**
 * Injection token for Express Response object
 * Use with @Inject(RESPONSE) in your Angular components (server-side only)
 *
 * This is a string token that can be used with both NestJS and Angular DI systems.
 */
export const RESPONSE = 'ANGULAR_SSR_RESPONSE';

/**
 * Internal injection token for module options
 */
export const ANGULAR_SSR_OPTIONS = Symbol('ANGULAR_SSR_OPTIONS');

/**
 * Provider type for module options
 */
export interface AngularSSROptionsProvider {
  provide: typeof ANGULAR_SSR_OPTIONS;
  useValue: AngularSSRModuleOptions;
}
