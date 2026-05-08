# Contributing to excaliplant

Thanks for considering a contribution! This file captures the
ground-rules; everything else lives in the README and inline JSDoc.

## Quick start

```sh
npm install
npm test           # node --test, ~90 cases
npm run typecheck  # tsc --checkJs
npm run build      # regenerate docs + API reference
```

`npm install` wires up Husky. The pre-commit hook formats staged
files with Prettier and runs the type checker.

## Adding parser support for a new PlantUML construct

1. Drop a new plugin under the owning diagram module, for example
   `src/diagrams/sequence/plugins/` or `src/diagrams/<kind>/plugins/`.
   A plugin is `{ name, tryLine?, tryStart? }` — see
   `src/util/parser_engine.mjs` for the contract.
2. Register it in the corresponding module parser contract under
   `src/diagrams/<kind>/parser.mjs`.
3. Add a regression test under `tests/`.

The engine itself has no PlantUML-specific knowledge; you should
never need to touch it for a new construct.

## Pull request checklist

- `npm test` passes locally.
- `npm run typecheck` passes locally.
- `npm run format:check` passes (or run `npm run format`).
- New behaviour is covered by a test in `tests/`.
- User-visible changes are mentioned in `CHANGELOG.md` under the
  next unreleased section.

## Reporting security issues

Please **do not** open a public issue for security problems. See
[`SECURITY.md`](./SECURITY.md) for the private disclosure channel.

## License

By contributing you agree that your contribution will be licensed
under the [MIT License](./LICENSE) covering the rest of the project.
