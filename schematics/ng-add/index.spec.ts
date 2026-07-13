import 'tsx/cjs';
import { resolve } from 'node:path';
import { Tree } from '@angular-devkit/schematics';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { describe, expect, it } from 'vitest';

const collectionPath = resolve(__dirname, '../collection.json');
const runner = new SchematicTestRunner('schematics', collectionPath);

const BASE_MODULE = `import { Module } from '@nestjs/common';

@Module({
  imports: [],
})
export class AppModule {}
`;

const MODULE_WITH_EXISTING_IMPORTS = `import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
})
export class AppModule {}
`;

const MODULE_WITHOUT_IMPORTS = `import { Module } from '@nestjs/common';

@Module({
  controllers: [],
})
export class AppModule {}
`;

const MODULE_WITH_NON_LITERAL_IMPORTS = `import { Module } from '@nestjs/common';

const sharedImports = [];

@Module({
  imports: sharedImports,
})
export class AppModule {}
`;

const MODULE_WITH_ANGULAR_SSR_MODULE_COMMENT_ONLY = `import { Module } from '@nestjs/common';

// AngularSSRModule to be wired manually later

@Module({
  imports: [],
})
export class AppModule {}
`;

const APP_MODULE_PATH = '/src/app/app.module.ts';
const PACKAGE_JSON_PATH = '/package.json';
const CONFIG_PATH = '/src/angular-ssr.config.ts';
const NEST_CLI_PATH = '/nest-cli.json';
const NESTED_SOURCE_ROOT = 'apps/api/src';
const NEST_CLI_WITH_NESTED_SOURCE_ROOT = JSON.stringify({ sourceRoot: NESTED_SOURCE_ROOT });
const NESTED_MODULE_PATH = '/apps/api/src/app.module.ts';
const NESTED_APP_SUBDIR_MODULE_PATH = '/apps/api/src/app/app.module.ts';
const NESTED_CONFIG_PATH = '/apps/api/angular-ssr.config.ts';
const ANGULAR_JSON_PATH = '/angular.json';
const DIST_DEMO_BROWSER_ASSERTION = 'join(process.cwd(), "dist/demo/browser")';
const DIST_BROWSER_ASSERTION = 'join(process.cwd(), "dist/browser")';
const DIST_SERVER_BUNDLE_ASSERTION =
  'await import(pathToFileURL(join(process.cwd(), "dist/server/server.mjs")).href)';
const WIRED_ASSERTION = 'AngularSSRModule.forRoot(angularSsrOptions)';
const MALFORMED_JSON = '{ not valid json';
const PACKAGE_JSON_CONTENT = JSON.stringify({ name: 'consumer', version: '1.0.0' }, null, 2);

function bareNestProject(moduleContent: string = BASE_MODULE): UnitTestTree {
  const tree = new UnitTestTree(Tree.empty());
  tree.create(APP_MODULE_PATH, moduleContent);
  tree.create(PACKAGE_JSON_PATH, PACKAGE_JSON_CONTENT);
  return tree;
}

