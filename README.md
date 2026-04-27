# @lexmata/nestjs-angular-ssr

<p align="center">
  <img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" />
  <span style="font-size: 48px; margin: 0 20px;">+</span>
  <img src="https://angular.io/assets/images/logos/angular/angular.svg" width="120" alt="Angular Logo" />
</p>

<p align="center">
  Angular SSR (v19+) module for NestJS framework
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="https://github.com/Lexmata/nestjs-angular-ssr/actions/workflows/ci.yml"><img src="https://github.com/Lexmata/nestjs-angular-ssr/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@lexmata/nestjs-angular-ssr"><img src="https://img.shields.io/npm/v/@lexmata/nestjs-angular-ssr.svg" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@lexmata/nestjs-angular-ssr"><img src="https://img.shields.io/npm/dm/@lexmata/nestjs-angular-ssr.svg" alt="npm downloads" /></a>
</p>

## Description

A NestJS module that integrates Angular SSR (Server-Side Rendering) for Angular v19+ applications. This module provides a seamless way to serve Angular applications with server-side rendering through a NestJS backend, similar to how `@nestjs/ng-universal` worked for older Angular Universal versions.

## Features

- 🚀 **Angular v19+ Support** - Built for the modern Angular SSR API
- 📦 **Easy Integration** - Simple `forRoot()` and `forRootAsync()` configuration
- 💾 **Built-in Caching** - Configurable response caching with pluggable storage
- 🔌 **Request/Response Injection** - Access Express request/response in Angular components
- ⚡ **Performance** - Static file serving with caching headers
- 🛠️ **Customizable** - Custom error handlers, cache key generators, and more

## Installation

```bash
pnpm add @lexmata/nestjs-angular-ssr

# or with npm
npm install @lexmata/nestjs-angular-ssr

# or with yarn
yarn add @lexmata/nestjs-angular-ssr
```

## Prerequisites

- Node.js >= 20.0.0
- NestJS >= 11.0.0 (Express 5 / path-to-regexp v8)
- Angular >= 19.0.0 with SSR configured

## Usage

### Basic Setup

Import `AngularSSRModule` in your NestJS application module:

```typescript
import { Module } from '@nestjs/common';
import { join } from 'path';
import { AngularSSRModule } from '@lexmata/nestjs-angular-ssr';

// Import the bootstrap function from your Angular SSR server entry
import bootstrap from './path-to-angular/server/main.server';

@Module({
  imports: [
    AngularSSRModule.forRoot({
      browserDistFolder: join(process.cwd(), 'dist/my-app/browser'),
      bootstrap: () => bootstrap(),
    }),
  ],
})
export class AppModule {}
```

### Async Configuration

For more complex setups where you need to inject dependencies:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AngularSSRModule } from '@lexmata/nestjs-angular-ssr';

