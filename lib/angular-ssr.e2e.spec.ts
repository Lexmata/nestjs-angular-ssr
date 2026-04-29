/**
 * End-to-end test that boots a real NestJS application with the SSR module
 * mounted, then issues real HTTP requests through Express. Exists to catch
 * regressions that mocked unit tests cannot — most importantly, that the
 * wildcard route default (`'{/*splat}'`) is actually accepted by the real
 * path-to-regexp matcher inside NestJS, not just by a mocked
 * `MiddlewareConsumer`.
 */

import { AngularAppEngine } from '@angular/ssr';
import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AngularSSRModule } from './angular-ssr.module';
import { AngularSSRService } from './angular-ssr.service';
import type {
  INestApplication,
  MiddlewareConsumer,
  NestMiddleware,
  NestModule,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AddressInfo } from 'node:net';

const buildStubEngine = (): AngularAppEngine => {
  const engine = Object.create(AngularAppEngine.prototype) as AngularAppEngine & {
    handle: ReturnType<typeof vi.fn>;
  };
  engine.handle = vi.fn().mockResolvedValue({
    text: () => Promise.resolve('<html><body>e2e ok</body></html>'),
  });
  return engine;
};

@Module({
  imports: [
    AngularSSRModule.forRoot({
      browserDistFolder: '/tmp/never-read-during-tests',
      bootstrap: () => Promise.resolve(buildStubEngine()),
    }),
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- token class for Nest module decorator
class E2EAppModule {}

describe('AngularSSRModule (e2e wildcard routing)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(E2EAppModule, { logger: ['error', 'warn'] });
    await app.listen(0);
    const server = app.getHttpServer() as { address: () => AddressInfo };
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${String(port)}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('mounts middleware on the splat default and serves a GET / through SSR', async () => {
    const res = await fetch(`${baseUrl}/`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(body).toContain('e2e ok');
  });

  it('serves nested routes through the same wildcard', async () => {
    const res = await fetch(`${baseUrl}/products/123/details`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('e2e ok');
  });

  it('skips the default /api prefix without invoking SSR', async () => {
    // Without an /api controller, Nest returns 404. The point is that the
    // SSR middleware must not have intercepted the request — if it had, we
    // would see the e2e ok HTML body instead.
    const res = await fetch(`${baseUrl}/api/missing`);
    const body = await res.text();
    expect(body).not.toContain('e2e ok');
  });

  it('exposes AngularSSRService for runtime cache management', () => {
    const service = app.get(AngularSSRService);
    expect(service).toBeInstanceOf(AngularSSRService);
  });
});

/**
 * Second e2e harness that boots with a real `browserDistFolder` populated
 * with static files. Catches the regression where mounting
 * `express.static` via `forRoutes('{/*splat}')` caused Express to issue
 * a 301 redirect to `/favicon.ico/` instead of serving the file (LM-106).
 */
describe('AngularSSRModule (static asset serving)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let tmpDir: string;

  beforeAll(async () => {
    const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    tmpDir = mkdtempSync(join(tmpdir(), 'ssr-e2e-static-'));
    writeFileSync(join(tmpDir, 'favicon.ico'), 'ICO-DATA');
    mkdirSync(join(tmpDir, 'images'));
    writeFileSync(join(tmpDir, 'images', 'logo.png'), 'PNG-DATA');

    @Module({
      imports: [
        AngularSSRModule.forRoot({
          browserDistFolder: tmpDir,
          bootstrap: () => Promise.resolve(buildStubEngine()),
        }),
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- nest module token
    class StaticE2EModule {}

    app = await NestFactory.create(StaticE2EModule, { logger: ['error', 'warn'] });
    await app.listen(0);
    const server = app.getHttpServer() as { address: () => AddressInfo };
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${String(port)}`;
  });

  afterAll(async () => {
    await app.close();
    const { rmSync } = await import('node:fs');
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('serves root-level static files (favicon.ico) with a 200', async () => {
    const res = await fetch(`${baseUrl}/favicon.ico`, { redirect: 'manual' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ICO-DATA');
  });

  it('serves nested static files (images/logo.png) with a 200', async () => {
    const res = await fetch(`${baseUrl}/images/logo.png`, { redirect: 'manual' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('PNG-DATA');
  });

  it('does not 301-redirect static file requests to a trailing-slash path', async () => {
    // Regression guard for LM-106: when the static middleware was mounted
    // via `forRoutes('{/*splat}')`, Express issued a 301 to
    // `/favicon.ico/` instead of serving the file.
    const res = await fetch(`${baseUrl}/favicon.ico`, { redirect: 'manual' });
    expect(res.status).not.toBe(301);
    expect(res.headers.get('location')).toBeNull();
  });
});

/**
 * Third harness: mirrors how consumers actually bootstrap NestJS —
 * `NestFactory.create(AppModule, new ExpressAdapter(expressApp))` with an
 * explicit Express 5 app passed in. LM-106 regressed on Express 5 because
 * `forRoutes('/')` is exact-match under path-to-regexp v8 (unlike Express
 * 4), so static middleware mounted via the library's default `'/'` path
 * only matched the root. This harness locks in the fix for that
 * configuration.
 */
describe('AngularSSRModule (static assets via ExpressAdapter)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let tmpDir: string;

  beforeAll(async () => {
    const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    tmpDir = mkdtempSync(join(tmpdir(), 'ssr-e2e-adapter-'));
    writeFileSync(join(tmpDir, 'favicon.ico'), 'ICO-DATA');
    mkdirSync(join(tmpDir, 'images'));
    writeFileSync(join(tmpDir, 'images', 'logo.png'), 'PNG-DATA');

    @Module({
      imports: [
        AngularSSRModule.forRoot({
          browserDistFolder: tmpDir,
          bootstrap: () => Promise.resolve(buildStubEngine()),
        }),
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- nest module token
    class AdapterE2EModule {}

    const expressApp = express();
    app = await NestFactory.create(AdapterE2EModule, new ExpressAdapter(expressApp), {
      logger: ['error', 'warn'],
    });
    await app.listen(0);
    const server = app.getHttpServer() as { address: () => AddressInfo };
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${String(port)}`;
  });

  afterAll(async () => {
    await app.close();
    const { rmSync } = await import('node:fs');
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('serves /favicon.ico with a 200 through ExpressAdapter', async () => {
    const res = await fetch(`${baseUrl}/favicon.ico`, { redirect: 'manual' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ICO-DATA');
  });

  it('serves nested /images/logo.png with a 200 through ExpressAdapter', async () => {
    const res = await fetch(`${baseUrl}/images/logo.png`, { redirect: 'manual' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('PNG-DATA');
  });
});

/**
 * Fourth harness: reproduces the real-world consumer configuration where
 * a NestJS controller is registered alongside the SSR module. The
 * consumer's production bundle has `/api/*` controllers + GraphQL
 * routes. Under Express 5 / Nest 11, registering a controller causes the
 * library's `forRoutes('/')` static mount to no longer match nested
 * paths — the middleware layer is inserted into the Express router but
 * Nest's compiled path-to-regexp pattern for `'/'` only matches
 * `[/] EXACT`. This harness reproduces that and locks in the fix.
 */
describe('AngularSSRModule (static assets with sibling controllers)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let tmpDir: string;

  beforeAll(async () => {
    const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    tmpDir = mkdtempSync(join(tmpdir(), 'ssr-e2e-ctrl-'));
    writeFileSync(join(tmpDir, 'favicon.ico'), 'ICO-DATA');
    mkdirSync(join(tmpDir, 'images'));
    writeFileSync(join(tmpDir, 'images', 'logo.png'), 'PNG-DATA');

    @Controller('api')
    class HealthController {
      @Get('health')
      health(): { ok: boolean } {
        return { ok: true };
      }
    }

    @Module({
      imports: [
        AngularSSRModule.forRoot({
          browserDistFolder: tmpDir,
          bootstrap: () => Promise.resolve(buildStubEngine()),
        }),
      ],
      controllers: [HealthController],
    })
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- nest module token
    class CtrlE2EModule {}

    const expressApp = express();
    app = await NestFactory.create(CtrlE2EModule, new ExpressAdapter(expressApp), {
      logger: ['error', 'warn'],
    });
    await app.listen(0);
    const server = app.getHttpServer() as { address: () => AddressInfo };
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${String(port)}`;
  });

  afterAll(async () => {
    await app.close();
    const { rmSync } = await import('node:fs');
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('still serves /api/health through the controller', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('serves /favicon.ico when a controller is registered alongside', async () => {
    // LM-106 regression: this is the case that fails against the real
    // consumer. `forRoutes('/')` on the static middleware stops matching
    // nested paths once a controller is present in the module.
    const res = await fetch(`${baseUrl}/favicon.ico`, { redirect: 'manual' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ICO-DATA');
  });

  it('serves nested /images/logo.png when a controller is registered alongside', async () => {
    const res = await fetch(`${baseUrl}/images/logo.png`, { redirect: 'manual' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('PNG-DATA');
  });
});

/**
 * Fifth harness: full reproduction of the Lexmata marketing consumer —
 * ExpressAdapter + controllers + `AppModule.configure()` registering a
 * catch-all middleware alongside AngularSSRModule. This is the shape
 * that exhibits the LM-106 static-asset 404 in production.
 */
describe('AngularSSRModule (consumer-shape reproduction)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let tmpDir: string;

  beforeAll(async () => {
    const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    tmpDir = mkdtempSync(join(tmpdir(), 'ssr-e2e-consumer-'));
    writeFileSync(join(tmpDir, 'favicon.ico'), 'ICO-DATA');
    mkdirSync(join(tmpDir, 'images'));
    writeFileSync(join(tmpDir, 'images', 'logo.png'), 'PNG-DATA');

    @Injectable()
    class HeaderMiddleware implements NestMiddleware {
      use(_req: Request, res: Response, next: NextFunction): void {
        // Mirrors the consumer's CspMiddleware which sets headers and calls next().
        res.setHeader('X-Test-Middleware', 'active');
        next();
      }
    }

    @Controller('api')
    class HealthController {
      @Get('health')
      health(): { ok: boolean } {
        return { ok: true };
      }
    }

    @Module({
      imports: [
        AngularSSRModule.forRoot({
          browserDistFolder: tmpDir,
          bootstrap: () => Promise.resolve(buildStubEngine()),
        }),
      ],
      controllers: [HealthController],
      providers: [HeaderMiddleware],
    })
    class ConsumerShapeModule implements NestModule {
      configure(consumer: MiddlewareConsumer): void {
        // Exactly mirrors AppModule.configure() in the consumer.
        consumer.apply(HeaderMiddleware).forRoutes('*');
      }
    }

    const expressApp = express();
    app = await NestFactory.create(ConsumerShapeModule, new ExpressAdapter(expressApp), {
      logger: ['error', 'warn'],
    });
    await app.listen(0);
    const server = app.getHttpServer() as { address: () => AddressInfo };
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${String(port)}`;
  });

  afterAll(async () => {
    await app.close();
    const { rmSync } = await import('node:fs');
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('serves /favicon.ico with a 200 (LM-106 exact reproduction)', async () => {
    const res = await fetch(`${baseUrl}/favicon.ico`, { redirect: 'manual' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ICO-DATA');
  });

  it('serves nested /images/logo.png with a 200', async () => {
    const res = await fetch(`${baseUrl}/images/logo.png`, { redirect: 'manual' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('PNG-DATA');
  });
});
