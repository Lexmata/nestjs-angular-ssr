#!/usr/bin/env node
/**
 * Copies the schematic collection/schema JSON files into dist/schematics.
 * tsc only emits compiled `.ts` -> `.js`; these two files are consumed
 * as-is by the @angular-devkit/schematics engine at runtime.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const files = ['schematics/collection.json', 'schematics/ng-add/schema.json'];

for (const relPath of files) {
  const src = resolve(root, relPath);
  const dest = resolve(root, 'dist', relPath);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`copied ${relPath} -> dist/${relPath}`);
}
