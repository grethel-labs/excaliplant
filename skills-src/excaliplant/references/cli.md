# CLI reference

```text
npx -y @grethel-labs/excaliplant [input.puml] [-o output] [options]
```

`npx -y` downloads and runs the package without installing it. After `npm install -g @grethel-labs/excaliplant` the same command is just `excaliplant`. Node.js 20 or newer is required.

## Options

```text
{{help}}
```

## Input

Pass a file, or leave it out (or pass `-`) to read standard input:

```sh
npx -y @grethel-labs/excaliplant -f svg < diagram.puml > diagram.svg
```

The first `@start…@end` block is rendered. `--all` renders every block and `--page n` picks a page of a document with `newpage`:

```sh
npx -y @grethel-labs/excaliplant blocks.puml --all -o out-{n}.svg
```

## Projects

Pass a directory or use `--project <dir>` to discover complete diagram files.
Nested includes are relative to the file that contains them. Use `--all` for
multiple entries, or give one file relative to the project root to choose it.

```sh
npx -y @grethel-labs/excaliplant --project docs --all -o diagram-{n}.svg
npx -y @grethel-labs/excaliplant --project docs diagrams/main.puml -o main.svg
```

For Markdown, use `markdown --include-dir <dir>` and an empty
`plantuml {src="diagrams/main.puml"}` fence to render a file relative to the
Markdown document. Inline fences can also use local `!include`.

## Output

The format comes from the extension of `-o` (`.svg`, `.png`, anything else is Excalidraw JSON) or from `-f excalidraw|svg|png`. Without `-o` the result is written to stdout; PNG refuses to write to a terminal.

```sh
npx -y @grethel-labs/excaliplant diagram.puml -o diagram.excalidraw
npx -y @grethel-labs/excaliplant diagram.puml -o diagram.svg -t dark
npx -y @grethel-labs/excaliplant diagram.puml -o diagram.png --width 1600 --background "#ffffff"
npx -y @grethel-labs/excaliplant diagram.puml -o clean.svg --clean
```

SVG output embeds the Excalifont font, so it renders the same everywhere. PNG is rasterised from that SVG: `--width` sets the pixel width, `--scale` a factor relative to the SVG size.

## Preprocessor

Predefine variables with `-D` and allow local `!include` in a single-file
invocation with `--include-dir`.

```sh
npx -y @grethel-labs/excaliplant main.puml --include-dir . -D ENV=prod -o main.svg
```

## Strictness and diagnostics

Unrecognised lines are reported on stderr as `warning (line N): …` and the diagram is still rendered. With `--strict` they fail the run instead; `-q` silences warnings.

```sh
npx -y @grethel-labs/excaliplant diagram.puml -o diagram.svg --strict
```

Failures print `excaliplant: <message>` and exit with code 1.

## Diagram kinds

`--list-types` prints the supported kinds, their start keywords and titles:

```text
{{listTypes}}
```
