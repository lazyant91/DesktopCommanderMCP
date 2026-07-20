# AGENTS.md

This file applies to the entire `DesktopCommanderMCP` fork.

## Repository role

- This repository is an independent customization fork of `wonderwhy-er/DesktopCommanderMCP`.
- `main` is the known-working upstream reference baseline until a replacement slice is independently verified.
- Do not use `mcp-junction` as an implementation dependency or validation oracle. Integration with `mcp-junction` is out of scope until this MCP works independently through the OpenAI Tunnel Client.
- Preserve the MIT license and upstream copyright notices for copied or retained code.

## Branch and pull request rules

- Do not commit feature or bug-fix work directly to `main`.
- Keep implementation pull requests in Draft while any required local Windows validation gate is unresolved.
- Before merging a Draft pull request, mark it ready for review.
- Merge with squash merge.
- Delete the merged feature branch when tooling permits.
- Never merge an implementation change without identifying the exact upstream reference SHA and the exact fork head SHA that were validated.

## Customization strategy

- Prefer preservation and subtraction over reimplementation.
- Do not rewrite the terminal/session/process implementation in the first customization slices.
- Remove or disable one bounded feature group at a time.
- Every removal must prove that the retained tool surface still behaves like the known-working baseline for the affected scenarios.
- Keep the original baseline executable available until the customized executable passes differential validation.
- Do not couple the customization to `mcp-junction`, Docker, a Windows service, or a tray host during the independent MCP phase.

## Initial retained behavior

The first usable customized server must retain these terminal tools:

- `start_process`
- `read_process_output`
- `interact_with_process`
- `force_terminate`
- `list_sessions`

The first usable customized server should retain these text/workspace tools unless a design explicitly narrows the slice:

- `read_file`
- `read_multiple_files`
- `write_file`
- `edit_block`
- `create_directory`
- `list_directory`
- `move_file`
- `get_file_info`
- `get_config`
- `set_config_value`

Do not expose `list_processes` or `kill_process` in the minimal product surface.

## Features targeted for eventual removal

Remove only through approved, separately verified slices:

- remote-device and Supabase integration;
- telemetry, installation tracking, usage analytics, feedback, onboarding, feature flags, and A/B tests;
- PDF, DOCX, Excel, image-preview, and URL-reading specializations;
- MCP App UI and file/config preview resources, unless later retained by an explicit usability decision;
- Claude-specific setup/remove flows, release tooling, testimonials, and unrelated skills/plugins;
- global process enumeration and arbitrary PID termination;
- background search sessions, unless real use demonstrates a requirement.

## Development quality gates

- Use test-driven development for behavioral changes: add or narrow a failing regression test, observe the expected failure, implement the minimum change, then run focused and broader tests.
- Do not treat successful TypeScript compilation or component tests as proof of Tunnel Client or Web ChatGPT behavior.
- Record confirmed facts, test evidence, hypotheses, and unverified assumptions separately.
- Avoid dependency upgrades during subtraction work unless required for the approved slice.
- Do not change terminal semantics, process detection, output buffering, shell quoting, or shutdown behavior as incidental cleanup.

## Differential validation

For each implementation slice, compare the unmodified baseline and customized executable using the same inputs and environment.

At minimum, relevant slices must compare:

- MCP initialize and paginated `tools/list`;
- retained tool schemas and annotations;
- one-shot PowerShell success and non-zero exit;
- stdout and stderr capture;
- long-running process output reads;
- interactive PowerShell or REPL input;
- process completion and forced termination;
- paths containing spaces and Korean characters;
- bounded file reads, writes, and exact block edits;
- allowed-directory acceptance and rejection;
- Tunnel Client connection and a real Web ChatGPT tool call.

A difference is acceptable only when it is an intentional, documented product change.

## Work-agent and validation-agent separation

Use separate roles for implementation and independent local validation whenever Windows, Tunnel Client, Web ChatGPT, interactive processes, process trees, shell quoting, or host filesystem behavior is part of the acceptance boundary.

### Work agent

A work agent may:

- analyze and instrument the fork;
- edit source, tests, configuration, build scripts, and documentation;
- run focused implementation tests;
- commit and push changes;
- update the pull request.

The work agent must record:

- starting branch and exact SHA;
- starting `git status --short`;
- reproduction or baseline evidence;
- files changed and reasons;
- tests and diagnostics run;
- resulting commit SHA and push result;
- ending `git status --short`.

### Local validation agent

A local validation agent normally may only:

- verify branch and exact SHA;
- collect environment information;
- execute deterministic instructions;
- record output, exit codes, processes, files, ports, handles, and cleanup state;
- report pass or fail against explicit criteria.

It must not modify source, tests, configuration, lockfiles, or scripts without explicit approval to switch roles.

## Local environment restrictions

Do not make persistent host changes without explicit user approval, including:

- global or user PATH changes;
- global package installation;
- registry changes;
- service installation or permanent enablement;
- shell profile changes;
- deletion of pre-existing user resources;
- machine-wide execution-policy or security changes.

Prefer temporary, transaction-owned resources that are removed after validation.

## Merge gate

For changes affecting Windows execution, interactive sessions, process lifetime, Tunnel Client connectivity, or the real Web ChatGPT workflow, merge is allowed only after a separate exact-head Windows validation report states:

`Merge allowed: YES`

The report must also confirm a clean worktree and cleanup of child processes, temporary files, ports, terminal sessions, signal listeners, and other owned resources.
