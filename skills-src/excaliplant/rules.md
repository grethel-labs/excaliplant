# excaliplant: PlantUML to Excalidraw, SVG and PNG

Use excaliplant whenever the user wants a diagram (UML, PlantUML, flowchart, architecture, C4, Gantt, mind map, ER, wireframe) or an `.excalidraw` file.

1. Write PlantUML between `@startuml` and `@enduml` (mind maps use `@startmindmap`, Gantt `@startgantt`, and so on) and save it as `diagram.puml`. Start with a `title` and keep labels short.
2. Render it. The output format follows the file extension:

   ```sh
   npx -y @grethel-labs/excaliplant diagram.puml -o diagram.excalidraw
   npx -y @grethel-labs/excaliplant diagram.puml -o diagram.svg
   npx -y @grethel-labs/excaliplant diagram.puml -o diagram.png --width 1600
   ```

3. Read stderr: `warning (line N)` means a line was not understood. Fix the source and render again. `--strict` turns warnings into errors.
4. Themes: `-t sketch|plain|hachure|mono|dark|blueprint`. `--clean` draws straight lines.
5. Multiple blocks: `--all -o out-{n}.svg`. Files can only be `!include`d with `--include-dir <dir>`.
6. Mermaid input is not supported; rewrite it as PlantUML. Keep the `.puml` next to the output.
7. If an `excaliplant` MCP server is connected (`npx -y -p @grethel-labs/excaliplant excaliplant-mcp`), use its tools instead of the CLI.
8. If you cannot run commands (no code execution or no npm access), show the PlantUML in a `plantuml` code block and add a link to the live editor: `https://grethel-labs.github.io/excaliplant/#src=` followed by the PlantUML, percent-encoded (`%20` space, `%0A` line break, `%40` @, `%3E` >, `%3A` :, `%2B` +, `%23` #, `%25` %, `%22` "). Keep it short; the text after `#` never leaves the browser.
