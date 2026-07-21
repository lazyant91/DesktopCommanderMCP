# Frequently Asked Questions

## What is Local MCP Server?

It is a standalone stdio Model Context Protocol server that gives a trusted MCP client access to local terminal sessions, text files, directories, and a small local configuration surface.

The public API contains 15 tools. The server is headless and client-agnostic.

## Why was this fork created?

The project was derived from the MIT-licensed DesktopCommanderMCP project. The fork keeps the proven local shell, process-session, filesystem, path, and stdio foundations while removing product features that are unnecessary for a lightweight local execution server.

Removed areas include hosted integrations, telemetry, embedded UI, specialized document handlers, background search management, global process management, Docker packaging, and client-specific installers.

## Is this an official DesktopCommanderMCP release?

No. This is an independently maintained fork. The repository name remains for source history and attribution, but the package and server identities are `@lazyant91/local-mcp-server` and `local-mcp-server`.

## Does it require a hosted service?

No. The server runs locally and communicates with an MCP client through stdin and stdout.

A browser client or remote machine may require an external bridge or transport selected by the user. That connectivity is outside this repository.

## Does it send telemetry or usage data?

No. Telemetry, installation tracking, analytics, onboarding, feedback collection, client identifiers, and remote feature flags are not part of this fork.

Tool results are sent to the connected MCP client when a tool is called. The client's own privacy policy still applies.

## Which MCP clients are supported?

Any trusted client capable of launching a standard stdio MCP server can use it. Client-specific configuration locations differ, so the README provides a generic command rather than maintaining separate installers.

## How do I install it?

Clone the repository and build it:

```bash
git clone https://github.com/lazyant91/DesktopCommanderMCP.git
cd DesktopCommanderMCP
npm ci
npm run build
node dist/index.js
```

Then configure the MCP client to run `node` with the absolute path to `dist/index.js`.

## Is the package published to npm?

The documentation does not assume public npm registry availability. GitHub releases include source and may include an npm-compatible `.tgz` artifact. Building from the repository is the supported baseline.

## Where is configuration stored?

The default location is:

```text
~/.local-mcp-server/config.json
```

Configuration can be read and changed through `get_config` and `set_config_value`.

## Can file access be restricted?

Yes. `allowedDirectories` restricts structured filesystem tools to configured roots. An empty array means unrestricted structured-file access.

This is not a complete sandbox because terminal commands run with the permissions of the user who started the server and are not constrained by `allowedDirectories`.

## What does the command blocklist protect against?

It reduces accidental execution of explicitly blocked command names. It is not a security boundary and can be bypassed through alternate interpreters, scripts, aliases, absolute paths, or shell composition.

## Can it manage every process on the machine?

No. Public process tools operate only on sessions created and owned by this server. Host-wide process enumeration and arbitrary PID termination are intentionally excluded.

## How are long-running commands handled?

`start_process` returns initial output and a session identifier. The process can continue after the initial response. Use `read_process_output` to retrieve later output, `interact_with_process` to send input, and `force_terminate` to stop the owned session.

## Does it support interactive shells and REPLs?

Yes. The retained terminal subsystem supports interactive process sessions. Exact behavior depends on the operating system, selected shell, and program being launched.

## Can it use tmux?

Yes, when tmux is installed in the environment where commands run. The server does not contain special tmux integration; it invokes ordinary commands such as `tmux list-panes`, `tmux capture-pane`, and `tmux send-keys` through `start_process`.

On Windows, tmux is commonly run inside WSL, so commands may be invoked through `wsl.exe`.

## Which file formats are supported by structured tools?

The structured tools focus on local text files, directories, and generic binary metadata. Specialized PDF, DOCX, spreadsheet, image-preview, and URL-reading implementations are excluded.

A command-line utility can still process those formats through an owned terminal session when installed by the user.

## How does `edit_block` work?

It replaces an exact `old_string` with `new_string`. The optional `expected_replacements` value prevents the edit when the number of matches differs from the expectation. Fuzzy matching is not performed.

## Can it search a codebase?

There is no dedicated background search subsystem. Search commands already installed on the host, such as `git grep`, `rg`, `grep`, or PowerShell `Select-String`, can be run through an owned terminal session.

## Why is `package-lock.json` committed?

Version 1.0.0 records the reviewed dependency graph in a lockfile so development and release validation can use `npm ci`. Dependency changes should update the lockfile in the same pull request.

## Is the server sandboxed?

No. It runs with the permissions of the local operating-system user. Use a separate account, virtual machine, or dedicated workstation when stronger isolation is required.

## Why are there no GitHub Actions badges?

This repository intentionally performs review and release validation locally rather than using hosted GitHub Actions. The README shows release, license, runtime, and transport badges without implying hosted CI coverage.

## How do I report a problem?

Open an issue with:

- operating system and Node.js version;
- exact release or commit SHA;
- the tool call or command that failed;
- relevant sanitized output;
- a minimal reproduction that excludes secrets and private file contents.

Security vulnerabilities should follow [SECURITY.md](SECURITY.md) rather than being disclosed publicly.