# Independent Minimal Desktop Commander MCP Design

**Date:** 2026-07-20  
**Repository:** `lazyant91/DesktopCommanderMCP`  
**Known-working baseline:** `main` at `78f8f4b1cd35ccca8af4a1208f196a0466dc39b0`  
**Reference version:** `0.2.46`

## Decision

Build and validate a customized MCP in this fork before considering `mcp-junction` integration.

The first implementation will not rewrite terminal, session, file, or path logic. It will add a small alternate stdio MCP executable that starts the existing Desktop Commander executable as an owned child and exposes only an approved tool allowlist.

Migration order:

1. preserve the working baseline;
2. add a filtered independent executable;
3. validate it through the real OpenAI Tunnel Client and Web ChatGPT;
4. use it before deleting product code;
5. remove one bounded subsystem per later slice;
6. replace complex internals only after equivalent behavior is proven.

Docker, services, tray applications, automatic startup, and `mcp-junction` are out of scope.

## Why wrapper-first

The current product combines terminal and file tools with remote-device/Supabase support, telemetry, installation tracking, onboarding, feedback, prompts, feature flags, PDF/DOCX/Excel handling, MCP App UI resources, setup/removal flows, and release tooling.

The highest-risk behavior is Windows runtime behavior: interactive processes, stdout/stderr collection, prompt detection, timeouts, output pagination, PowerShell/CMD quoting, Ctrl+C, descendants, cleanup, and stdio protocol purity. Rewriting that before establishing an independent baseline would enlarge the failure surface and obscure responsibility.

The first slice therefore preserves behavior and filters exposure rather than deleting or reimplementing it.

## Goals

The first slice must:

- run directly on the current Windows host;
- connect directly to the OpenAI Tunnel Client;
- start `dist/index.js` as its owned stdio MCP child;
- set `DESKTOP_COMMANDER_DISABLE_TELEMETRY=1` for the child;
- pass `--no-onboarding` to the child;
- expose only a fixed allowlist;
- forward approved schemas and calls without semantic rewriting;
- reject hidden tools without forwarding;
- clean up the child on every wrapper exit path;
- leave the original executable unchanged and runnable.

## Non-goals

The first slice will not:

- import or depend on `mcp-junction`;
- delete existing source or dependencies;
- rewrite process/session/file behavior;
- change shell, blocked-command, allowed-directory, or read/write-limit semantics;
- expose the current settings or file-preview MCP App UI;
- proxy resources or prompts;
- enumerate all host processes or kill arbitrary PIDs;
- install software globally or change persistent host settings;
- claim real compatibility from unit tests alone.

## Approved tool surface

### Terminal

- `start_process`
- `read_process_output`
- `interact_with_process`
- `force_terminate`
- `list_sessions`

### Workspace

- `read_file`
- `read_multiple_files`
- `write_file`
- `edit_block`
- `create_directory`
- `list_directory`
- `move_file`
- `get_file_info`

### Configuration

- `get_config`
- `set_config_value`

Configuration tools preserve current settings without requiring the settings UI.

Every tool not in this allowlist is hidden and rejected. This includes `list_processes`, `kill_process`, PDF tools, background search tools, usage/history tools, feedback, prompts, and UI tracking. Future upstream additions must remain hidden by default.

## Architecture

```text
OpenAI Tunnel Client
        |
        | stdio MCP
        v
minimal wrapper executable
        |
        | MCP client over owned stdio child
        v
existing Desktop Commander executable
        |
        v
PowerShell / CMD / local filesystem
```

The wrapper is an MCP server toward the Tunnel Client and an MCP client toward the existing child.

### Startup

1. Reserve wrapper stdout exclusively for MCP JSON-RPC.
2. Resolve the absolute built path to the baseline entrypoint.
3. Start it with the telemetry kill switch and `--no-onboarding`.
4. Initialize an MCP client over the owned stdio child.
5. Consume every page of upstream `tools/list`.
6. Fail closed if any required tool is missing.
7. Snapshot only allowlisted tool definitions.
8. Connect the downstream stdio server only after upstream verification succeeds.

### Tool listing

Downstream `tools/list` returns only allowlisted tools. It retains upstream names, descriptions, input schemas, annotations, and non-UI metadata required for normal invocation. UI resource metadata is omitted. Pagination remains protocol-correct.

### Tool calls

For `tools/call`, the wrapper:

1. checks the fixed allowlist;
2. rejects hidden or unknown names locally;
3. forwards approved calls exactly once with unchanged arguments;
4. preserves upstream content and `isError` semantics;
5. sends diagnostics only to stderr.

Logs must not contain full file contents, secrets, command output, or arbitrary tool arguments by default.

### Capabilities

The first slice advertises tools only. It does not advertise or proxy resources, resource templates, or prompts. Loss of the current settings/file-preview UI is intentional for the minimal executable; the original executable remains available.

### Shutdown

On stdin closure, SIGINT, SIGTERM, startup failure, or normal close, the wrapper must:

1. reject new calls;
2. close the upstream MCP client and transport;
3. wait for the exact owned child to exit;
4. escalate only against that child after a bounded grace period;
5. remove listeners and timers;
6. leave no unexpected child or active handle.

It must never terminate unrelated PowerShell, CMD, Node, or user processes.

## Proposed source layout