@Module({
  imports: [
    ConfigModule.forRoot(),
    AngularSSRModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        browserDistFolder: configService.get('BROWSER_DIST_FOLDER'),
        bootstrap: async () => {
          const { default: bootstrap } = await import('./angular/server/main.server');
          return bootstrap();
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

## Full Example

Here's a complete example showing how to integrate Angular SSR with a NestJS application.

### Project Structure

```
my-app/
├── src/
│   ├── app/                      # NestJS application
│   │   ├── app.module.ts
│   │   ├── app.controller.ts
│   │   └── api/                  # Your API modules
│   │       └── users/
│   │           ├── users.module.ts
│   │           └── users.controller.ts
│   └── main.ts                   # NestJS entry point
├── angular/                      # Angular application
│   ├── src/
│   │   ├── app/
│   │   ├── main.ts
│   │   └── main.server.ts
│   └── angular.json
├── dist/
│   └── angular/
│       ├── browser/              # Angular browser build
│       └── server/
│           └── server.mjs        # Angular SSR server bundle
└── package.json
```

### Angular Server Entry Point

Your Angular application needs to export the `AngularAppEngine`. With Angular v19+, your `angular/server.ts` should look like:

```typescript
// angular/server.ts
import { AngularAppEngine, createRequestHandler } from '@angular/ssr';
import { AppServerModule } from './src/main.server';

const angularApp = new AngularAppEngine();

export default angularApp;
```

### NestJS Main Entry Point

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix for API routes (optional)
  app.setGlobalPrefix('api', {
    exclude: ['/'], // Exclude root for Angular SSR
  });

  await app.listen(4000);
  console.log('Application is running on: http://localhost:4000');
}

bootstrap();
```

### NestJS App Module

```typescript
// src/app/app.module.ts
import { Module } from '@nestjs/common';
import { join } from 'path';
import { AngularSSRModule } from '@lexmata/nestjs-angular-ssr';
import { UsersModule } from './api/users/users.module';

// Dynamic import for the Angular SSR engine
const angularBootstrap = async () => {
  const { default: angularApp } = await import('../../dist/angular/server/server.mjs');
  return angularApp;
};

@Module({
  imports: [
    // Your API modules
    UsersModule,

    // Angular SSR module - should be imported LAST
    AngularSSRModule.forRoot({
      browserDistFolder: join(process.cwd(), 'dist/angular/browser'),
      bootstrap: angularBootstrap,
      // Optional: customize render paths
      renderPath: '*',
      // Optional: configure caching
      cache: {
        expiresIn: 60000, // 1 minute
      },
    }),
  ],
})
export class AppModule {}
```

### API Controller Example

```typescript
// src/app/api/users/users.controller.ts
import { Controller, Get, Param } from '@nestjs/common';

@Controller('users')
export class UsersController {
  @Get()
  findAll() {
    return [
      { id: 1, name: 'John Doe' },
      { id: 2, name: 'Jane Doe' },
    ];
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return { id: Number(id), name: 'John Doe' };
  }
}
```

### Complete App Module with All Features

```typescript
// src/app/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { AngularSSRModule, InMemoryCacheStorage } from '@lexmata/nestjs-angular-ssr';
import { UsersModule } from './api/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    UsersModule,

    // Angular SSR with async configuration
    AngularSSRModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        // Dynamic import of Angular SSR engine
        const { default: angularApp } = await import('../../dist/angular/server/server.mjs');

        return {
          browserDistFolder: join(process.cwd(), 'dist/angular/browser'),
          bootstrap: async () => angularApp,

          // Cache configuration
          cache: {
            expiresIn: configService.get('SSR_CACHE_TTL', 60000),
            storage: new InMemoryCacheStorage(),
          },

          // Custom error handler
          errorHandler: (error, req, res) => {
            console.error('SSR Error:', error.message);
            res.status(500).send(`
              <!DOCTYPE html>
              <html>
                <head><title>Error</title></head>
                <body>
                  <h1>Something went wrong</h1>
                  <p>Please try again later.</p>
                </body>
              </html>
            `);
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### Build Scripts (package.json)

```json
{
  "scripts": {
    "build": "npm run build:angular && npm run build:nest",
    "build:angular": "ng build && ng run my-app:server",
    "build:nest": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main.js"
  }
}
```

### Environment Configuration

```bash
# .env
SSR_CACHE_TTL=60000
NODE_ENV=production
```

## API Reference

### `forRoot()` Options

| Property            | Type                               | Default                                 | Description                                                                                                 |
| ------------------- | ---------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `browserDistFolder` | `string`                           | **required**                            | Path to the Angular browser build directory                                                                 |
| `bootstrap`         | `() => Promise<AngularAppEngine>`  | **required**                            | Function that returns the Angular SSR engine                                                                |
| `serverDistFolder`  | `string?`                          | -                                       | Path to the server bundle directory                                                                         |
| `indexHtml`         | `string?`                          | `{browserDistFolder}/index.server.html` | Path to the index.html template                                                                             |
| `engineType`        | `'common' \| 'node-app' \| 'app'?` | -                                       | Explicit engine override; bypasses runtime detection (recommended for minified builds)                      |
| `renderPath`        | `string \| string[]?`              | `'{/*splat}'`                           | Route path(s) to render the Angular app — see [Wildcard routes](#wildcard-routes)                           |
| `rootStaticPath`    | `string?`                          | `'{/*splat}'`                           | Path pattern for serving static files — see [Wildcard routes](#wildcard-routes)                             |
| `skipPaths`         | `(string \| RegExp)[]?`            | `['/api']`                              | Paths the SSR middleware passes through to `next()` (e.g. API prefixes)                                     |
| `extraProviders`    | `StaticProvider[]?`                | -                                       | Additional providers — applied to `CommonEngine` only                                                       |
| `inlineCriticalCss` | `boolean?`                         | `true`                                  | Inline critical CSS — applied to `CommonEngine` only                                                        |
| `cache`             | `boolean \| CacheOptions?`         | `true`                                  | Cache configuration (only `GET`/`HEAD` cached)                                                              |
| `errorHandler`      | `ErrorHandler?`                    | -                                       | Custom error handler function                                                                               |
| `afterRender`       | `AfterRenderTransform[]?`          | `[]`                                    | Post-render HTML transform pipeline — see [Post-render transform pipeline](#post-render-transform-pipeline) |

### Wildcard routes

The defaults use NestJS 11 / Express 5 / path-to-regexp v8 splat syntax: `'{/*splat}'`. The braces make the splat optional so the pattern matches both root `/` and every nested path. If you only need to mount under a sub-path, override with something like `'/app/*splat'`.

### Cache Options

| Property       | Type                 | Default                | Description                         |
| -------------- | -------------------- | ---------------------- | ----------------------------------- |
| `expiresIn`    | `number?`            | `60000`                | Cache expiration in milliseconds    |
| `storage`      | `CacheStorage?`      | `InMemoryCacheStorage` | Custom cache storage implementation |
| `keyGenerator` | `CacheKeyGenerator?` | `UrlCacheKeyGenerator` | Custom cache key generator          |

## Request and Response Injection

This module wires the same Angular DI tokens that `AngularAppEngine` and `AngularNodeAppEngine` expose natively, so every engine path (including `CommonEngine`) lets you reach the Express `Request` and `Response` from inside Angular components.

- `REQUEST` — a Web Fetch `Request` built from the incoming Express request (URL, method, headers).
- `REQUEST_CONTEXT` — a plain object `{ request, response }` carrying the raw Express objects for direct access (e.g. to set a status code).

Both tokens come from `@angular/core` and are re-exported from this package so consumers don't need a separate Angular import in their NestJS module wiring. The library ships an `SSRRequestContext` type alias for `REQUEST_CONTEXT`.

```typescript
import { Component, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { REQUEST_CONTEXT } from '@lexmata/nestjs-angular-ssr';
import type { SSRRequestContext } from '@lexmata/nestjs-angular-ssr';

@Component({
  selector: 'app-not-found',
  template: '<h1>404 - Page Not Found</h1>',
})
export class NotFoundComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ctx = inject<SSRRequestContext | null>(REQUEST_CONTEXT, { optional: true });

  constructor() {
    if (isPlatformServer(this.platformId) && this.ctx) {
      this.ctx.response.status(404);
    }
  }
}
```

## Debug Logging

Set the `ANGULAR_SSR_DEBUG` environment variable to enable verbose tracing across the module, service, and middleware. Warnings and errors are always emitted; only `log` / `debug` / `verbose` levels are gated.

```bash
# Enable everything
ANGULAR_SSR_DEBUG=1 node dist/main.js

# Enable only specific contexts (case-insensitive, comma-separated)
ANGULAR_SSR_DEBUG=AngularSSRMiddleware,AngularSSRService node dist/main.js
```

Accepted "enable all" values: `1`, `true`, `yes`, `on`, `all`, `*`. The flag is re-read on every log call, so you can toggle it at runtime by mutating `process.env` from a maintenance endpoint or a debug tool — no restart required.

You can also branch on the flag yourself when constructing an expensive log message:

```typescript
import { isDebugEnabled } from '@lexmata/nestjs-angular-ssr';

if (isDebugEnabled('AngularSSRService')) {
  // build a heavy debug payload
}
```

The exported `DebugLogger` class can be reused in your own SSR-related code if you want a logger that obeys the same flag.

## Using `@nestjs/cache-manager` as the cache backend

If the host app already wires `CacheModule` from `@nestjs/cache-manager` (for Redis, memcached, multi-store setups, or just to get the metrics/tracing the default in-memory store lacks), the library ships a `NestCacheStorage` adapter that plugs the `Cache` service straight into `CacheOptions.storage`:

```typescript
import { Module } from '@nestjs/common';
import { Cache, CacheModule } from '@nestjs/cache-manager';
import { AngularSSRModule, NestCacheStorage } from '@lexmata/nestjs-angular-ssr';

@Module({
  imports: [
    CacheModule.register({ ttl: 60_000, isGlobal: true }),
    AngularSSRModule.forRootAsync({
      inject: [Cache],
      useFactory: (cache: Cache) => ({
        browserDistFolder: '...',
        bootstrap: () => getAngularAppEngine(),
        cache: { storage: new NestCacheStorage(cache) },
      }),
    }),
  ],
})
export class AppModule {}
```

`@nestjs/cache-manager` and `cache-manager` are declared as **optional** peer dependencies — install them only if you use `NestCacheStorage`. TTL is delegated to cache-manager (so `CacheModule.ttl` wins); the service's `cache.expiresIn` is still forwarded as the per-entry TTL so both stay in sync.

## Post-render transform pipeline

`options.afterRender` is an ordered list of functions that rewrite the HTML emitted by the Angular engine before it's cached or sent. Each transform sees the output of the previous one, can be sync or async, and receives an `AfterRenderContext` with the Express request, response, and full URL.

Use cases: injecting a CSP nonce, adding tracking tags, minifying, rewriting asset paths, embedding request-id headers in meta tags.

### Example: CSP nonce

A classic use of the pipeline is stamping a per-request nonce on every `<script>` / `<style>` tag so your CSP header can enforce `script-src 'nonce-...'`. Because nonces MUST be unique per response, this example disables caching for nonce-bearing routes.

```typescript
import { randomBytes } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { AfterRenderTransform } from '@lexmata/nestjs-angular-ssr';
import { AngularSSRModule } from '@lexmata/nestjs-angular-ssr';

const cspNonce: AfterRenderTransform = (html, { response }) => {
  const nonce = randomBytes(16).toString('base64url');
  response.setHeader(
    'Content-Security-Policy',
    `script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'`,
  );
  // Single pass, alternation over both tags. The negative lookahead skips
  // tags that already carry a nonce (avoids duplicating the attribute if
  // another transform stamped one earlier in the pipeline).
  return html.replace(/<(script|style)(?![^>]*\snonce=)/g, `<$1 nonce="${nonce}"`);
};

@Module({
  imports: [
    AngularSSRModule.forRoot({
      browserDistFolder: '...',
      bootstrap: () => getAngularAppEngine(),
      afterRender: [cspNonce],
      cache: false, // nonces must be per-request; don't cache stale ones
    }),
  ],
})
export class AppModule {}
```

### Ordering and caching

Transforms run **before** the cache write, so cached HTML reflects the whole pipeline. That's the right default for transforms that produce stable output (minification, path rewrites, static tracking tags). For per-request output like nonces or user-specific content:

- Disable caching entirely (`cache: false`), or
- Scope the caching to routes that don't need per-request transforms via `skipPaths`, or
- Write a placeholder into the HTML and replace it via a response header / cookie rather than inlining the value.

If any transform throws:

1. No further transforms run.
2. Any headers set by earlier transforms during this pipeline run are reverted — so if transform #1 set `Content-Security-Policy` and transform #2 threw, the error page doesn't inherit a nonce that was never applied. Headers already on the response before the pipeline started (cookies from upstream middleware, `X-Powered-By`, etc.) are preserved. Headers are not restored if they've already been flushed to the wire.
3. The configured `errorHandler` is invoked; if no handler is set, the error propagates out of `AngularSSRService.render()` and is forwarded to `next(error)` by the middleware layer.

## Custom Cache Storage

Implement the `CacheStorage` interface for custom caching solutions (e.g., Redis):

```typescript
import { CacheStorage, CacheEntry } from '@lexmata/nestjs-angular-ssr';

export class RedisCacheStorage implements CacheStorage {
  constructor(private redis: RedisClient) {}

  async get(key: string): Promise<CacheEntry | undefined> {
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : undefined;
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    await this.redis.set(key, JSON.stringify(entry));
  }

  async delete(key: string): Promise<boolean> {
    return (await this.redis.del(key)) > 0;
  }

  async clear(): Promise<void> {
    await this.redis.flushdb();
  }

  async has(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) > 0;
  }
}
```

## Custom Cache Key Generator

Create custom cache keys based on request properties:

```typescript
import { Request } from 'express';
import { CacheKeyGenerator } from '@lexmata/nestjs-angular-ssr';

export class MobileAwareCacheKeyGenerator implements CacheKeyGenerator {
  generateCacheKey(request: Request): string {
    const userAgent = request.headers['user-agent'] || '';
    const isMobile = /mobile/i.test(userAgent) ? 'mobile' : 'desktop';
    const url = request.hostname + request.originalUrl;
    return `${url}:${isMobile}`.toLowerCase();
  }
}
```

## AngularSSRService API

The `AngularSSRService` can be injected to programmatically manage SSR:

```typescript
import { Injectable } from '@nestjs/common';
import { AngularSSRService } from '@lexmata/nestjs-angular-ssr';

@Injectable()
export class CacheManagementService {
  constructor(private readonly ssrService: AngularSSRService) {}

  async clearAllCache(): Promise<void> {
    await this.ssrService.clearCache();
  }

  async invalidatePage(cacheKey: string): Promise<boolean> {
    return this.ssrService.invalidateCache(cacheKey);
  }
}
```

## Angular Project Setup

Ensure your Angular project is configured for SSR. With Angular v19+:

```bash
ng add @angular/ssr
```

Your Angular project should have a server entry point that exports the Angular app engine bootstrap function.

## Project Structure

```
nestjs-angular-ssr/
├── lib/
│   ├── index.ts                          # Public API re-exports
│   ├── tokens.ts                         # ANGULAR_SSR_OPTIONS internal token
│   ├── angular-ssr.module.ts             # NestJS dynamic module (forRoot / forRootAsync)
│   ├── angular-ssr.service.ts            # SSR rendering + cache management
│   ├── angular-ssr.middleware.ts         # Express middleware for SSR + static files
│   ├── debug-logger.ts                   # ANGULAR_SSR_DEBUG env-gated logger
│   ├── interfaces/
│   │   ├── angular-ssr-module-options.interface.ts
│   │   ├── cache-key-generator.interface.ts
│   │   └── cache-storage.interface.ts
│   └── cache/
│       ├── in-memory-cache-storage.ts    # Default LRU-bounded cache backend
│       └── url-cache-key-generator.ts    # Default cache key strategy
├── example/                              # Full working NestJS + Angular SSR example app
├── docs/                                 # GitHub Pages API docs
├── .github/
│   ├── CONTRIBUTING.md                   # Contributor guide
│   ├── SECURITY.md                       # Security policy
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── ISSUE_TEMPLATE/                   # Bug report + feature request templates
│   └── workflows/
│       ├── ci.yml                        # Lint, typecheck, test (Node 20/22/24), build
│       └── release.yml                   # Publish to npm + GitHub Packages on release
├── package.json
├── tsconfig.json
├── eslint.config.mjs
├── vitest.config.ts
└── commitlint.config.mjs
```

## Testing

```bash
pnpm test               # Run all tests once
pnpm test:watch          # Watch mode
pnpm test:coverage       # Coverage report (V8)
```

Tests are co-located with source files as `*.spec.ts` in `lib/`.

## Publishing

Publishing is automated via GitHub Actions. When a GitHub release is created:

1. The `release.yml` workflow runs tests and builds the package
2. Publishes to **npm** (`@lexmata/nestjs-angular-ssr`) using `NPM_TOKEN`
3. Publishes to **GitHub Packages** using `GITHUB_TOKEN`

To publish manually:

```bash
pnpm run clean && pnpm run build
pnpm publish --access public
```

## Related Repos

| Repo                     | Relationship                                                 |
| ------------------------ | ------------------------------------------------------------ |
| `lexmata-app-frontend`   | Consumer -- uses this module for Angular SSR in the main app |
| `lexmata-marketing`      | Consumer -- uses this module for the marketing site SSR      |
| `lexmata-admin-frontend` | Consumer -- uses this module for the admin panel SSR         |

## Contributing

We welcome contributions! Please see our [Contributing Guide](.github/CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

## Releasing

Releases are published manually. There is no CI publish workflow — maintain `npm publish` as the actual step after cutting a tag:

```bash
git fetch --tags
git checkout vX.Y.Z             # tag must already exist on main
pnpm install --frozen-lockfile
pnpm test
pnpm build
npm publish --access public     # requires `npm login` to the @lexmata scope
```

The maintainer who cuts the GitHub Release is responsible for the `npm publish` that follows.

## Support

- [Documentation](https://github.com/Lexmata/nestjs-angular-ssr#readme)
- [Issue Tracker](https://github.com/Lexmata/nestjs-angular-ssr/issues)
- [Discussions](https://github.com/Lexmata/nestjs-angular-ssr/discussions)

## License

MIT License - Copyright (c) 2025 Lexmata LLC

See [LICENSE](LICENSE) for details.
