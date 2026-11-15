# Releasing

Releases are automated and driven by pull request labels.

```text
PR opened ──► pr-labels.yml   exactly one release:* label (derived from the branch name if missing)
          ──► ci.yml          format, types, docs drift, audit, tests (Node 20/22/24 × Linux, macOS, Windows), pack + smoke install
merge     ──► release.yml     label of the merged PR → next version from the latest v* tag
                              → full gate → npm version (runner only) → pack + smoke
                              → npm publish --provenance → tag + GitHub release
          ──► pages.yml       after release.yml: rebuild the gallery with the version now on npm
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
- **Workflow changes.** GitHub does not let `GITHUB_TOKEN` create a tag on a commit that changes `.github/workflows/`. If such a PR is released, npm publishing still succeeds and the job prints the `gh release create …` command a maintainer runs once. Prefer `release:none` for CI-only PRs.

## npm authentication

Publishing uses npm **trusted publishing** (OIDC): npmjs.com trusts
`grethel-labs/excaliplant`, workflow `release.yml`, environment `npm`. The job
requests a short-lived identity token (`id-token: write`), so no npm token is
stored in GitHub. Provenance statements are generated automatically.

If the trusted publisher configuration on npmjs.com is removed or changed,
publishing fails with `E404`/`E403` on the `PUT` request; restore the
configuration rather than adding a token.
