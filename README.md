# Local MCP Server

[![Release](https://img.shields.io/github/v/release/lazyant91/DesktopCommanderMCP?display_name=tag&sort=semver)](https://github.com/lazyant91/DesktopCommanderMCP/releases)
[![License](https://img.shields.io/github/license/lazyant91/DesktopCommanderMCP)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](package.json)
[![MCP transport](https://img.shields.io/badge/MCP-stdio-5A67D8)](#architecture)

A standalone, client-agnostic Model Context Protocol server for local terminal sessions, text files, directories, and local configuration.

Version **1.0.0** is the first stable release of this independent lightweight fork. The repository name is retained for fork history, while the package and MCP server identity are `@lazyant91/local-mcp-server` and `local-mcp-server`.

## Why this fork exists

This project was derived from [wonderwhy-er/DesktopCommanderMCP](https://github.com/wonderwhy-er/DesktopCommanderMCP), an MIT-licensed open-source project by Eduard Ruzga and contributors. The fork started from upstream commit `78f8f4b1cd35ccca8af4a1208f196a0466dc39b0` (upstream version `0.2.46`).

The upstream project had grown into a broad product with remote services, analytics, UI resources, specialized document handlers, client-specific installers, and packaging for several environments. This fork was created to preserve the proven local terminal and filesystem core while removing product layers that are unnecessary for a small local execution server.

The result is a headless stdio MCP server with a fixed surface of 15 tools. It does not depend on a hosted backend and does not provide a gateway, tunnel, browser bridge, embedded UI, telemetry, onboarding, or client-specific installation flow.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the complete attribution record and [CHANGELOG.md](CHANGELOG.md) for the v1.0.0 change summary.

## What changed after the fork

### Retained and hardened

- Local shell commands and long-running process sessions
- Interactive process input and bounded output pagination
- Local text-file reads, writes, exact block edits, directory operations, and metadata
- Canonical path checks and configurable structured-file roots
- Protocol-safe stdio transport and startup log buffering
- Windows-focused process, terminal-buffer, and filesystem validation

### Removed

- Remote-device, cloud-backend, gateway, proxy, and hosted-service integrations
- Telemetry, install tracking, analytics, feedback, onboarding, feature flags, and experiments
- MCP App resources, file-preview UI, and client-specific rendering metadata
- Specialized PDF, DOCX, spreadsheet, image-preview, and URL-reading handlers
- Background search sessions and bundled ripgrep management
- Host-wide process enumeration and arbitrary PID termination
- Docker installers, editor plugins, client-specific setup scripts, release tooling, and obsolete media assets

Equivalent operations can still be performed through `start_process` when an appropriate command-line tool is installed on the host. For example, Git, tmux, ripgrep, PowerShell, Python, and build tools can be invoked as ordinary local commands.

## Architecture

```text
MCP Client
    |
    | stdio
    v
Local MCP Server
    |
    +-- owned terminal and process sessions
    +-- local text files and directories
    +-- local configuration and access policy
```

The server communicates only through stdin and stdout. Stdout is reserved for MCP JSON-RPC messages. Plain console output is converted to MCP logging notifications so it cannot corrupt the protocol stream. See [docs/STDIO_TRANSPORT.md](docs/STDIO_TRANSPORT.md).

## Requirements

- Node.js 18 or newer
- npm
- A trusted MCP client capable of starting a stdio server

The server runs with the permissions of the operating-system user that launches it.

## Installation from source

```bash
git clone https://github.com/lazyant91/DesktopCommanderMCP.git
cd DesktopCommanderMCP
npm ci
npm run build
```

Start the server directly:

```bash
node dist/index.js
```

The GitHub release also includes an npm-compatible `.tgz` package artifact. The repository does not assume that the package has been published to a public npm registry.

## MCP client configuration

Every client uses a different configuration location, but the stdio command is the same. Point the client at the built `dist/index.js` file with an absolute path.

```json
{
  "mcpServers": {
    "local-mcp-server": {
      "command": "node",
      "args": ["/absolute/path/DesktopCommanderMCP/dist/index.js"]
    }
  }
}
```

Windows example:

```json
{
  "mcpServers": {
    "local-mcp-server": {
      "command": "node",
      "args": ["C:\\path\\to\\DesktopCommanderMCP\\dist\\index.js"]
    }
  }
}
```

Restart or reconnect the MCP client after changing its configuration. Browser or remote connectivity requires an external transport chosen by the user; it is not implemented by this repository.

## Public tools

### Configuration

| Tool | Purpose |
| --- | --- |
| `get_config` | Return effective local configuration and host information. |
| `set_config_value` | Update one supported local configuration value. |

### Files and directories

| Tool | Purpose |
| --- | --- |
| `read_file` | Read a bounded range of lines from a local text file. |
| `read_multiple_files` | Read multiple local text files. |
| `write_file` | Rewrite or append text content. |
| `edit_block` | Replace an exact text block with occurrence-count protection. |
| `create_directory` | Create a directory and missing parent directories. |
| `list_directory` | List a directory tree to a bounded depth. |
| `move_file` | Move or rename a file or directory. |
| `get_file_info` | Return file or directory metadata. |

### Terminal sessions

| Tool | Purpose |
| --- | --- |
| `start_process` | Start an owned local command or interactive process. |
| `read_process_output` | Read bounded output from an owned session. |
| `interact_with_process` | Send input to an owned interactive session. |
| `force_terminate` | Terminate an owned session. |
| `list_sessions` | List sessions owned by this server. |

The process tools operate only on sessions created by this server. They do not expose a host-wide process list or arbitrary PID termination.

## Configuration

Configuration is stored at:

```text
~/.local-mcp-server/config.json
```

Example:

```json
{
  "blockedCommands": ["format", "mkfs", "diskpart"],
  "allowedDirectories": ["D:\\AI\\projects"],
  "defaultShell": "powershell.exe",
  "fileReadLineLimit": 1000,
  "fileWriteLineLimit": 50
}
```

| Field | Meaning |
| --- | --- |
| `blockedCommands` | Command names rejected by the command guardrail. |
| `allowedDirectories` | Roots allowed for structured file tools. An empty array means unrestricted structured-file access. |
| `defaultShell` | Shell used when a process call does not specify one. |
| `fileReadLineLimit` | Default maximum number of lines returned by file and process reads. |
| `fileWriteLineLimit` | Guidance threshold used for large writes and edits. |

Use `get_config` and `set_config_value` while the server is running. Configuration is isolated from the upstream project's configuration directory.

## Runtime behavior

### Terminal sessions

`start_process` returns initial output and a server-owned session identifier. A command can continue running after the initial timeout and later be observed with `read_process_output`. Interactive shells and REPLs can receive input through `interact_with_process`.

Process output is retained in a bounded server-side buffer and supports offset and length pagination. `force_terminate` accepts only sessions owned by this server.

### Files and paths

Structured file tools are intended for text files, directories, and generic binary metadata. Binary content is not rewritten as text. `edit_block` performs exact replacement and rejects ambiguous occurrence counts; fuzzy editing is intentionally excluded.

Path checks resolve existing paths and the deepest existing ancestor of new destinations before applying `allowedDirectories`. These checks reduce accidental path escapes, but they are not a complete sandbox.

## Privacy and security

The server contains no telemetry, analytics, install tracking, advertising, account system, or server-managed remote backend. Local data is returned to the connected MCP client only when a tool is called. The privacy policy of that client or model provider still applies to anything the client transmits.

Terminal commands can read files, start programs, and access networks with the permissions of the launching user. `allowedDirectories` affects structured file tools, not arbitrary shell commands, and the command blocklist is a guardrail rather than a security boundary.

Read [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) before connecting the server to an account or client that you do not fully trust.

## Development and validation

```bash
npm ci
npm run build
npm test
npm run test:integration
npm pack --dry-run --ignore-scripts
```

The repository intentionally does not use GitHub Actions as a merge or release gate. Changes are developed in bounded branches, independently reviewed, squash merged, and validated locally on an exact `main` SHA before release.

Runtime-sensitive changes require target-host validation, especially for Windows process lifecycle, shell quoting, interactive input, output buffering, and cleanup.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Project boundaries

This repository intentionally does not implement:

- a gateway, proxy, tunnel, hosted backend, or remote-control service;
- telemetry, usage analytics, onboarding, feedback collection, or experiments;
- embedded UI, preview resources, or client-specific cards;
- specialized PDF, DOCX, spreadsheet, image, or URL handlers;
- background search management;
- host-wide process management;
- Docker, service, tray, auto-start, or editor-specific packaging.

These exclusions keep the MCP server small, predictable, and focused on local execution.

## Documentation

- [CHANGELOG.md](CHANGELOG.md) — release history
- [FAQ.md](FAQ.md) — common usage and scope questions
- [SECURITY.md](SECURITY.md) — threat model and operating guidance
- [PRIVACY.md](PRIVACY.md) — local data handling
- [docs/STDIO_TRANSPORT.md](docs/STDIO_TRANSPORT.md) — protocol-safe stdout behavior
- [CONTRIBUTING.md](CONTRIBUTING.md) — development and review workflow
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — upstream attribution

## License and attribution

This project is distributed under the MIT License. Significant portions were retained or adapted from DesktopCommanderMCP. The upstream copyright notice, baseline revision, and source link are preserved in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

This fork is independently maintained and is not presented as an official upstream release.