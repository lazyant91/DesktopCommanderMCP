# AGENTS.md

This file applies to the entire repository.

## Repository role

- This repository must become a standalone, lightweight local MCP server.
- Its product scope is limited to local terminal, process-session, filesystem, and local configuration capabilities.
- Do not add gateway, proxy, tunnel, cloud-connector, hosted-service, client-specific integration, container, tray, service, or automatic-startup concerns unless the user approves a separate future scope.
- Final source, documentation, scripts, package metadata, and examples must describe only the standalone local MCP product.
- Preserve the MIT license and all required upstream copyright notices for retained or adapted code.

## Target architecture

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

The final working tree must not retain a second full upstream implementation, wrapper/proxy architecture, or an unused compatibility copy of the original product.

## Branch and pull request rules

- Do not commit feature, subtraction, refactor, or bug-fix work directly to `main`.
- Keep each pull request limited to one bounded subsystem or cleanup slice.
- Keep a pull request in Draft while implementation or review issues remain unresolved.
- A separate review agent must review the complete PR diff before merge.
- Review feedback must be checked against the actual codebase; do not apply suggestions blindly.
- Merge only after the review has no unresolved blocking findings and records `Review passed: YES`.
- Before merging a Draft PR, mark it ready for review.
- Merge with squash merge.
- Delete the merged feature branch when tooling permits.

## No GitHub Actions

- Do not create, restore, enable, or modify files under `.github/workflows/`.
- Do not depend on GitHub Actions or hosted CI as a merge gate while this rule is active.
- Existing workflow files, if any, must not be activated or expanded without explicit user approval.

## Validation policy

- Do not perform independent Windows/local end-to-end validation for each intermediate PR.
- Intermediate PRs are merged after bounded implementation work and independent code review.
- Implementation-agent builds, type checks, or focused tests are useful development evidence, but they are not final local validation.
- Perform one consolidated local validation only after all planned slimming slices are merged.
- Final validation must target one exact `main` SHA and the complete standalone product.
- If final validation fails, create a focused bug-fix PR, obtain a separate review, squash merge it, and repeat consolidated validation on the new exact head.
- Do not declare the product ready for use until the final report records `Release validation: PASS`.

## Customization strategy

- Prefer direct subtraction and bounded adaptation over a from-scratch rewrite.
- Preserve proven terminal, session, process, file, and path behavior until a separately approved replacement is justified.
- Remove one coherent feature group at a time.
- Do not perform unrelated refactors while removing a subsystem.
- Avoid dependency upgrades during subtraction work unless they are strictly required by the approved slice.
- Every PR must leave the repository internally coherent: no dead imports, unresolved references, obsolete scripts, orphaned tests, misleading documentation, or dependencies retained only for removed code.
- Git history is the rollback mechanism; the final working tree should contain only the lightweight product.

## Retained product capabilities

Unless a later approved design changes the scope, retain these terminal tools:

- `start_process`
- `read_process_output`
- `interact_with_process`
- `force_terminate`
- `list_sessions`

Retain these workspace and configuration tools:

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

Do not expose global process enumeration or arbitrary PID termination in the lightweight product.

## Removal targets

Remove through bounded pull requests:

- remote-device and external backend integrations;
- telemetry, installation tracking, usage analytics, feedback, onboarding, feature flags, and A/B tests;
- PDF, DOCX, Excel, image-preview, and URL-reading specializations unless explicitly retained;
- global process enumeration and arbitrary PID termination;
- background search sessions unless explicitly retained;
- client-specific setup/remove flows, release/publish tooling, testimonials, and unrelated plugin/skill content;
- obsolete package dependencies, scripts, tests, assets, and documentation associated only with removed features.

The configuration UI decision is deferred until explicitly approved. Do not remove or redesign it as incidental cleanup.

## Development quality

- Use test-driven development for behavioral changes and bug fixes: create or narrow a failing regression test, observe the expected failure, implement the minimum change, then run focused tests.
- Pure deletion slices may update or remove tests that exclusively cover removed behavior, but must preserve tests for retained behavior.
- Do not claim that compilation or unit tests prove Windows interactive-process behavior.
- Do not change terminal semantics, process detection, output buffering, shell quoting, encoding, interrupt handling, or shutdown behavior as incidental cleanup.
- Record confirmed facts, implementation evidence, review findings, assumptions, and unverified runtime claims separately.

## Implementation-agent record

For each implementation PR, record in the PR description or handover:

- starting base SHA;
- approved slice and explicit non-goals;
- files and dependencies removed or changed;
- retained behavior potentially affected;
- build, type-check, or focused tests executed and their results;
- known unverified runtime risks;
- final head SHA.

## Review-agent role

The review agent must not modify the PR branch unless the user explicitly approves a role change. It must review:

- whether the diff stays inside the approved slice;
- whether retained tools or runtime paths were changed accidentally;
- whether imports, exports, build scripts, tests, dependencies, assets, and documentation remain consistent;
- whether removed code is still reachable or referenced;
- whether security or privacy behavior regressed;
- whether tests were weakened beyond what the removal requires;
- whether the PR introduces product-specific integration material outside the standalone local MCP scope.

The review result must list blocking findings, non-blocking observations, and conclude with exactly one of:

- `Review passed: YES`
- `Review passed: NO`

## Local environment restrictions

Do not make persistent host changes without explicit user approval, including:

- global or user PATH changes;
- global package installation;
- registry changes;
- service installation or permanent enablement;
- shell profile changes;
- deletion of pre-existing user resources;
- machine-wide execution-policy or security changes.

Prefer temporary, transaction-owned resources that can be removed after the final validation.


<!-- CHATGPT-REMOTE-ONLY:BEGIN -->

## Scope gate — ChatGPT Remote only

**This entire block applies only to work initiated by web ChatGPT through Remote or Local MCP.**

- If this session was started directly by the human operator from a local terminal, this block does not apply.
- A human-started local Codex session must skip directly to `CHATGPT-REMOTE-ONLY:END` and continue with common repository instructions outside this block.
- A task initiated by ChatGPT, Remote, Local MCP, another agent, wrapper, or child process must apply this block.
- An agent must not classify itself as a human-started session or grant itself permission to ignore this block.

### Remote execution mode

- Use Inline Execution in the current web ChatGPT session.
- Do not recommend or select a local Codex CLI-backed Subagent workflow.
- Do not invoke local Codex through a direct command, package launcher, shell, script, wrapper, child process, or another local program.
- When Local MCP refuses a Codex request, do not alter the command or look for a bypass.
- Apply this restriction only to Codex CLI.

### Human-direct Codex boundary

A Codex session manually started by the human operator in a local terminal is outside this block. Remote work must not terminate, modify, impersonate, or take control of that session and must check branch, worktree, and uncommitted-file conflicts before parallel edits.

### Local MCP refusal response

> Local Codex CLI execution was not performed.
>
> This task originated from web ChatGPT, Remote, or Local MCP and must not use or consume the human operator's local Codex subscription quota.
>
> Continue through Inline Execution in the current web ChatGPT session. Do not select a local Codex-backed Subagent and do not work around this refusal.
>
> A separate Codex session started directly by the human operator is outside this Remote-only restriction.

<!-- CHATGPT-REMOTE-ONLY:END -->