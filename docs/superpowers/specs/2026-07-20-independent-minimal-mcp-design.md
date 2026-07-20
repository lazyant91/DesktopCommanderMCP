# Lean Standalone Local MCP Design

**Date:** 2026-07-20  
**Repository:** `lazyant91/DesktopCommanderMCP`  
**Starting baseline:** `78f8f4b1cd35ccca8af4a1208f196a0466dc39b0`

## 1. Decision

Transform this fork directly into a lightweight standalone local MCP server.

The final working tree will contain only the source, tests, configuration, documentation, and packaging required for local terminal, process-session, filesystem, and local access-policy tools. It will not retain a wrapper around a second full implementation, a duplicate compatibility executable, or product-specific connection infrastructure.

The implementation strategy is controlled subtraction rather than a from-scratch rewrite. Proven terminal, process, session, file, and path logic remains in place while unrelated product subsystems are removed in bounded pull requests.

## 2. Product identity

The repository describes one product:

> A standalone stdio MCP server that provides local terminal, process-session, filesystem, and configuration tools.

Its architecture is:

```text
MCP Client
    |
    | stdio
    v
Local MCP Server
    |
    +-- local shell and process sessions
    +-- local filesystem operations
    +-- local configuration and access policy
```

The source tree and public documentation must not introduce gateway, proxy, cloud connector, hosted service, remote control, client-specific integration, container deployment, tray host, service installation, or automatic-startup concerns.

## 3. Why subtraction is required

The current fork contains substantially more than the desired local MCP. Product and distribution concerns are intertwined with the useful terminal and filesystem implementation.

The highest-risk code is the runtime behavior that already works in the known baseline:

- long-running and interactive processes;
- stdout and stderr collection;
- prompt and waiting-state detection;
- output pagination and bounded buffering;
- PowerShell and CMD quoting and encoding;
- process completion, interruption, forced termination, and cleanup;
- path validation and file-edit behavior;
- stdio protocol purity.

Rewriting these areas during initial cleanup would combine feature deletion with runtime redesign and make failures difficult to isolate. They are therefore preserved unless a later explicitly approved design replaces them.

## 4. Retained product surface

### 4.1 Terminal and session tools

- `start_process`
- `read_process_output`
- `interact_with_process`
- `force_terminate`
- `list_sessions`

### 4.2 Workspace tools

- `read_file`
- `read_multiple_files`
- `write_file`
- `edit_block`
- `create_directory`
- `list_directory`
- `move_file`
- `get_file_info`

### 4.3 Configuration tools

- `get_config`
- `set_config_value`

The retained configuration continues to cover shell selection, blocked commands, allowed directories, file-read limits, and file-write limits until separately redesigned.

### 4.4 Excluded product surface

The lightweight server does not expose:

- global process enumeration;
- arbitrary PID termination;
- remote-device management;
- external backend integration;
- telemetry or product analytics;
- onboarding, feedback, or prompt catalogs;
- specialized document or media production unless explicitly retained later;
- background search sessions unless explicitly retained later.

## 5. Final repository requirements

The final working tree must:

- have one primary MCP server entrypoint;
- contain no second full original implementation;
- contain no wrapper or proxy to another bundled server;
- use only dependencies required by retained features;
- contain no dead scripts, imports, tests, assets, or documentation for removed features;
- keep required MIT license and attribution notices;
- provide general MCP build, run, configuration, tool, security, and development documentation;
- avoid documentation for any particular MCP client or connection product.

Git history preserves the original fork baseline and supplies rollback. The baseline does not need to remain duplicated in the final source tree.

## 6. Removal sequence

Each slice is implemented in its own branch and pull request. A slice must be coherent enough that the repository remains buildable and reviewable after merge.

### Slice 1 — Product analytics and onboarding removal

Remove:

- telemetry transport and capture calls;
- installation tracking;
- usage analytics and history tools not required by the retained product;
- feedback flows;
- onboarding prompts and state;
- feature flags and A/B tests used only by removed product behavior.

Preserve terminal, file, configuration, and stdio behavior.

### Slice 2 — Remote and external backend removal

Remove:

- remote-device source and scripts;
- external backend clients and configuration;
- remote-specific metadata and call attribution;
- device management scripts and dependencies.

The server remains a local stdio MCP only.

### Slice 3 — Specialized document and media removal

Remove, subject to the approved retained-feature list:

- PDF creation and editing;
- DOCX-specific parsing and editing;
- spreadsheet-specific parsing and editing;
- image-preview and binary-display specialization;
- URL-reading specialization;
- browser or renderer acquisition used only by removed features.

Retain reliable text-file workflows.

### Slice 4 — Nonessential search and global process tools

Remove:

- global process listing;
- arbitrary PID termination;
- background search-session management;
- search-specific binaries and dependencies when no retained code requires them.

Retain only sessions owned by the local MCP.

### Slice 5 — UI and resource surface

The configuration UI is an unresolved product decision. Before this slice begins, choose one:

- retain a small local configuration UI; or
- remove all MCP App UI/resources and manage settings through tools and the configuration file.

File-preview UI and unrelated product UI are not retained by default.

