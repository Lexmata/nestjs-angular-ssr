import { posix } from 'node:path';
import { SchematicsException } from '@angular-devkit/schematics';
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';
import * as ts from 'typescript';
import type { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';

export interface NgAddOptions {
  module?: string;
  browserDistFolder?: string;
  serverBundle?: string;
}

const DEFAULT_MODULE = 'src/app/app.module.ts';
const DEFAULT_BROWSER_DIST_FOLDER = 'dist/browser';
const DEFAULT_SERVER_BUNDLE = 'dist/server/server.mjs';

// zone.js is intentionally absent: it's an optional peer (zoneless apps don't
// need it), same rationale as @nestjs/cache-manager. Consumers using zone-based
// change detection install it themselves.
const PEER_DEPENDENCIES: Record<string, string> = {
  '@angular/core': '>=19.0.0',
  '@angular/platform-server': '>=19.0.0',
  '@angular/ssr': '>=19.0.0',
  express: '>=4.18.0',
};

export function ngAdd(options: NgAddOptions): Rule {
  return (tree: Tree, context: SchematicContext) => {
    // Note: We detect user-supplied options by comparing against hardcoded defaults.
    // The schematics engine fills in schema defaults before the Rule runs, so we
    // cannot distinguish "user typed the default value" from "user accepted the prompt
    // default" when they happen to match. This is an inherent limitation of the
    // Angular schematics model and is accepted.
    const modulePath = normalizePath(
      options.module && options.module !== DEFAULT_MODULE
        ? options.module
        : resolveModuleDefault(tree, context),
    );
    assertNoTraversal(modulePath);

    if (!tree.exists(modulePath)) {
      throw new SchematicsException(
        `Could not find a NestJS module at "${modulePath}". Pass --module <path> pointing at the module AngularSSRModule should be wired into.`,
      );
    }

    const angularDefaults = resolveAngularDefaults(tree, context);
    const browserDistFolder =
      options.browserDistFolder && options.browserDistFolder !== DEFAULT_BROWSER_DIST_FOLDER
        ? options.browserDistFolder
        : angularDefaults.browserDistFolder;
    const serverBundle =
      options.serverBundle && options.serverBundle !== DEFAULT_SERVER_BUNDLE
        ? options.serverBundle
        : angularDefaults.serverBundle;

    // Config is placed one directory above the module's own directory (its
    // "grandparent"), matching <sourceRoot>/app/*.module.ts and
    // <sourceRoot>/*.module.ts conventions. A module nested more shallowly
    // than that will get its config placed higher up (e.g. at the tree
    // root) — this is a known, accepted trade-off, not a bug.
    const moduleDir = posix.dirname(modulePath);
    const configDir = posix.dirname(moduleDir);
    const configPath = posix.join(configDir, 'angular-ssr.config.ts');
    assertNoTraversal(configPath);

    if (!tree.exists(configPath)) {
      tree.create(configPath, buildConfigFileContent(browserDistFolder, serverBundle));
    }

    wireModuleImport(tree, modulePath, configPath);

    if (addMissingPeerDependencies(tree)) {
      context.addTask(new NodePackageInstallTask());
    }
  };
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function assertNoTraversal(path: string): void {
  if (path.split('/').includes('..')) {
    throw new SchematicsException(`Path "${path}" must not contain ".." segments.`);
  }
}

type JsonReadResult =
  | { status: 'ok'; value: Record<string, unknown> }
  | { status: 'missing' }
  | { status: 'malformed'; error: Error };

function readJsonFileResult(tree: Tree, path: string): JsonReadResult {
  const buffer = tree.read(path);
  if (!buffer) {
    return { status: 'missing' };
  }
  try {
    return { status: 'ok', value: JSON.parse(buffer.toString('utf8')) as Record<string, unknown> };
  } catch (error) {
    return { status: 'malformed', error: error as Error };
  }
}

function resolveModuleDefault(tree: Tree, context: SchematicContext): string {
  const result = readJsonFileResult(tree, '/nest-cli.json');
  if (result.status === 'missing') {
    return DEFAULT_MODULE;
  }
  if (result.status === 'malformed') {
    context.logger.warn(
      `Could not parse "/nest-cli.json": ${result.error.message}. Falling back to default module resolution; override with --module if needed.`,
    );
    return DEFAULT_MODULE;
  }
  const nestCli = result.value;
  const sourceRoot = typeof nestCli.sourceRoot === 'string' ? nestCli.sourceRoot : 'src';
  const candidates = [`${sourceRoot}/app.module.ts`, `${sourceRoot}/app/app.module.ts`];
  for (const candidate of candidates) {
    if (tree.exists(normalizePath(candidate))) {
      return candidate;
    }
  }
  return DEFAULT_MODULE;
}

function normalizeOutputPath(outputPath: unknown): string | null {
  if (typeof outputPath === 'string') {
    return outputPath;
  }
  if (
    outputPath !== null &&
    typeof outputPath === 'object' &&
    typeof (outputPath as { base?: unknown }).base === 'string'
  ) {
    return (outputPath as { base: string }).base;
  }
  return null;
}

function resolveAngularDefaults(
  tree: Tree,
  context: SchematicContext,
): { browserDistFolder: string; serverBundle: string } {
  const fallback = {
    browserDistFolder: DEFAULT_BROWSER_DIST_FOLDER,
    serverBundle: DEFAULT_SERVER_BUNDLE,
  };
  const result = readJsonFileResult(tree, '/angular.json');
  if (result.status === 'missing') {
    return fallback;
  }
  if (result.status === 'malformed') {
    context.logger.warn(
      `Could not parse "/angular.json": ${result.error.message}. Falling back to default browserDistFolder/serverBundle; override with --browser-dist-folder/--server-bundle if needed.`,
    );
    return fallback;
  }
  const angularJson = result.value;
  if (typeof angularJson.projects !== 'object' || angularJson.projects === null) {
    return fallback;
  }
  const projects = angularJson.projects as Record<string, unknown>;
  const projectName =
    typeof angularJson.defaultProject === 'string'
      ? angularJson.defaultProject
      : Object.keys(projects)[0];
  const project = projectName
    ? (projects[projectName] as Record<string, unknown> | undefined)
    : undefined;
  const architect = project?.architect as Record<string, unknown> | undefined;
  const build = architect?.build as Record<string, unknown> | undefined;
  const buildOptions = build?.options as Record<string, unknown> | undefined;
  const outputPath = normalizeOutputPath(buildOptions?.outputPath);
  if (!outputPath) {
    return fallback;
  }
  return {
    browserDistFolder: `${outputPath}/browser`,
    serverBundle: `${outputPath}/server/server.mjs`,
  };
}

function buildConfigFileContent(browserDistFolder: string, serverBundle: string): string {
  return `import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AngularSSRModuleOptions } from '@lexmata/nestjs-angular-ssr';

export const angularSsrOptions: AngularSSRModuleOptions = {
  browserDistFolder: join(process.cwd(), ${JSON.stringify(browserDistFolder)}),
  bootstrap: async () => {
    const { default: angularApp } = await import(pathToFileURL(join(process.cwd(), ${JSON.stringify(serverBundle)})).href);
    return angularApp;
  },
};
`;
}

function toImportSpecifier(fromModulePath: string, toConfigPath: string): string {
  const fromDir = posix.dirname(fromModulePath);
  const rel = posix.relative(fromDir, toConfigPath).replace(/\.ts$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

function findNestModuleDecoratorObject(
  source: ts.SourceFile,
  modulePath: string,
): ts.ObjectLiteralExpression {
  for (const statement of source.statements) {
    if (!ts.isClassDeclaration(statement) || !ts.canHaveDecorators(statement)) {
      continue;
    }
    for (const decorator of ts.getDecorators(statement) ?? []) {
      const expression = decorator.expression;
      if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) {
        continue;
      }
      if (expression.expression.text !== 'Module' || expression.arguments.length !== 1) {
        continue;
      }
      const arg = expression.arguments[0];
      if (ts.isObjectLiteralExpression(arg)) {
        return arg;
      }
    }
  }
  throw new SchematicsException(`Could not find a @Module({...}) decorator in "${modulePath}".`);
}

function findImportsProperty(
  objectLiteral: ts.ObjectLiteralExpression,
): ts.PropertyAssignment | null {
  for (const property of objectLiteral.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === 'imports'
    ) {
      return property;
    }
  }
  return null;
}

function findImportsArrayLiteral(
  objectLiteral: ts.ObjectLiteralExpression,
): ts.ArrayLiteralExpression | null {
  const property = findImportsProperty(objectLiteral);
  return property && ts.isArrayLiteralExpression(property.initializer)
    ? property.initializer
    : null;
}

function wireModuleImport(tree: Tree, modulePath: string, configPath: string): void {
  const buffer = tree.read(modulePath);
  if (!buffer) {
    throw new SchematicsException(`Could not read "${modulePath}".`);
  }
  const content = buffer.toString('utf8');
  if (content.includes('AngularSSRModule')) {
    return;
  }

  const source = ts.createSourceFile(modulePath, content, ts.ScriptTarget.Latest, true);
  const decoratorObject = findNestModuleDecoratorObject(source, modulePath);
  const importsProperty = findImportsProperty(decoratorObject);
  const importsArray = findImportsArrayLiteral(decoratorObject);
  if (importsProperty && !importsArray) {
    throw new SchematicsException(
      `Could not auto-wire AngularSSRModule: the "imports" property in "${modulePath}" is not an array literal. Add \`AngularSSRModule.forRoot(angularSsrOptions)\` to it manually.`,
    );
  }
  const importSpecifier = toImportSpecifier(modulePath, configPath);

  const recorder = tree.beginUpdate(modulePath);

  const lastImport = [...source.statements].reverse().find(ts.isImportDeclaration);
  const importInsertPos = lastImport ? lastImport.getEnd() : 0;
  recorder.insertRight(
    importInsertPos,
    `\nimport { AngularSSRModule } from '@lexmata/nestjs-angular-ssr';` +
      `\nimport { angularSsrOptions } from '${importSpecifier}';`,
  );

  if (importsArray) {
    if (importsArray.elements.length > 0) {
      // Indexed access (not `.at()`) intentionally: `Array.prototype.at()` always
      // types as `T | undefined` under this repo's `strict` tsconfig, which would
      // force an unnecessary undefined-check here even though the surrounding
      // `length > 0` guard already ensures this element exists.
      // eslint-disable-next-line unicorn/prefer-at
      const lastElement = importsArray.elements[importsArray.elements.length - 1];
      recorder.insertRight(lastElement.getEnd(), ', AngularSSRModule.forRoot(angularSsrOptions)');
    } else {
      recorder.insertRight(
        importsArray.getStart() + 1,
        'AngularSSRModule.forRoot(angularSsrOptions)',
      );
    }
  } else {
    recorder.insertRight(
      decoratorObject.getStart() + 1,
      `\n  imports: [AngularSSRModule.forRoot(angularSsrOptions)],`,
    );
  }

  tree.commitUpdate(recorder);
}

function addMissingPeerDependencies(tree: Tree): boolean {
  const result = readJsonFileResult(tree, '/package.json');
  if (result.status === 'missing') {
    return false;
  }
  if (result.status === 'malformed') {
    throw new SchematicsException(
      `Could not parse "/package.json": ${result.error.message}. Fix the JSON syntax and re-run ng add.`,
    );
  }
  const pkg = result.value;
  const dependencies = { ...(pkg.dependencies as Record<string, string> | undefined) };
  const devDependencies = (pkg.devDependencies as Record<string, string> | undefined) ?? {};
  let changed = false;
  for (const [name, range] of Object.entries(PEER_DEPENDENCIES)) {
    if (dependencies[name] || devDependencies[name]) {
      continue;
    }
    dependencies[name] = range;
    changed = true;
  }
  if (changed) {
    pkg.dependencies = dependencies;
    tree.overwrite('/package.json', `${JSON.stringify(pkg, null, 2)}\n`);
  }
  return changed;
}
