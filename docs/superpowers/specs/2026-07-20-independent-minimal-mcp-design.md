# Independent Minimal Desktop Commander MCP Design

**Date:** 2026-07-20  
**Repository:** `lazyant91/DesktopCommanderMCP`  
**Known-working reference:** upstream-compatible `main` at `78f8f4b1cd35ccca8af4a1208f196a0466dc39b0`  
**Reference package version:** `0.2.46`

## 1. Decision

Build and validate an independent customized MCP server in this fork before considering any integration with `mcp-junction`.

The first implementation must not rewrite the existing terminal, process-session, file, or path-handling logic. Instead, it adds a small alternate MCP entrypoint that starts the known-working Desktop Commander server as a stdio child and exposes only an approved subset of its tools.

This creates a controlled migration path:

1. preserve the known-working implementation;
2. establish a small, independently testable product surface;
3. use the filtered server through the OpenAI Tunnel Client and Web ChatGPT;
4. collect differential and real-use evidence;
5. remove bounded feature groups from the child implementation one slice at a time;
6. replace complex internals only after equivalent behavior is independently proven.

`mcp-junction`, Docker, service installation, tray applications, and automatic startup are explicitly out of scope.

## 2. Context and risk

The fork contains a broad product, not only a shell MCP. The current entrypoint and server combine terminal sessions, file operations, remote-device support, Supabase, telemetry, installation tracking, onboarding, feedback, prompts, feature flags, PDF/DOCX/Excel support, MCP App UI resources, setup/removal flows, and release tooling.

The most failure-prone behavior is not MCP registration itself. It is the Windows runtime behavior around:

- long-running and interactive processes;
- stdout/stderr collection;
- prompt and waiting-state detection;
- timeout behavior;
- output pagination and bounded buffering;
- PowerShell/CMD quoting and encoding;
- Ctrl+C, forced termination, descendants, and orphan prevention;
- stdio protocol purity through the Tunnel Client.

Reimplementing those behaviors before a reliable independent baseline exists would create a large failure surface and make responsibility difficult to identify. The design therefore favors preservation, filtering, and differential validation over immediate cleanup or rewrite.

## 3. Goals

### 3.1 First implementation slice

Produce an independently runnable stdio MCP executable that:

- runs on the current Windows host without Docker;
- connects directly to the OpenAI Tunnel Client;
- starts the existing `dist/index.js` server as its owned child process;
- disables telemetry through the existing environment kill switch;
- disables onboarding through the existing CLI flag;
- exposes only a fixed approved tool allowlist;
- forwards approved tool schemas and calls without changing their semantics;
- rejects every non-approved tool locally without forwarding it;
- cleans up the child server when the wrapper exits;
- preserves the original executable for baseline comparison.

### 3.2 Migration goal

Reach a smaller independently owned MCP by removing or replacing one bounded subsystem at a time, with the original executable retained until the customized executable passes the corresponding differential and real-use checks.

## 4. Non-goals

The first implementation slice will not:

- integrate with or import code from `mcp-junction`;
- delete existing Desktop Commander source files;
- remove package dependencies;
- rewrite terminal or process-session management;
- rewrite file access or edit logic;
- change shell defaults, output limits, blocked commands, or allowed-directory semantics;
- expose the MCP App settings/file-preview UI;
- forward resources, prompts, or UI metadata as a product requirement;
- implement a new configuration format;
- enumerate all host processes or terminate arbitrary PIDs;
- install a Windows service, modify PATH, or change persistent host settings;
- claim feature parity from unit tests alone.

## 5. Product surface

### 5.1 Required retained terminal tools

The minimal executable must expose:

- `start_process`
- `read_process_output`
- `interact_with_process`
- `force_terminate`
- `list_sessions`

### 5.2 Required retained workspace tools

The minimal executable must expose:

- `read_file`
- `read_multiple_files`
- `write_file`
- `edit_block`
- `create_directory`
- `list_directory`
- `move_file`
- `get_file_info`

### 5.3 Required retained configuration tools

The minimal executable must expose:

- `get_config`
- `set_config_value`

These preserve current configuration behavior without requiring the MCP App settings UI in the first slice.

### 5.4 Explicitly hidden tools

The minimal executable must not expose or forward:

- `list_processes`
- `kill_process`
- `write_pdf`
- `start_search`
- `get_more_search_results`
- `stop_search`
- `list_searches`
- `get_usage_stats`
- `get_recent_tool_calls`
- `give_feedback_to_desktop_commander`
- `get_prompts`
- `track_ui_event`

Any additional upstream tool not present in the fixed allowlist is hidden by default. An upstream update must not silently expand the product surface.

## 6. Architecture

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

### 6.1 Wrapper server

The wrapper is both:

- an MCP server toward the Tunnel Client; and
- an MCP client toward the existing Desktop Commander child.

It owns the child lifecycle and exposes only the approved tools.

### 6.2 Startup sequence

1. Start with stdout reserved exclusively for MCP JSON-RPC.
2. Construct the child command using the current Node executable and absolute path to the built baseline entrypoint.
3. Set child environment variable:
   - `DESKTOP_COMMANDER_DISABLE_TELEMETRY=1`