### Slice 6 — Packaging and repository cleanup

Remove or replace:

- client-specific setup and uninstall flows;
- release and publish automation not required for the standalone project;
- product testimonials and promotional assets;
- unrelated plugins, copied skills, and integration guides;
- obsolete package scripts, build steps, assets, tests, and dependencies.

Rewrite package metadata and README around the standalone local MCP only.

### Slice 7 — Final consistency pass

Perform repository-wide consistency cleanup:

- eliminate dead imports and exports;
- remove obsolete configuration keys and migrations;
- remove stale names and descriptions;
- confirm the tool catalog matches handlers and schemas;
- confirm package contents include only runtime requirements;
- confirm documentation matches the actual final product.

This slice must not redesign runtime behavior.

## 7. Pull request workflow

### 7.1 Implementation

For each slice:

1. create a dedicated feature branch from current `main`;
2. document the exact base SHA and slice boundaries;
3. implement only that slice;
4. update affected tests, package metadata, dependencies, scripts, and documentation;
5. run available focused build or test commands in the implementation environment;
6. open or update a Draft PR;
7. record known runtime behavior that remains unverified.

No intermediate PR claims complete Windows or end-to-end runtime validation.

### 7.2 Independent review

A separate review agent reviews the complete PR diff and checks:

- the change stays within the approved slice;
- retained terminal and file paths were not altered incidentally;
- all removed code references are eliminated;
- package scripts and dependencies remain internally consistent;
- tests were not weakened beyond what removal requires;
- documentation describes only the standalone local MCP;
- security and privacy behavior did not regress;
- no workflow automation was introduced.

Blocking findings must be resolved and reviewed again. The review concludes with exactly one of:

- `Review passed: YES`
- `Review passed: NO`

### 7.3 Merge

When the review records `Review passed: YES`:

1. ensure no blocking review thread remains unresolved;
2. mark a Draft PR ready for review;
3. squash merge into `main`;
4. delete the feature branch when tooling permits.

Intermediate merge approval is based on bounded implementation evidence and independent code review, not local end-to-end validation.

## 8. No GitHub Actions

Do not add, restore, enable, or modify GitHub Actions workflows.

During this project phase:

- `.github/workflows/` must not be introduced or expanded;
- hosted CI is not a merge requirement;
- PR descriptions must clearly state that no hosted CI evidence exists;
- implementation tests and independent review are the available intermediate evidence.

## 9. Consolidated final validation

Perform local validation once, after all planned slices are merged and the repository has reached the intended lightweight structure.

The validation target is one exact `main` SHA. The validator must not modify the repository.

The final validation covers the complete retained product:

- clean install and build from the documented requirements;
- MCP initialize and complete `tools/list`;
- exact retained tool surface;
- one-shot PowerShell success and non-zero exit;
- stdout and stderr capture;
- long-running process output;
- interactive input;
- normal completion and forced termination;
- owned child-process cleanup;
- paths containing spaces and Korean characters;
- bounded file reads and writes;
- exact block editing;
- directory creation, listing, movement, and metadata;
- allowed-directory acceptance and rejection;
- configuration read and update behavior;
- server shutdown with no unexpected owned process, temporary resource, listener, or active handle;
- clean worktree at the end.

The report must distinguish confirmed results from untested assumptions and conclude with:

- `Release validation: PASS`; or
- `Release validation: FAIL`.

A failure produces a focused bug-fix PR, separate review, squash merge, and a new consolidated validation on the new exact head.

## 10. Risk controls without per-slice local validation

Deferring local validation increases the chance that integration defects accumulate. The project controls that risk by:

- keeping every PR small and subsystem-bounded;
- avoiding terminal and process-runtime rewrites;
- requiring complete reference cleanup within each slice;
- requiring independent review before every merge;
- recording unverified runtime risks in each PR;
- using squash merges for straightforward rollback and history;
- postponing the final readiness claim until consolidated validation passes.

A code review approval proves diff quality and consistency, not actual host-runtime behavior.

## 11. Security principles

- The server runs with the permissions of its local user.
- Allowed-directory checks constrain structured filesystem tools but are not a complete shell sandbox.
- Blocked-command filtering is advisory and must not be described as a complete security boundary.
- The server must not transmit telemetry or product-usage data.
- Logs must avoid secrets, full file contents, and unnecessary command output.
- The server must not terminate processes it does not own through its retained session tools.
- No global or persistent host change is part of normal installation or validation.

## 12. Deferred decisions

The following require explicit approval before implementation:

- whether the local configuration UI remains;
- whether `read_multiple_files` remains after real use;
- whether background content search is eventually restored in a simpler form;
- whether configuration defaults or empty allowed-directory semantics change;
- whether the package and MCP server identity are renamed;
- whether terminal or filesystem internals are ever replaced rather than retained.

## 13. Success condition

The project is complete only when:

- all planned slices have passed independent review and been squash merged;
- the final working tree contains only the lightweight standalone local MCP;
- no GitHub Actions workflow has been added;
- public documentation contains no unrelated integration context;
- the consolidated exact-head local validation records `Release validation: PASS`.
