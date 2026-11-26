---
name: excaliplant-pull-requests
description: Draft GitHub pull request titles and descriptions or open pull requests for excaliplant.
---

# Pull request descriptions

- Review the diff against the intended base. Use a short title that names the outcome and a few bullets explaining what changed and why it matters.
- List relevant checks with their actual results. Call out important verification gaps, user-visible effects or review details when they affect the decision to merge.
- Link related issues. Use `Fixes #123` when the PR fully resolves the issue.
- Add before-and-after images or a rendered example when reviewers need to see the difference. Use a small `mermaid` diagram when it clarifies a changed flow. Give images descriptive alt text.
- When asked to open the PR, target `main` and apply one supported [release label](../../../docs/releasing.md). Use `gh pr create` with `--body-file` for the Markdown and `--attach` for any local images. Return the PR URL.
