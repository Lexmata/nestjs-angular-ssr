# `ng add` / `nest add` schematic for `@lexmata/nestjs-angular-ssr`

## Goal

Let a consumer run `ng add @lexmata/nestjs-angular-ssr` (or `nest add
@lexmata/nestjs-angular-ssr`) inside their NestJS project and have it:

1. install missing peer deps,
2. scaffold a config file with real (interactively-supplied) values,
3. wire `AngularSSRModule.forRoot(...)` into their app module.

Today the package is only installable in the generic npm sense (peer deps +
built dist). This adds the schematic layer on top — nothing about the
existing build output, module API, or peer-dep contract changes.

## Why one schematic serves both `ng add` and `nest add`

Angular CLI's `ng add` and Nest CLI's `nest add` both resolve schematics the
same way: read the target package's `package.json` `"schematics"` field,
load the collection through `@angular-devkit/schematics`' `SchematicEngine`,
and run the schematic named `ng-add`. There is no Nest-specific schematic
format — Nest CLI reuses the Angular DevKit engine wholesale. So a single
`collection.json` with one `ng-add` entry satisfies both commands; "dual
registration" is a documentation + testing concern, not a code one:

- README documents both invocation commands.
- The schematic test suite invokes the collection/schematic the same way
  Nest's `AddAction` does (by collection + schematic name, not just via the
  `ng add` CLI wrapper), so a regression in either resolution path is
  caught.

## Files

```
schematics/
  collection.json              # declares "ng-add" -> ./ng-add/index#ngAdd
  ng-add/
    index.ts                   # the Rule
    schema.json                # options + x-prompt definitions
    files/
      angular-ssr.config.ts.template   # EJS template for the generated config
```

`tsconfig.schematics.json` — CJS output (schematics must be CommonJS),
`outDir: dist/schematics`, includes `schematics/**/*.ts`.

## `schema.json` options

| Option              | Type   | Default                  | Prompt                                                            |
| ------------------- | ------ | ------------------------ | ----------------------------------------------------------------- |
| `module`            | string | `src/app/app.module.ts`  | "Which NestJS module should AngularSSRModule be wired into?"      |
| `browserDistFolder` | string | `dist/browser`           | "Path to the Angular browser build output?"                       |
| `serverBundle`      | string | `dist/server/server.mjs` | "Path to the Angular server bundle (server.mjs) for bootstrap()?" |

All three get an `x-prompt` so both `ng add` (interactive by default) and
`nest add` (which also drives DevKit prompts) ask the user instead of
silently taking defaults, unless flags are passed non-interactively (e.g. in
CI): `ng add @lexmata/nestjs-angular-ssr --module apps/api/src/app.module.ts`.

## Rule behavior (`schematics/ng-add/index.ts`)

1. **Resolve target module file.** If `options.module` doesn't exist in the
   tree, throw `SchematicsException` with a message telling the user to pass
   `--module <path>`.
2. **Generate config file.** Emit `<dirname(module)>/../angular-ssr.config.ts`
   (i.e. alongside the app root, not nested under the module's own folder)
   from the EJS template, interpolating `browserDistFolder` and
   `serverBundle` into a real (non-placeholder) `AngularSSRModuleOptions`
   object:

   ```ts
   import { join } from 'node:path';
   import type { AngularSSRModuleOptions } from '@lexmata/nestjs-angular-ssr';

   export const angularSsrOptions: AngularSSRModuleOptions = {
     browserDistFolder: join(process.cwd(), '<browserDistFolder>'),
     bootstrap: async () => {
       const { default: angularApp } = await import('<serverBundle>');
       return angularApp;
     },
   };
   ```

3. **Wire the module.** Using `@schematics/angular/utility/ast-utils`
   (`addImportToModule`, plus a raw import-insertion helper for the two
   `import` statements — `ast-utils` targets NgModule decorators but works
   fine against any `@Module({...})` decorator shape since it's structurally
   the same), insert:
   - `import { AngularSSRModule } from '@lexmata/nestjs-angular-ssr';`
   - `import { angularSsrOptions } from './angular-ssr.config';` (relative
     path computed from the module file's location)
   - `AngularSSRModule.forRoot(angularSsrOptions)` into the `imports: []`
     array of the `@Module({...})` decorator.

   If the module already imports `AngularSSRModule` (re-running `ng add`),
   skip the edit and log a message instead of duplicating the import.

4. **Peer deps.** For each of `@angular/core`, `@angular/platform-server`,
   `@angular/ssr`, `@nestjs/cache-manager`, `express` — if absent from the
   consumer's `package.json` (`dependencies` or `devDependencies`), add it
   to `dependencies` at the version range from this package's own
   `peerDependencies`. Queue `context.addTask(new NodePackageInstallTask())`
   at the end (once, regardless of how many deps were added).
5. Return the modified `Tree`.

## Build pipeline changes

- New script `build:schematics`: `tsc -p tsconfig.schematics.json`.
- New script (or a step folded into `build:markers`'s copy logic):
  copy `schematics/**/*.json` and `schematics/**/*.template` into
  `dist/schematics/` (tsc won't emit non-`.ts` files).
- `build` script gains `&& pnpm run build:schematics` after the existing
  cjs/esm/fix-esm steps.
- `package.json`:
  - add `"schematics": "./dist/schematics/collection.json"`.
  - add `"schematics"` (the source dir) and confirm `dist` is already in
    `files` (it is) — no change needed there since `dist/schematics` is
    inside `dist/`.

## New devDependencies

`@angular-devkit/schematics`, `@angular-devkit/core`, `@schematics/angular`.

## Testing

`schematics/ng-add/index.spec.ts` (Vitest, consistent with the rest of the
repo):

- Build a `UnitTestTree` seeded with a minimal `src/app/app.module.ts`
  (bare `@Module({ imports: [], ... })`) and a `package.json`.
- Run via `SchematicTestRunner('schematics', collectionPath).runSchematic('ng-add', options, tree)`
  — this is the same resolution path both `ng add` and `nest add` use, so it
  covers both without needing the actual CLIs installed in test.
- Assertions:
  - `angular-ssr.config.ts` created with interpolated paths.
  - Target module file contains both new imports and
    `AngularSSRModule.forRoot(angularSsrOptions)` in its `imports` array.
  - Missing peer deps appended to `package.json`.
  - Running twice doesn't duplicate the import/forRoot entry.
  - Missing `--module` target throws `SchematicsException`.

## README changes

Add an "Installation via schematic" section documenting both:

```bash
ng add @lexmata/nestjs-angular-ssr
# or
nest add @lexmata/nestjs-angular-ssr
```

with the interactive prompts and the non-interactive flag form.

## Out of scope

- No scaffolding of `main.ts` bootstrap wiring or the Angular-side
  `server.ts` — those are app-specific and already covered by the example.
- No `nest add`-only or `ng add`-only code paths — one schematic, two
  documented entry points.
- No migration schematic (`ng update`) — versioning story is unchanged.
