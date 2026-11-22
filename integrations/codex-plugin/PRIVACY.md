# Privacy

Last updated: 2026-11-22

excaliplant does not collect, store or share personal data. There are no accounts, no analytics, no cookies and no telemetry, in any part of the project. This page says what happens to the text you work with in each part, so you can check it against the code (all of it is open source).

It covers the npm package and command line tool, the MCP server, the agent skill and its Claude Code / Codex plugins, the VS Code extension, the Obsidian plugin, the GitHub Action and the live editor at <https://grethel-labs.github.io/excaliplant/>.

## What happens to your text

| Part                                                        | What happens                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library, command line tool, GitHub Action                   | Diagrams are rendered on your machine. Rendering makes no network requests and reads no files, except `!include` of files below a directory you name.                                                                                                                                                                                                                                                                         |
| MCP server                                                  | Runs on your machine and talks to your assistant over standard input and output. The optional HTTP mode is off by default and, when you turn it on, listens on `127.0.0.1` only. It makes no outgoing requests.                                                                                                                                                                                                               |
| VS Code extension, Obsidian plugin                          | Render inside the editor, offline. They send nothing anywhere.                                                                                                                                                                                                                                                                                                                                                                |
| Agent skill and plugins (Claude Code, Codex)                | Contain instructions, a syntax reference and examples; no hooks, no scripts and no servers. When an assistant renders a diagram for you it uses the MCP tools (if you added the server) or runs `npx -y @grethel-labs/excaliplant`; both download the package from the npm registry. That request is governed by npm's policy; your diagram text is not part of it.                                                           |
| Skill without code execution                                | If the assistant cannot run commands it may give you a link to the live editor with your diagram in the part of the URL after `#`. Browsers never send that part to a server.                                                                                                                                                                                                                                                 |
| Live editor (<https://grethel-labs.github.io/excaliplant/>) | A static page hosted on GitHub Pages. The text is rendered in your browser, in a web worker; after loading, the page makes no network requests except for its own files, and its content security policy forbids others. Your last document and the options are kept in your browser's `localStorage` only; clear the site data to delete them. Share links keep the text in the URL fragment, which is not sent to a server. |

## In short

| Question                              | Answer                                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Categories of personal data collected | None.                                                                                                                                                                       |
| Purposes of use                       | Not applicable, nothing is collected.                                                                                                                                       |
| Categories of recipients              | None. Infrastructure providers (npm, GitHub) serve files to you; they do not receive your diagram text from us.                                                             |
| Retention                             | We retain nothing. The live editor keeps your last document in your own browser (`localStorage`) until you clear the site data.                                             |
| Controls you have                     | Clear the site data of the live editor; use the command line tool, MCP server or editor extensions offline; there is no account to delete and no data to export or correct. |

## Third parties

- **npm** serves the package when you install or run it (`npx`, `npm install`). See the [npm privacy policy](https://docs.npmjs.com/policies/privacy).
- **GitHub** hosts the source, the releases and the live editor (GitHub Pages) and may log technical data such as your IP address when you visit. See the [GitHub privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement). We run no server of our own and have no analytics on the site.
- **VS Code Marketplace, Open VSX, Obsidian** distribute the extension and the plugin; their policies apply to installing them.

## Retention and contact

We receive no data from you, so there is nothing to retain, correct or delete on our side. excaliplant is a general-purpose developer tool and collects nothing from anyone, children included.

Questions about this page: open an issue at <https://github.com/grethel-labs/excaliplant/issues>. Security reports: see [SECURITY.md](https://github.com/grethel-labs/excaliplant/blob/main/SECURITY.md) (private vulnerability reporting). Changes to this page are visible in the repository history.
