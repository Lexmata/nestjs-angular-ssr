#!/usr/bin/env node
/**
 * Rewrites extensionless relative imports in `dist/esm/**` to add `.js`.
 *
 * TypeScript's `module: ES2022` output uses extensionless relative
 * specifiers — `import x from './foo'`. Node 20+ ESM requires explicit
 * `.js` extensions on every relative import. Rather than force the source
 * to carry extensions (which creates friction with the CJS build and with
 * barrel-style `./interfaces` imports that resolve to `./interfaces/index`),
 * we post-process the emitted ESM output.
 *
 * Handles two cases per specifier:
 *   `./foo`           → `./foo.js`          (file)
 *   `./foo` with ENOENT as file but ENOENT/ENOTDIR matching `./foo.js`
 *                     → `./foo/index.js`    (directory barrel)
 *
 * Applies to both `.js` (emitted code) and `.d.ts` (emitted types) files.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const esmDir = resolve(__dirname, '..', 'dist', 'esm');

const RELATIVE_IMPORT_RE = /((?:from|import)\s+['"])(\.\.?\/[^'"]+?)(['"])/g;

// Only treat JS-family extensions as "already resolved". A specifier like
// `./foo.middleware` has a dot in it but is still extensionless from Node's
// perspective — tsc uses dotted filenames freely.
const KNOWN_EXTENSIONS = ['.js', '.mjs', '.cjs', '.json'];

function hasExtension(spec) {
  return KNOWN_EXTENSIONS.some((ext) => spec.endsWith(ext));
}

function resolveSpec(fromDir, spec) {
  if (hasExtension(spec)) return spec;
  const abs = resolve(fromDir, spec);
  // Prefer file-with-extension over directory barrel, matching Node's
  // module-resolution algorithm for CommonJS-era extensionless imports.
  if (existsSync(`${abs}.js`)) return `${spec}.js`;
  if (existsSync(`${abs}.d.ts`)) return `${spec}.js`;
  if (existsSync(abs) && statSync(abs).isDirectory()) {
    if (existsSync(join(abs, 'index.js'))) return `${spec}/index.js`;
    if (existsSync(join(abs, 'index.d.ts'))) return `${spec}/index.js`;
  }
  // Give up — leave specifier untouched rather than emit a broken path.
  return spec;
}

function rewriteFile(path) {
  const dir = dirname(path);
  const original = readFileSync(path, 'utf8');
  const out = original.replace(RELATIVE_IMPORT_RE, (_, pre, spec, post) => `${pre}${resolveSpec(dir, spec)}${post}`);
  if (out !== original) {
    writeFileSync(path, out);
    return true;
  }
  return false;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (entry.endsWith('.js') || entry.endsWith('.d.ts')) {
      yield full;
    }
  }
}

let touched = 0;
for (const file of walk(esmDir)) {
  if (rewriteFile(file)) touched += 1;
}
console.log(`rewrote ${touched} file(s) under ${esmDir}`);
