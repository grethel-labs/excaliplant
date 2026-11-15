## Summary

<!-- What changes and why. Screenshots of rendered diagrams are very welcome. -->

## Release

<!-- Exactly one label: release:major | release:minor | release:patch | release:none.
     It is derived from MAJOR/MINOR/PATCH/NONE in the branch name if you do not set it. -->

## Checklist

- [ ] `npm run check` passes (format, types, tests, docs drift).
- [ ] New syntax or behaviour has an example in `examples/<kind>/` and/or a test in `test/`.
- [ ] I looked at the rendered output (`npm run docs` or `npx excaliplant … -o out.png`).
- [ ] Regenerated docs are committed (`npm run docs`).
- [ ] `CHANGELOG.md` updated for user-visible changes.
- [ ] Security-relevant changes have a case in `test/security.test.mjs`.
