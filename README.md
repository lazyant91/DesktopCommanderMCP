# Local MCP Server

A standalone Model Context Protocol server that exposes local terminal sessions, text-file operations, directory operations, and local configuration over stdio.

The server is intentionally client-agnostic. It does not include a gateway, proxy, remote service, hosted backend, telemetry, onboarding, product UI, container deployment, or client-specific installation flow.

## Architecture

```text
MCP Client
    |
    | stdio
    v
Local MCP Server
    |
    +-- local terminal and owned process sessions
    +-- local text files and directories
    +-- local configuration and access policy
```

## Requirements

- Node.js 18 or newer
- npm
- A local MCP client that can start a stdio server

## Build and run

```bash
npm install
npm run build
node dist/index.js
```

The process communicates exclusively through MCP messages on stdin and stdout. Diagnostic logging is written to stderr.

For protocol inspection during development:

```bash
npm run inspector
```

## Public tools

### Configuration

| Tool | Purpose |
| --- | --- |
| `get_config` | Read the effective local configuration and host information. |
| `set_config_value` | Update one supported configuration value. |

### Files and directories

| Tool | Purpose |
| --- | --- |
| `read_file` | Read a bounded range of lines from a local text file. |
| `read_multiple_files` | Read multiple local text files. |
| `write_file` | Rewrite or append text content. |
| `edit_block` | Replace an exact text block with occurrence-count protection. |
| `create_directory` | Create a directory and missing parents. |
| `list_directory` | List a directory tree to a bounded depth. |
| `move_file` | Move or rename a file or directory. |
| `get_file_info` | Read file or directory metadata. |

### Terminal sessions

| Tool | Purpose |
| --- | --- |
| `start_process` | Start an owned local command or interactive process. |
| `read_process_output` | Read bounded output from an owned session. |
| `interact_with_process` | Send input to an owned interactive session. |
| `force_terminate` | Terminate an owned session. |
| `list_sessions` | List sessions owned by this server. |

The server does not expose host-wide process enumeration or arbitrary PID termination.

## Configuration

Configuration is stored at:

```text
~/.local-mcp-server/config.json
```

Supported fields:

| Field | Meaning |
| --- | --- |
| `blockedCommands` | Command names rejected by the command guardrail. |
| `allowedDirectories` | Roots allowed for structured file tools. An empty list preserves the current unrestricted behavior. |
| `defaultShell` | Shell used when a process call does not specify one. |
| `fileReadLineLimit` | Default line limit for file reads. |
| `fileWriteLineLimit` | Guidance threshold for large writes and edits. |

Use `get_config` and `set_config_value` instead of editing the file while the server is running.

## Terminal behavior

Commands are created as server-owned sessions. A command that exceeds the initial response timeout can continue running and be observed with `read_process_output`. Interactive processes can receive input through `interact_with_process`.

Output reads accept offset and length controls so callers can page through long output without returning the entire session buffer at once.

## File behavior

Structured file tools are intended for local text files and generic binary metadata. Binary content is not rewritten as text. `edit_block` performs exact replacement only and rejects ambiguous occurrence counts.

Path checks canonicalize existing paths and the deepest existing ancestor of new destinations before applying allowed-directory rules. These checks reduce accidental path escapes but are not a complete sandbox.

## Security model

This server runs with the permissions of the operating-system user that starts it. Terminal commands can access anything that user can access.

- `allowedDirectories` constrains structured filesystem tools, not arbitrary shell commands.
- The command blocklist is a guardrail, not a security boundary.
- Only connect trusted MCP clients.
- Use a separate operating-system account, virtual machine, or dedicated workstation when stronger isolation is required.

See [SECURITY.md](SECURITY.md) for the full model.

## Development

```bash
npm run build
npm test
npm run test:integration
```

GitHub Actions are intentionally not configured for this repository. Development changes are reviewed through bounded pull requests. Host-level release validation is performed separately.

## Scope exclusions

This repository does not implement:

- remote control or hosted connectivity;
- telemetry, usage analytics, onboarding, or feedback collection;
- MCP App resources or embedded UI;
- PDF, DOCX, spreadsheet, image-preview, or URL-reading specialization;
- background search sessions;
- host-wide process management;
- client-specific setup, uninstall, or auto-update flows.

Equivalent local operations may still be performed through an owned terminal session when the required command-line tools are available.

## License and attribution

This project is distributed under the MIT License. It was derived from the open-source DesktopCommanderMCP project. Required attribution is recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