4. Pass child argument:
   - `--no-onboarding`
5. Connect an MCP client to the child over stdio.
6. Fetch all pages of `tools/list` from the child.
7. Verify that every required allowlisted tool exists.
8. Build the downstream tools list by selecting the allowlisted upstream tool definitions unchanged.
9. Connect the wrapper MCP server to its own stdio transport.
10. Report readiness only after upstream initialization and tool verification succeed.

If required tools are missing, startup fails closed. The wrapper must not expose a partial product surface without an explicit future design.

### 6.3 Tool listing

For downstream `tools/list`:

- return only allowlisted tools;
- retain the upstream name, description, input schema, annotations, and safe metadata needed for normal invocation;
- do not include UI resource metadata in the first slice;
- support MCP pagination correctly even if the initial implementation has fewer tools than one page.

### 6.4 Tool calls

For downstream `tools/call`:

1. check the requested name against the fixed allowlist;
2. reject hidden or unknown names locally;
3. forward approved calls to the child with the original arguments;
4. return the child result without semantic rewriting;
5. preserve `isError`, text, image, resource, and structured content forms supported by the installed SDK;
6. write diagnostics only to stderr.

The wrapper must not log complete file content, secrets, command output, or arbitrary tool arguments by default.

### 6.5 Resources and prompts

The first slice advertises only the capabilities it implements. It does not proxy:

- `resources/list`
- `resources/read`
- `resources/templates/list`
- `prompts/list`
- `prompts/get`

This intentionally removes the current MCP App settings and file-preview UI from the minimal executable while leaving the original executable unchanged for baseline use.

### 6.6 Shutdown

On stdin closure, SIGINT, SIGTERM, uncaught startup failure, or normal server close, the wrapper must:

1. stop accepting new tool calls;
2. close the upstream MCP client/transport;
3. wait for the owned child to exit;
4. escalate only for the exact child it owns if graceful close does not complete within the defined timeout;
5. remove listeners and timers;
6. exit with no unexpected child process or active handle.

The first slice must not attempt to kill unrelated PowerShell, CMD, Node, or user processes.

## 7. Proposed source layout

```text
src/minimal/
├── index.ts                 # executable bootstrap and stdio purity
├── minimal-server.ts        # downstream MCP server and handlers
├── upstream-client.ts       # owned Desktop Commander child connection
├── tool-policy.ts           # fixed allowlist and fail-closed checks
├── tool-catalog.ts          # pagination and selected tool-definition snapshot
├── lifecycle.ts             # shutdown coordination
└── errors.ts                # sanitized startup/call error mapping

test/minimal/
├── tool-policy.test.ts
├── tool-catalog.test.ts
├── minimal-server.test.ts
├── upstream-client.test.ts
└── fixtures/
    └── fixture-mcp-server.ts
```

Exact paths may follow existing repository test conventions, but responsibilities must remain separated.

## 8. Package and execution changes

Add an alternate binary while preserving the original binary:

```json
{
  "bin": {
    "desktop-commander": "dist/index.js",
    "desktop-commander-minimal": "dist/minimal/index.js"
  }
}
```

Add development scripts conceptually equivalent to:

```json
{
  "scripts": {
    "start:minimal": "node dist/minimal/index.js",
    "inspector:minimal": "npx @modelcontextprotocol/inspector dist/minimal/index.js"
  }
}
```

The exact build output path must be confirmed from `tsconfig.json` before implementation. The original `start`, `inspector`, and package binary remain unchanged.

The first implementation slice must not remove dependencies or alter the existing build pipeline beyond what is necessary to emit the alternate entrypoint and its tests.

## 9. Configuration behavior

The child continues using the current Desktop Commander configuration storage and semantics. The wrapper itself has no mutable product configuration in the first slice except the source-controlled tool allowlist.

Initial operational expectations:

- telemetry is disabled by environment for every child launch;
- onboarding is disabled by flag;
- current `allowedDirectories`, shell, blocked commands, and read/write limits remain authoritative;
- an empty `allowedDirectories` array retains its current upstream meaning until a later explicit security migration;
- the wrapper does not claim that blocked commands or allowed directories form a complete shell sandbox.

The real Windows account permissions remain the ultimate authority for shell commands.

## 10. Error responsibility model

The wrapper must make failure location observable without exposing secrets.

### 10.1 Wrapper startup failure

Examples:

- child executable path missing;
- upstream MCP initialize fails;
- required tool missing;
- malformed or incomplete paginated catalog;
- child exits during startup.

Classify as wrapper/upstream-startup failure and exit non-zero.

### 10.2 Local policy rejection

A hidden tool requested by a client is rejected by the wrapper without contacting the child. This is a wrapper policy result, not an upstream failure.

### 10.3 Forwarded tool failure

If an approved tool returns `isError` or an MCP call error, preserve the upstream result and identify it as an upstream tool failure. Do not transform it into apparent wrapper success.

### 10.4 Environment failure

When both the original executable and minimal executable fail under the same input and host state, classify the cause as baseline/environmental until evidence isolates the wrapper.