describe('ng-add schematic', () => {
  it('creates the config file with static defaults for a bare Nest project', async () => {
    const tree = await runner.runSchematic('ng-add', {}, bareNestProject());
    expect(tree.exists(CONFIG_PATH)).toBe(true);
    const config = tree.readContent(CONFIG_PATH);
    expect(config).toContain(DIST_BROWSER_ASSERTION);
    expect(config).toContain(DIST_SERVER_BUNDLE_ASSERTION);
  });

  it('wires AngularSSRModule into the target module with the correct relative import', async () => {
    const tree = await runner.runSchematic('ng-add', {}, bareNestProject());
    const moduleContent = tree.readContent(APP_MODULE_PATH);
    expect(moduleContent).toContain(
      "import { AngularSSRModule } from '@lexmata/nestjs-angular-ssr';",
    );
    expect(moduleContent).toContain("import { angularSsrOptions } from '../angular-ssr.config';");
    expect(moduleContent).toContain('imports: [AngularSSRModule.forRoot(angularSsrOptions)],');
  });

  it('appends AngularSSRModule.forRoot(...) after existing imports when the imports array is non-empty', async () => {
    const tree = await runner.runSchematic(
      'ng-add',
      {},
      bareNestProject(MODULE_WITH_EXISTING_IMPORTS),
    );
    const moduleContent = tree.readContent(APP_MODULE_PATH);
    expect(moduleContent).toContain('ConfigModule');
    expect(moduleContent).toContain(
      'imports: [ConfigModule, AngularSSRModule.forRoot(angularSsrOptions)]',
    );
  });

  it('inserts a fresh imports array when the @Module({...}) decorator has no imports property', async () => {
    const tree = await runner.runSchematic('ng-add', {}, bareNestProject(MODULE_WITHOUT_IMPORTS));
    const moduleContent = tree.readContent(APP_MODULE_PATH);
    expect(moduleContent).toContain('imports: [AngularSSRModule.forRoot(angularSsrOptions)],');
  });

  it('adds missing peer dependencies to package.json', async () => {
    const tree = await runner.runSchematic('ng-add', {}, bareNestProject());
    const pkg = JSON.parse(tree.readContent(PACKAGE_JSON_PATH)) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@angular/core']).toBe('>=19.0.0');
    expect(pkg.dependencies['@angular/platform-server']).toBe('>=19.0.0');
    expect(pkg.dependencies['@angular/ssr']).toBe('>=19.0.0');
    expect(pkg.dependencies.express).toBe('>=4.18.0');
    expect(pkg.dependencies['zone.js']).toBeUndefined();
  });

  it('does not duplicate the import/forRoot call on a second run', async () => {
    const first = await runner.runSchematic('ng-add', {}, bareNestProject());
    const second = await runner.runSchematic('ng-add', {}, first);
    const moduleContent = second.readContent(APP_MODULE_PATH);
    const occurrences = moduleContent.split('AngularSSRModule.forRoot').length - 1;
    expect(occurrences).toBe(1);
  });

  it('throws a clear error when the target module does not exist', async () => {
    const tree = new UnitTestTree(Tree.empty());
    tree.create(PACKAGE_JSON_PATH, '{}');
    await expect(runner.runSchematic('ng-add', {}, tree)).rejects.toThrow(
      /Could not find a NestJS module/,
    );
  });

  it('resolves the module default from nest-cli.json sourceRoot', async () => {
    const tree = new UnitTestTree(Tree.empty());
    tree.create(NEST_CLI_PATH, NEST_CLI_WITH_NESTED_SOURCE_ROOT);
    tree.create(NESTED_MODULE_PATH, BASE_MODULE);
    tree.create(PACKAGE_JSON_PATH, PACKAGE_JSON_CONTENT);

    const result = await runner.runSchematic('ng-add', {}, tree);
    expect(result.exists(NESTED_CONFIG_PATH)).toBe(true);
    const moduleContent = result.readContent(NESTED_MODULE_PATH);
    expect(moduleContent).toContain("from '../angular-ssr.config'");
  });

  it('resolves browserDistFolder/serverBundle from angular.json (string outputPath)', async () => {
    const tree = bareNestProject();
    tree.create(
      ANGULAR_JSON_PATH,
      JSON.stringify({
        defaultProject: 'demo',
        projects: { demo: { architect: { build: { options: { outputPath: 'dist/demo' } } } } },
      }),
    );

    const result = await runner.runSchematic('ng-add', {}, tree);
    const config = result.readContent(CONFIG_PATH);
    expect(config).toContain(DIST_DEMO_BROWSER_ASSERTION);
    expect(config).toContain(
      'await import(pathToFileURL(join(process.cwd(), "dist/demo/server/server.mjs")).href)',
    );
  });

  it('resolves browserDistFolder/serverBundle from angular.json ({ base } outputPath form)', async () => {
    const tree = bareNestProject();
    tree.create(
      ANGULAR_JSON_PATH,
      JSON.stringify({
        defaultProject: 'demo',
        projects: {
          demo: { architect: { build: { options: { outputPath: { base: 'dist/demo' } } } } },
        },
      }),
    );

    const result = await runner.runSchematic('ng-add', {}, tree);
    const config = result.readContent(CONFIG_PATH);
    expect(config).toContain(DIST_DEMO_BROWSER_ASSERTION);
  });

  it('falls back to the nested app/app.module.ts candidate when the flat candidate is absent', async () => {
    const tree = new UnitTestTree(Tree.empty());
    tree.create(NEST_CLI_PATH, NEST_CLI_WITH_NESTED_SOURCE_ROOT);
    tree.create(NESTED_APP_SUBDIR_MODULE_PATH, BASE_MODULE);
    tree.create(PACKAGE_JSON_PATH, PACKAGE_JSON_CONTENT);

    const result = await runner.runSchematic('ng-add', {}, tree);
    const moduleContent = result.readContent(NESTED_APP_SUBDIR_MODULE_PATH);
    expect(moduleContent).toContain(WIRED_ASSERTION);
  });

  it('falls back to Angular defaults when angular.json has no usable projects map', async () => {
    const tree = bareNestProject();
    tree.create(ANGULAR_JSON_PATH, JSON.stringify({ defaultProject: 'demo' }));

    const result = await runner.runSchematic('ng-add', {}, tree);
    const config = result.readContent(CONFIG_PATH);
    expect(config).toContain(DIST_BROWSER_ASSERTION);
    expect(config).toContain(DIST_SERVER_BUNDLE_ASSERTION);
  });

  it('resolves both module and dist defaults when both config files are present', async () => {
    const tree = new UnitTestTree(Tree.empty());
    tree.create(NEST_CLI_PATH, NEST_CLI_WITH_NESTED_SOURCE_ROOT);
    tree.create(NESTED_MODULE_PATH, BASE_MODULE);
    tree.create(PACKAGE_JSON_PATH, PACKAGE_JSON_CONTENT);
    tree.create(
      ANGULAR_JSON_PATH,
      JSON.stringify({
        defaultProject: 'demo',
        projects: { demo: { architect: { build: { options: { outputPath: 'dist/demo' } } } } },
      }),
    );

    const result = await runner.runSchematic('ng-add', {}, tree);
    expect(result.exists(NESTED_CONFIG_PATH)).toBe(true);
    const config = result.readContent(NESTED_CONFIG_PATH);
    expect(config).toContain(DIST_DEMO_BROWSER_ASSERTION);
  });

  it('respects an explicit --module flag over any detected default', async () => {
    const tree = new UnitTestTree(Tree.empty());
    tree.create('/src/custom.module.ts', BASE_MODULE);
    tree.create(PACKAGE_JSON_PATH, PACKAGE_JSON_CONTENT);

    const result = await runner.runSchematic('ng-add', { module: 'src/custom.module.ts' }, tree);
    const moduleContent = result.readContent('/src/custom.module.ts');
    expect(moduleContent).toContain(WIRED_ASSERTION);
    // Flat module layout (one directory deep): the config's "grandparent"
    // placement lands at the tree root, per the documented trade-off.
    expect(result.exists('/angular-ssr.config.ts')).toBe(true);
  });

  it('rejects when the @Module({...}) decorator has a non-array-literal "imports" property', async () => {
    const tree = bareNestProject(MODULE_WITH_NON_LITERAL_IMPORTS);
    await expect(runner.runSchematic('ng-add', {}, tree)).rejects.toThrow(
      /imports.*is not an array literal/i,
    );
  });

  it('rejects when --module points at a path containing ".." segments', async () => {
    const tree = new UnitTestTree(Tree.empty());
    tree.create(PACKAGE_JSON_PATH, PACKAGE_JSON_CONTENT);
    await expect(
      runner.runSchematic('ng-add', { module: '../../etc/evil.ts' }, tree),
    ).rejects.toThrow(/must not contain/i);
  });

  it('rejects when package.json exists but contains invalid JSON', async () => {
    const tree = new UnitTestTree(Tree.empty());
    tree.create(APP_MODULE_PATH, BASE_MODULE);
    tree.create(PACKAGE_JSON_PATH, MALFORMED_JSON);
    await expect(runner.runSchematic('ng-add', {}, tree)).rejects.toThrow(
      /could not parse.*package\.json/i,
    );
  });

  it('falls back to defaults when angular.json exists but contains invalid JSON', async () => {
    const tree = bareNestProject();
    tree.create(ANGULAR_JSON_PATH, MALFORMED_JSON);

    const result = await runner.runSchematic('ng-add', {}, tree);
    const config = result.readContent(CONFIG_PATH);
    expect(config).toContain(DIST_BROWSER_ASSERTION);
  });

  it('falls back to defaults when nest-cli.json exists but contains invalid JSON', async () => {
    const tree = new UnitTestTree(Tree.empty());
    tree.create(NEST_CLI_PATH, MALFORMED_JSON);
    tree.create(APP_MODULE_PATH, BASE_MODULE);
    tree.create(PACKAGE_JSON_PATH, PACKAGE_JSON_CONTENT);

    const result = await runner.runSchematic('ng-add', {}, tree);
    expect(result.exists(APP_MODULE_PATH)).toBe(true);
    const moduleContent = result.readContent(APP_MODULE_PATH);
    expect(moduleContent).toContain(WIRED_ASSERTION);
  });

  it('overrides detected angular.json browserDistFolder/serverBundle with explicit options', async () => {
    const tree = bareNestProject();
    tree.create(
      ANGULAR_JSON_PATH,
      JSON.stringify({
        defaultProject: 'demo',
        projects: { demo: { architect: { build: { options: { outputPath: 'dist/demo' } } } } },
      }),
    );

    const result = await runner.runSchematic(
      'ng-add',
      {
        browserDistFolder: 'dist/custom/browser',
        serverBundle: 'dist/custom/server/server.mjs',
      },
      tree,
    );
    const config = result.readContent(CONFIG_PATH);
    expect(config).toContain('join(process.cwd(), "dist/custom/browser")');
    expect(config).toContain(
      'await import(pathToFileURL(join(process.cwd(), "dist/custom/server/server.mjs")).href)',
    );
    expect(config).not.toContain('dist/demo');
  });

  it('does not duplicate or overwrite peer dependencies already present in dependencies/devDependencies', async () => {
    const tree = new UnitTestTree(Tree.empty());
    tree.create(APP_MODULE_PATH, BASE_MODULE);
    tree.create(
      PACKAGE_JSON_PATH,
      JSON.stringify(
        {
          name: 'consumer',
          version: '1.0.0',
          dependencies: { '@angular/core': '^19.1.0' },
          devDependencies: { express: '^4.19.0' },
        },
        null,
        2,
      ),
    );

    const result = await runner.runSchematic('ng-add', {}, tree);
    const pkg = JSON.parse(result.readContent(PACKAGE_JSON_PATH)) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies.express).toBe('^4.19.0');
    expect(pkg.dependencies.express).toBeUndefined();
    expect(pkg.dependencies['@angular/core']).toBe('^19.1.0');
    expect(pkg.dependencies['@angular/platform-server']).toBe('>=19.0.0');
    expect(pkg.dependencies['@angular/ssr']).toBe('>=19.0.0');
    expect(pkg.dependencies['zone.js']).toBeUndefined();
  });

  it('resolves the default project via Object.keys(projects)[0] when angular.json has no defaultProject', async () => {
    const tree = bareNestProject();
    tree.create(
      ANGULAR_JSON_PATH,
      JSON.stringify({
        projects: { demo: { architect: { build: { options: { outputPath: 'dist/demo' } } } } },
      }),
    );

    const result = await runner.runSchematic('ng-add', {}, tree);
    const config = result.readContent(CONFIG_PATH);
    expect(config).toContain(DIST_DEMO_BROWSER_ASSERTION);
  });

  it('documents the known limitation: a bare "AngularSSRModule" substring (e.g. in a comment) suppresses wiring', async () => {
    const tree = await runner.runSchematic(
      'ng-add',
      {},
      bareNestProject(MODULE_WITH_ANGULAR_SSR_MODULE_COMMENT_ONLY),
    );
    const moduleContent = tree.readContent(APP_MODULE_PATH);
    expect(moduleContent).toContain('// AngularSSRModule to be wired manually later');
    expect(moduleContent).not.toContain(WIRED_ASSERTION);
  });
});