```text
src/minimal/
├── index.ts
├── minimal-server.ts
├── upstream-client.ts
├── tool-policy.ts
├── tool-catalog.ts
├── lifecycle.ts
└── errors.ts

test/minimal/
├── tool-policy.test.ts
├── tool-catalog.test.ts
├── minimal-server.test.ts
├── upstream-client.test.ts
└── fixtures/fixture-mcp-server.ts
```

Responsibilities may follow existing test conventions, but must remain separated.

## Package behavior

Preserve the original binary and add an alternate one:

```json
{
  "bin": {
    "desktop-commander": "dist/index.js",
    "desktop-commander-minimal": "dist/minimal/index.js"
  }
}
```

Add `start:minimal` and `inspector:minimal` scripts after confirming the actual TypeScript output path. Do not remove dependencies or alter the existing build beyond emitting and testing the alternate executable.

## Configuration

The child continues using current Desktop Commander configuration storage and semantics. The wrapper has no mutable product configuration except the source-controlled allowlist.

Operational rules:

- telemetry is always disabled for wrapper-owned children;
- onboarding is always disabled;
- current shell, blocked commands, allowed directories, and limits remain authoritative;
- empty `allowedDirectories` keeps its current upstream meaning until a separate security migration;
- neither allowed directories nor blocked commands are represented as a complete shell sandbox.

## Error responsibility

- **Wrapper startup failure:** missing child path, MCP initialization failure, incomplete catalog, missing required tool, or child exit during startup.
- **Policy rejection:** hidden tool rejected locally without contacting the child.
- **Forwarded failure:** approved upstream call returns an MCP error or `isError`; preserve it as an upstream result.
- **Environment/baseline failure:** both original and minimal fail under the same input and host state until evidence isolates the wrapper.

Errors must identify the stage without exposing secrets or full paths unnecessarily.

## Testing

### Unit tests

Prove:

- exact allowlist behavior;
- unknown tools are hidden and never forwarded;
- required missing tools fail startup;
- paginated catalogs are fully consumed;
- retained schemas and annotations are preserved;
- approved calls are forwarded once with unchanged arguments;
- resources and prompts are not advertised;
- error messages are sanitized;
- shutdown is idempotent.

### Fixture integration tests

A deterministic fixture MCP child must prove initialization, paginated listing, call pass-through, structured errors, startup failure, child exit during a call, cleanup, and protocol-pure stdout.

These tests prove wrapper behavior only.

### Baseline differential validation

Build one exact fork head and compare:

- original: `node dist/index.js --no-onboarding`
- minimal: `node dist/minimal/index.js`

Run both with telemetry disabled and the same configuration. Compare initialize, retained schemas, PowerShell success and non-zero exits, stdout/stderr, long-running output, interactive input, completion, forced termination, file read/write/edit, spaces and Korean characters in paths, and allowed-directory rejection.

Expected intentional differences are fewer tools and no MCP App resources/prompts. Retained tool behavior must otherwise match.

### Real Tunnel validation

A separate Windows validation agent must test the exact implementation head through:

```text
Web ChatGPT -> OpenAI Tunnel Client -> minimal wrapper -> baseline child
```

It must verify Tunnel readiness, exact visible tools, a read-only call, one-shot PowerShell, a temporary write/edit/read cycle, a long-running or interactive session, forced termination, Tunnel shutdown, clean worktree, and absence of owned orphan processes, temporary files, ports, sessions, listeners, or active handles.

Implementation-agent tests do not replace this validation.

## Security and privacy

- Always use the telemetry environment kill switch.
- Never execute installation tracking in the wrapper flow.
- Reject non-allowlisted tools before forwarding.
- Add no external network service.
- Make no global or persistent host changes.
- Preserve the MIT license and upstream notices.
- Treat command filtering as advisory rather than a complete security boundary.

## Later slices

Each later item requires its own design, TDD implementation, and exact-head validation.

1. **Filtered executable:** add the wrapper; delete nothing.
2. **Outbound product behavior:** remove telemetry, tracking, feedback, onboarding, and feature flags from the customized path.
3. **Remote path:** remove remote-device and Supabase from the customized build.
4. **Document/UI specializations:** remove PDF, DOCX, Excel, image/URL, and MCP App UI groups while retaining text/workspace behavior.
5. **Packaging cleanup:** remove Claude-specific setup/remove, release tooling, testimonials, and unrelated plugin/skill content.
6. **Internal replacement decision:** only after sustained real use, decide whether terminal/session/file internals should be replaced at all.

## First-slice success criteria

Success requires all of the following:

- original executable remains runnable;
- minimal executable builds and starts independently;
- visible tools equal the approved allowlist;
- hidden tools cannot be called;
- telemetry and onboarding are disabled for the child;
- unit and fixture integration tests pass;
- retained behavior passes differential checks;
- real Tunnel Client and Web ChatGPT validation passes on the exact head;
- shutdown leaves no owned orphan or temporary resource;
- independent report states `Merge allowed: YES`.

## Rollback

The first slice is additive. Stop invoking the minimal executable and return to the unchanged original `dist/index.js`. No user configuration or project-file migration is required.

## Deferred decisions

Real-use evidence will decide whether to restore a settings UI, retain background search, keep `read_multiple_files`, change empty allowed-directory semantics, rename the package/MCP identity, remove the original executable, or integrate with `mcp-junction`.
