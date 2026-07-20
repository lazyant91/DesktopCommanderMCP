# Frequently Asked Questions

## What is this project?

It is a standalone stdio MCP server for local terminal sessions, text-file operations, directory operations, and configuration.

## Does it require a hosted service?

No. The server runs locally and communicates with an MCP client through stdin and stdout.

## Does it send telemetry or usage data?

No. Telemetry, installation tracking, usage analytics, onboarding, feedback collection, and remote feature flags are not part of this project.

## Which MCP clients are supported?

Any client capable of launching a standard stdio MCP server can use it. Client-specific installation and configuration instructions are intentionally outside this repository.

## Where is configuration stored?

The default location is:

```text
~/.local-mcp-server/config.json
```

Configuration can be read and changed through `get_config` and `set_config_value`.

## Can file access be restricted?

Yes. `allowedDirectories` restricts the structured filesystem tools to configured roots. An empty list currently means unrestricted structured file access.

This is not a complete sandbox because terminal commands run with the permissions of the user who started the server.

## What does the command blocklist protect against?

It reduces accidental execution of explicitly blocked command names. It is not a security boundary and can be bypassed through alternate interpreters, absolute paths, scripts, or shell composition.

## Can it manage every process on the machine?

No. The public process tools operate only on sessions created and owned by this server. Host-wide process enumeration and arbitrary PID termination are intentionally excluded.

## How are long-running commands handled?

`start_process` returns initial output and a session identifier. The process can continue running after the initial response. Use `read_process_output` to page through later output, `interact_with_process` to send input, and `force_terminate` to stop the owned session.

## Does it support interactive shells and REPLs?

The retained terminal subsystem is designed for interactive process sessions. Exact host behavior depends on the operating system, selected shell, and process being launched.

## Which file formats are supported?

The structured tools focus on local text files, directory operations, and generic binary metadata. Specialized PDF, DOCX, spreadsheet, image-preview, and URL-reading implementations are excluded.

## How does `edit_block` work?

It replaces an exact `old_string` with `new_string`. The optional `expected_replacements` value prevents an edit when the number of matches differs from the caller's expectation. Fuzzy matching is not performed.

## Can it search a codebase?

There is no dedicated background search subsystem. Search commands available on the host can be run through an owned terminal session.

## Why is there no lockfile?

The previous lockfile described the removed upstream product dependency graph and did not match the current package version. It was deleted rather than manually rewritten without executing a package manager. A deterministic lock can be generated from the final dependency graph in a package-manager-capable environment.

## Is the server sandboxed?

No. It runs with the permissions of the local operating-system user. Use a separate account, virtual machine, or dedicated workstation when stronger isolation is required.

## How do I report a problem?

Open an issue in this repository with:

- the operating system and Node.js version;
- the exact server revision;
- the tool call or command that failed;
- relevant stderr output;
- a minimal reproduction that excludes secrets and private file contents.
