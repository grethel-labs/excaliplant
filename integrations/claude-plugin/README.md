# excaliplant for Claude

This plugin gives Claude the excaliplant skill. Whenever you ask for a UML, PlantUML or other diagram (sequence, class, activity, state, C4, Gantt, mind map, ER, wireframe) or want to work with an `.excalidraw` file, the assistant writes the PlantUML source and renders it to a hand-drawn Excalidraw scene, an SVG or a PNG with the excaliplant command line tool.

## Example prompts

- "Draw a sequence diagram of a login flow with a token refresh and give me an SVG."
- "Turn this PlantUML into an editable `.excalidraw` file I can open in excalidraw.com."
- "Make a C4 container diagram of a web app, an API and a database as a PNG in the blueprint theme."

## What it runs, sends and fetches

The plugin contains only the skill: Markdown instructions, a short syntax reference and example diagrams. It has no hooks, no agents, no scripts and no bundled MCP server, and it reads no credentials.

The skill runs only when you ask for a diagram or a diagram file. Then the assistant runs `npx -y @grethel-labs/excaliplant`, which downloads the open source package from the npm registry (registry.npmjs.org) and renders on your machine. The package's dependencies (`@resvg/resvg-js` with a prebuilt binary for your platform, `elkjs`, `roughjs` and their helpers) come from the same registry, none of them runs an install script, and the `-y` only confirms npx's own prompt for this package. That download is the only network access: the diagram text never leaves your machine, nothing is sent to any other service, and no data about you or your diagrams is collected. If the assistant cannot run commands at all, it gives you a link to the live editor (https://grethel-labs.github.io/excaliplant/) with your diagram in the part of the URL after `#`, which your browser never sends to a server.

## Install

In Claude Code:

```
/plugin marketplace add grethel-labs/excaliplant
/plugin install excaliplant@grethel-labs
```

## Troubleshooting

- **"npx: command not found" or an old Node.js:** excaliplant needs Node.js 20 or newer; install it and try again.
- **No network or no npm access in the environment:** the assistant cannot download the package; it should show you the PlantUML and a link to the live editor instead.
- **`warning (line N)` in the output:** a line was not understood. Ask the assistant to fix that line, or paste the source into the live editor to see the problem.
- **Layout looks crowded:** ask for shorter labels, `left to right direction`, or to split the diagram.

## Optional MCP server

The same package ships an MCP server with the tools `render_plantuml`, `validate_plantuml`, `list_diagram_types` and `get_example`. Add it with:

```
claude mcp add excaliplant -- npx -y -p @grethel-labs/excaliplant excaliplant-mcp
```

## Support, security and privacy

- Questions and bugs: https://github.com/grethel-labs/excaliplant/issues
- Security reports (private): https://github.com/grethel-labs/excaliplant/security/advisories/new, see https://github.com/grethel-labs/excaliplant/blob/main/SECURITY.md
- Privacy: nothing is collected, see `PRIVACY.md` in this folder (also https://github.com/grethel-labs/excaliplant/blob/main/PRIVACY.md)

In short: there are no accounts, no analytics, no cookies and no telemetry. The skill itself stores nothing and sends nothing; the only network access is the npm download described above, and the optional link to the live editor keeps your diagram in the part of the URL that browsers never send. `PRIVACY.md` lists, for each part of excaliplant, what happens to your text and which third parties (npm, GitHub) are involved.

Source and documentation: https://github.com/grethel-labs/excaliplant. Licensed under MIT.
