# excaliplant for Codex

This plugin gives Codex the excaliplant skill. For any UML, PlantUML or other diagram request (sequence, class, activity, state, C4, Gantt, mind map, ER, wireframe) or `.excalidraw` file, Codex writes the PlantUML source and renders it to a hand-drawn Excalidraw scene, an SVG or a PNG with the excaliplant command line tool.

## What it runs

The plugin contains only the skill: Markdown instructions, a short syntax reference and example diagrams. It has no hooks and no MCP server. When Codex renders a diagram it runs `npx -y @grethel-labs/excaliplant`, which downloads the open source package from npm and renders on your machine. Nothing is sent to any other service and no data is collected.

## Install

```
codex plugin marketplace add grethel-labs/excaliplant
```

Then install `excaliplant` from the plugin browser. Without the plugin, `npx @grethel-labs/excaliplant skills install --tool codex` copies the skill to `.agents/skills`.

## Optional MCP server

The same package ships an MCP server (`render_plantuml`, `validate_plantuml`, `list_diagram_types`, `get_example`). Register it with `codex mcp add excaliplant -- npx -y -p @grethel-labs/excaliplant excaliplant-mcp`.

Source, issues and documentation: https://github.com/grethel-labs/excaliplant. Licensed under MIT.
