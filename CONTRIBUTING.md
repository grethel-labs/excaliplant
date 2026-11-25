# Contributing

Thanks for helping! The short version:

```sh
npm ci
npm run check      # format, types, tests, docs drift
```

## Reporting PlantUML that renders badly

Open an issue with the smallest PlantUML snippet that shows the problem and,
if possible, what PlantUML itself draws. Screenshots of excaliplant's output
help a lot (`npx excaliplant input.puml -o out.png`).

## Making changes

1. Start with [AGENTS.md](AGENTS.md) and the [development guidelines](docs/development/guidelines.md) for the subsystem and its checks. The [system overview](docs/development/overview.md) includes editable diagrams.
2. Add or update an example in `examples/<kind>/`; it becomes a test and a gallery entry.
3. Add unit tests for tricky syntax in `test/`.
4. Run `npm run docs` and commit the regenerated `README.md`, `docs/gallery*` and `docs/assets/`.
5. Add a line to `CHANGELOG.md` under "Unreleased" for user-visible changes.
6. Open a PR with one `release:*` label (or a `MAJOR`/`MINOR`/`PATCH`/`NONE` token in the branch name). See [docs/releasing.md](docs/releasing.md).
