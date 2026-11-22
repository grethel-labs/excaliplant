# excaliplant for Claude

This plugin gives Claude the excaliplant skill. Whenever you ask for a UML, PlantUML or other diagram (sequence, class, activity, state, C4, Gantt, mind map, ER, wireframe) or want to work with an `.excalidraw` file, Claude writes the PlantUML source and renders it to a hand-drawn Excalidraw scene, an SVG or a PNG with the excaliplant command line tool.

## What it runs

The plugin contains only the skill: Markdown instructions, a short syntax reference and example diagrams. It has no hooks, no agents and no bundled MCP server. When Claude renders a diagram it runs `npx -y @grethel-labs/excaliplant`, which downloads the open source package from npm and renders on your machine. Nothing is sent to any other service and no data is collected.

## Install

In Claude Code:

```
/plugin marketplace add grethel-labs/excaliplant
/plugin install excaliplant@grethel-labs
```

## Optional MCP server

The same package ships an MCP server with the tools `render_plantuml`, `validate_plantuml`, `list_diagram_types` and `get_example`. Add it with:

```
claude mcp add excaliplant -- npx -y -p @grethel-labs/excaliplant excaliplant-mcp
```

Source, issues and documentation: https://github.com/grethel-labs/excaliplant. Licensed under MIT.
