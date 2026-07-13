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

The schema defaults above (`src/app/app.module.ts`, `dist/browser`,
`dist/server/server.mjs`) are the fallback for a bare Nest project with
neither `angular.json` nor `nest-cli.json` conventions to read. See
**Project detection** below for how the Rule upgrades these before they're
used, so the schematic works whether it's run inside a pure Angular
workspace, a pure Nest project, or a combined layout with both config files.

## Project detection

The consumer's repo shape varies — this package is used both from Nest-only
projects (like `example/`) and from combined Nest+Angular workspaces. The
Rule resolves smarter defaults _before_ falling back to the static schema
defaults, so the interactive prompts show a value that's actually right for
this project rather than a generic guess:

- **`module` default.** If `nest-cli.json` exists in the tree, read its
  `sourceRoot` (default `'src'`) and check, in order,
  `${sourceRoot}/app.module.ts` and `${sourceRoot}/app/app.module.ts` for
  which one exists. Use whichever is found in place of the schema default.
  If `nest-cli.json` is absent, keep the schema default
  (`src/app/app.module.ts`).
- **`browserDistFolder` / `serverBundle` defaults.** If `angular.json`
  exists, read the default project (`defaultProject`, or the first key in
  `projects` if unset) and its `architect.build.options.outputPath`.
  Normalize both the legacy string form and the Angular 18+ application
  builder's `{ base: string }` form to a single path string. Derive
  `browserDistFolder = ${outputPath}/browser` and
  `serverBundle = ${outputPath}/server/server.mjs`. If `angular.json` is
  absent, or no project/outputPath can be resolved, keep the schema
  defaults.
- A computed default only overrides the _schema's static default_ — an
  explicit `--module`/`--browserDistFolder`/`--serverBundle` flag from the
  user always wins, and detection never overrides a value the user actually
  typed at the prompt.
- Both detections run independently, so a workspace with both
  `nest-cli.json` and `angular.json` at the root gets both upgrades; a
  workspace with only one config file gets only the matching upgrade.

## Rule behavior (`schematics/ng-add/index.ts`)

1. **Resolve target module file.** Compute the effective `module` path per
   **Project detection** above. If it still doesn't exist in the tree,
   throw `SchematicsException` with a message telling the user to pass
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
- Project-detection matrix — run the same schematic against four seeded
  trees to confirm each shape resolves correctly with no options passed:
  - Bare Nest project (no `angular.json`/`nest-cli.json`) → static schema
    defaults used.
  - Nest-only (`nest-cli.json` with a non-default `sourceRoot`) → `module`
    default resolved from it, dist paths stay static.
  - Angular-only (`angular.json` with a project `outputPath`) →
    `browserDistFolder`/`serverBundle` resolved from it, `module` stays
    static.
  - Combined workspace (both config files present) → all three resolved
    from their respective sources.

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
