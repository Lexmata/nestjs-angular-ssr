/**
 * End-to-end test that boots a real NestJS application with the SSR module
 * mounted, then issues real HTTP requests through Express. Exists to catch
 * regressions that mocked unit tests cannot — most importantly, that the
 * wildcard route default (`'{/*splat}'`) is actually accepted by the real
 * path-to-regexp matcher inside NestJS, not just by a mocked
 * `MiddlewareConsumer`.
 */

import { AngularAppEngine } from '@angular/ssr';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AngularSSRModule } from './angular-ssr.module';
import { AngularSSRService } from './angular-ssr.service';
import type { INestApplication } from '@nestjs/common';
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