## 11. Testing strategy

### 11.1 Unit tests

Unit tests must prove:

- the allowlist is exact and immutable at runtime;
- unknown tools are hidden and rejected;
- required tools missing from the upstream catalog fail startup;
- paginated upstream tool catalogs are fully consumed;
- selected tool definitions preserve schemas and annotations;
- approved calls are forwarded once with unchanged arguments;
- hidden calls are never forwarded;
- downstream capabilities do not advertise resources or prompts;
- startup and call errors are sanitized;
- shutdown is idempotent.

### 11.2 Fixture integration tests

Use a deterministic fixture MCP child to prove:

- stdio initialization;
- paginated `tools/list`;
- `tools/call` pass-through;
- structured errors;
- child startup failure;
- child exit during an active call;
- wrapper shutdown and child cleanup;
- stdout contains only valid MCP protocol frames.

These tests establish wrapper correctness but do not prove Desktop Commander or Windows behavior.

### 11.3 Baseline differential tests

Build the same fork head and run both:

- original: `node dist/index.js --no-onboarding`
- minimal: `node dist/minimal/index.js`

Use the same configuration and environment, with telemetry disabled for both.

Compare at least:

- initialize result;
- retained tool names;
- retained input schemas and annotations;
- one-shot PowerShell success;
- non-zero exit behavior;
- stdout and stderr capture;
- long-running output reads;
- interactive input;
- normal process completion;
- forced termination;
- file read/write/edit results;
- spaces and Korean characters in paths;
- allowed-directory rejection.

Expected difference: the minimal executable exposes fewer tools and no MCP App resources/prompts. Retained tool behavior must otherwise match unless an intentional difference is documented.

### 11.4 Real Tunnel Client validation

A separate Windows validation agent must validate the exact implementation head through the real path:

```text
Web ChatGPT -> OpenAI Tunnel Client -> minimal executable -> baseline child
```

The validation must include:

- successful Tunnel readiness;
- exact visible tool surface;
- a real read-only Web ChatGPT tool call;
- a one-shot PowerShell call;
- a bounded temporary-file write/edit/read cycle;
- a long-running or interactive session;
- forced termination;
- Tunnel Client shutdown;
- no orphaned wrapper, baseline child, shell child, temporary file, port, or unexpected active handle;
- clean worktree.

Implementation-agent tests do not replace this validation.

## 12. Security and privacy

- Always launch the baseline child with `DESKTOP_COMMANDER_DISABLE_TELEMETRY=1`.
- Never execute the installation-tracking script as part of the wrapper flow.
- Do not emit complete tool arguments or results to logs by default.
- Do not add external network services.
- Do not make global or persistent host changes.
- Reject tools outside the allowlist before forwarding.
- Preserve the upstream MIT license and notices.
- Treat command blocklists as advisory, not as a complete security boundary.

## 13. Incremental removal roadmap

Each item is a separate design, implementation, and exact-head validation slice.

### Slice A — Minimal filtered executable

Add the wrapper described in this document. Delete nothing.

### Slice B — Remove outbound product behavior from the customized path

After Slice A real-use success, stop importing or executing telemetry, installation tracking, feedback, onboarding, and feature flags in the customized path. Preserve the original baseline executable.

### Slice C — Remove remote-device path from the customized build

Remove remote-device and Supabase dependencies only after proving the minimal executable does not rely on them.

### Slice D — Remove document/UI specializations

Remove PDF, DOCX, Excel, image-preview, URL-reading, and MCP App UI code from the customized build in bounded groups. Retain plain text/workspace behavior.

### Slice E — Simplify packaging and repository content

Remove Claude-specific setup/remove flows, release publishing tools, testimonials, and unrelated plugin/skill content after the runtime product is stable.

### Slice F — Consider internal replacement

Only after sustained real use and differential coverage, decide whether replacing terminal/session/file internals is justified. This is not an assumed endpoint.

## 14. Success criteria for the first slice

The first implementation slice is successful only when all of the following are true:

- original executable remains runnable;
- minimal executable builds and starts independently;
- minimal executable exposes exactly the approved tools;
- hidden tools cannot be called through the wrapper;
- telemetry and onboarding are disabled for the owned child;
- fixture integration tests pass;
- baseline differential checks pass for retained tools;
- real Tunnel Client and Web ChatGPT validation passes on the exact head;
- shutdown leaves no owned orphan process or temporary resource;
- independent validation reports `Merge allowed: YES`.

## 15. Rollback

The first slice is additive. Rollback consists of stopping use of the minimal executable and continuing to invoke the unchanged original `dist/index.js` entrypoint.

No migration of user configuration or project files is required. This low-cost rollback is a core reason for selecting the wrapper-first design.

## 16. Deferred decisions

The following decisions require real-use evidence and are deliberately deferred:

- whether the settings MCP App UI should return;
- whether search tools are necessary;
- whether `read_multiple_files` should remain;
- whether allowed-directory empty semantics should change;
- whether the fork should eventually rename its package and MCP identity;
- whether the original executable should later be removed;
- whether `mcp-junction` integration is useful or safe.
