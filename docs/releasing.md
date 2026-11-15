# Releasing

Releases are automated and driven by pull request labels.

```text
PR opened ──► pr-labels.yml   exactly one release:* label (derived from the branch name if missing)
          ──► ci.yml          format, types, docs drift, audit, tests (Node 20/22/24 × Linux, macOS, Windows), pack + smoke install
merge     ──► release.yml     label of the merged PR → next version from the latest v* tag
                              → full gate → npm version (runner only) → pack + smoke
                              → npm publish --provenance → tag + GitHub release
```

| Label           | Effect on merge           |
| --------------- | ------------------------- |
| `release:major` | `1.4.2` → `2.0.0`         |
| `release:minor` | `1.4.2` → `1.5.0`         |
| `release:patch` | `1.4.2` → `1.4.3`         |
| `release:none`  | merged without publishing |

Branch names containing `MAJOR`, `MINOR`, `PATCH` or `NONE` get the matching
label automatically; otherwise `release:patch` is applied.

## Design decisions

- **Tags are the source of truth.** `package.json` keeps `0.0.0-development`; the release job sets the real version only inside the runner. Nothing is committed or force-pushed back to `main`, so branch protection stays strict and no bot keys are needed.
- **Idempotent.** Re-running a release skips an already published npm version and an existing GitHub release.
- **Manual releases.** `Actions → Release → Run workflow` with a bump input.

## npm authentication

The publish step supports both:

1. **Trusted publishing (recommended):** configure the package on npmjs.com to trust `grethel-labs/excaliplant`, workflow `release.yml`, environment `npm`. No secret needed.
2. **Token:** an automation token in the `NPM_TOKEN` repository (or `npm` environment) secret.

Provenance statements are generated in both cases (`id-token: write`).
