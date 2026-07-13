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

function bareNestProject(): UnitTestTree {
  const tree = new UnitTestTree(Tree.empty());
  tree.create('/src/app/app.module.ts', BASE_MODULE);
  tree.create('/package.json', JSON.stringify({ name: 'consumer', version: '1.0.0' }, null, 2));
  return tree;
}

describe('ng-add schematic', () => {
  it('creates the config file with static defaults for a bare Nest project', async () => {
    const tree = await runner.runSchematic('ng-add', {}, bareNestProject());
    expect(tree.exists('/src/angular-ssr.config.ts')).toBe(true);
    const config = tree.readContent('/src/angular-ssr.config.ts');
    expect(config).toContain("join(process.cwd(), 'dist/browser')");
    expect(config).toContain("await import('dist/server/server.mjs')");
  });

  it('wires AngularSSRModule into the target module with the correct relative import', async () => {
    const tree = await runner.runSchematic('ng-add', {}, bareNestProject());
    const moduleContent = tree.readContent('/src/app/app.module.ts');
    expect(moduleContent).toContain(
      "import { AngularSSRModule } from '@lexmata/nestjs-angular-ssr';",
    );
    expect(moduleContent).toContain("import { angularSsrOptions } from '../angular-ssr.config';");
    expect(moduleContent).toContain('imports: [AngularSSRModule.forRoot(angularSsrOptions)],');
  });

  it('adds missing peer dependencies to package.json', async () => {
    const tree = await runner.runSchematic('ng-add', {}, bareNestProject());
    const pkg = JSON.parse(tree.readContent('/package.json')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@angular/core']).toBe('>=19.0.0');
    expect(pkg.dependencies['@angular/platform-server']).toBe('>=19.0.0');
    expect(pkg.dependencies['@angular/ssr']).toBe('>=19.0.0');
    expect(pkg.dependencies['@nestjs/cache-manager']).toBe('>=3.0.0');
    expect(pkg.dependencies.express).toBe('>=4.18.0');
  });

  it('does not duplicate the import/forRoot call on a second run', async () => {
    const first = await runner.runSchematic('ng-add', {}, bareNestProject());
    const second = await runner.runSchematic('ng-add', {}, first);
    const moduleContent = second.readContent('/src/app/app.module.ts');
    const occurrences = moduleContent.split('AngularSSRModule.forRoot').length - 1;
    expect(occurrences).toBe(1);
  });

  it('throws a clear error when the target module does not exist', async () => {
    const tree = new UnitTestTree(Tree.empty());
    tree.create('/package.json', '{}');
    await expect(runner.runSchematic('ng-add', {}, tree)).rejects.toThrow(
      /Could not find a NestJS module/,
    );
  });

  it('resolves the module default from nest-cli.json sourceRoot', async () => {
    const tree = new UnitTestTree(Tree.empty());
    tree.create('/nest-cli.json', JSON.stringify({ sourceRoot: 'apps/api/src' }));
    tree.create('/apps/api/src/app.module.ts', BASE_MODULE);
    tree.create('/package.json', JSON.stringify({ name: 'consumer', version: '1.0.0' }, null, 2));

    const result = await runner.runSchematic('ng-add', {}, tree);
    expect(result.exists('/apps/api/angular-ssr.config.ts')).toBe(true);
    const moduleContent = result.readContent('/apps/api/src/app.module.ts');
    expect(moduleContent).toContain("from '../angular-ssr.config'");
  });

  it('resolves browserDistFolder/serverBundle from angular.json (string outputPath)', async () => {
    const tree = bareNestProject();
    tree.create(
      '/angular.json',
      JSON.stringify({
        defaultProject: 'demo',
        projects: { demo: { architect: { build: { options: { outputPath: 'dist/demo' } } } } },
      }),
    );

    const result = await runner.runSchematic('ng-add', {}, tree);
    const config = result.readContent('/src/angular-ssr.config.ts');
    expect(config).toContain("join(process.cwd(), 'dist/demo/browser')");
    expect(config).toContain("await import('dist/demo/server/server.mjs')");
  });

  it('resolves browserDistFolder/serverBundle from angular.json ({ base } outputPath form)', async () => {
    const tree = bareNestProject();
    tree.create(
      '/angular.json',
      JSON.stringify({
        defaultProject: 'demo',
        projects: {
          demo: { architect: { build: { options: { outputPath: { base: 'dist/demo' } } } } },
        },
      }),
    );

    const result = await runner.runSchematic('ng-add', {}, tree);
    const config = result.readContent('/src/angular-ssr.config.ts');
    expect(config).toContain("join(process.cwd(), 'dist/demo/browser')");
  });

  it('resolves both module and dist defaults when both config files are present', async () => {
    const tree = new UnitTestTree(Tree.empty());
    tree.create('/nest-cli.json', JSON.stringify({ sourceRoot: 'apps/api/src' }));
    tree.create('/apps/api/src/app.module.ts', BASE_MODULE);
    tree.create('/package.json', JSON.stringify({ name: 'consumer', version: '1.0.0' }, null, 2));
    tree.create(
      '/angular.json',
      JSON.stringify({
        defaultProject: 'demo',
        projects: { demo: { architect: { build: { options: { outputPath: 'dist/demo' } } } } },
      }),
    );

    const result = await runner.runSchematic('ng-add', {}, tree);
    expect(result.exists('/apps/api/angular-ssr.config.ts')).toBe(true);
    const config = result.readContent('/apps/api/angular-ssr.config.ts');
    expect(config).toContain("join(process.cwd(), 'dist/demo/browser')");
  });

  it('respects an explicit --module flag over any detected default', async () => {
    const tree = new UnitTestTree(Tree.empty());
    tree.create('/src/custom.module.ts', BASE_MODULE);
    tree.create('/package.json', JSON.stringify({ name: 'consumer', version: '1.0.0' }, null, 2));

    const result = await runner.runSchematic('ng-add', { module: 'src/custom.module.ts' }, tree);
    const moduleContent = result.readContent('/src/custom.module.ts');
    expect(moduleContent).toContain('AngularSSRModule.forRoot(angularSsrOptions)');
  });
});
