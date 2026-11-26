---
name: excaliplant-github-issues
description: Draft or create concise GitHub issues for excaliplant, including bug reports and feature requests.
---

# GitHub issues

- Give the issue a specific title. Use short bullets and the relevant fields from the [issue templates](../../../.github/ISSUE_TEMPLATE/).
- For a bug, state what happens and what should happen. Include the smallest reproducer that shows the problem, such as a fenced `plantuml` snippet or a command. Include the version and environment when known and relevant.
- For a proposal, state the use case, the requested behavior and one concrete example or acceptance criterion when it clarifies scope.
- Add a screenshot or rendered PNG when it makes the issue easier to recognize. Use a small `mermaid` diagram when it clarifies a flow or relationship. Describe the relevant detail in the image's alt text.
- When asked to publish, use `gh issue create` with `--body-file` for the Markdown and `--attach` for any local images. Return the issue URL.
