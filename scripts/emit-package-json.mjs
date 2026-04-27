#!/usr/bin/env node
/**
 * Writes per-format `package.json` markers into dist/cjs and dist/esm.
 *
 * Node's ESM loader determines module type by walking up directories looking
 * for a package.json with a `type` field. Without these markers, every `.js`
 * file under `dist/` would inherit the root package's `type` (unset → CJS
 * everywhere), which breaks the ESM build. The standard dual-publish trick
 * is to drop a minimal `{"type": "module"}` next to the ESM output and
 * `{"type": "commonjs"}` next to the CJS output.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const targets = [
  { dir: resolve(root, 'dist/cjs'), type: 'commonjs' },
  { dir: resolve(root, 'dist/esm'), type: 'module' },
];

for (const { dir, type } of targets) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'package.json'), JSON.stringify({ type }, null, 2) + '\n');
  console.log(`wrote ${dir}/package.json (type: ${type})`);
}
