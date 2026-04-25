import type { AngularSSRModuleOptions } from './interfaces';

/**
 * Internal injection token for module options.
 *
 * For per-render request / response access in Angular components, use
 * `@angular/core`'s `REQUEST` and `REQUEST_CONTEXT` tokens (re-exported from
 * the package entry for convenience). The library wires both tokens for
 * every engine path.
 */
export const ANGULAR_SSR_OPTIONS = Symbol('ANGULAR_SSR_OPTIONS');

/**
 * Provider type for module options
 */
export interface AngularSSROptionsProvider {
  provide: typeof ANGULAR_SSR_OPTIONS;
  useValue: AngularSSRModuleOptions;
}
