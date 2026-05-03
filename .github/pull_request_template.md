# Pull request

## Summary

<!-- One paragraph describing what this PR changes and why. -->

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Refactor / internal cleanup
- [ ] Docs / build only
- [ ] Dependency update

## Checklist

- [ ] `npm test` passes locally (full 79+ suite).
- [ ] If parser/renderer behaviour changed: regression test added.
- [ ] If a new public export was added: `index.mjs` re-exports it AND `tests/self_introspection.test.mjs` still passes.
- [ ] No edits to `README.md` or `docs/ressources/generated/` — those are rebuilt by CI.
- [ ] If touching the public API: JSDoc updated; TypeDoc still builds (`npm run build:api`).

## Notes for reviewers

<!-- Anything reviewers should focus on, manual test cases, screenshots of rendered diagrams, etc. -->
