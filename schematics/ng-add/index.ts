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

const PEER_DEPENDENCIES: Record<string, string> = {
  '@angular/core': '>=19.0.0',
  '@angular/platform-server': '>=19.0.0',
  '@angular/ssr': '>=19.0.0',
  '@nestjs/cache-manager': '>=3.0.0',
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
        : resolveModuleDefault(tree),
    );

    if (!tree.exists(modulePath)) {
      throw new SchematicsException(
        `Could not find a NestJS module at "${modulePath}". Pass --module <path> pointing at the module AngularSSRModule should be wired into.`,
      );
    }

    const angularDefaults = resolveAngularDefaults(tree);
    const browserDistFolder =
      options.browserDistFolder && options.browserDistFolder !== DEFAULT_BROWSER_DIST_FOLDER
        ? options.browserDistFolder
        : angularDefaults.browserDistFolder;
    const serverBundle =
      options.serverBundle && options.serverBundle !== DEFAULT_SERVER_BUNDLE
        ? options.serverBundle
        : angularDefaults.serverBundle;

    const moduleDir = posix.dirname(modulePath);
    const configDir = posix.dirname(moduleDir);
    const configPath = posix.join(configDir, 'angular-ssr.config.ts');

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

function readJsonFile(tree: Tree, path: string): Record<string, unknown> | null {
  const buffer = tree.read(path);
  if (!buffer) {
    return null;
  }
  try {
    return JSON.parse(buffer.toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveModuleDefault(tree: Tree): string {
  const nestCli = readJsonFile(tree, '/nest-cli.json');
  if (!nestCli) {
    return DEFAULT_MODULE;
  }
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

function resolveAngularDefaults(tree: Tree): { browserDistFolder: string; serverBundle: string } {
  const fallback = {
    browserDistFolder: DEFAULT_BROWSER_DIST_FOLDER,
    serverBundle: DEFAULT_SERVER_BUNDLE,
  };
  const angularJson = readJsonFile(tree, '/angular.json');
  if (!angularJson || typeof angularJson.projects !== 'object' || angularJson.projects === null) {
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
import type { AngularSSRModuleOptions } from '@lexmata/nestjs-angular-ssr';

export const angularSsrOptions: AngularSSRModuleOptions = {
  browserDistFolder: join(process.cwd(), '${browserDistFolder}'),
  bootstrap: async () => {
    const { default: angularApp } = await import('${serverBundle}');
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

function findImportsArrayLiteral(
  objectLiteral: ts.ObjectLiteralExpression,
): ts.ArrayLiteralExpression | null {
  for (const property of objectLiteral.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === 'imports' &&
      ts.isArrayLiteralExpression(property.initializer)
    ) {
      return property.initializer;
    }
  }
  return null;
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
  const importsArray = findImportsArrayLiteral(decoratorObject);
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
      const lastElement = importsArray.elements.at(-1);
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
  const pkg = readJsonFile(tree, '/package.json');
  if (!pkg) {
    return false;
  }
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
