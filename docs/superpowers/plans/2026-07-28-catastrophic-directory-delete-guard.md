# Catastrophic Directory Delete Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a narrow pre-execution guard that validates PowerShell and CMD directory deletion syntax, blocks ambiguous commands, and never permits filesystem-root deletion.

**Architecture:** A focused parser classifies the configured shell and validates only recognized PowerShell and CMD directory deletion commands. A small runtime installer wraps terminal execution and interactive input without changing the public MCP tool surface or implementing a general shell parser.

**Tech Stack:** TypeScript, Node.js 18+, existing Local MCP process manager and JavaScript test runner.

## Global Constraints

- Keep ordinary file deletion and non-deletion terminal commands unchanged.
- Support PowerShell `Remove-Item`, `del`, `erase`, `rm`, `ri`, `rd`, and `rmdir` directory forms and CMD `rd` and `rmdir`.
- Allow only one direct top-level deletion command with one static target; reject chained, compound, `call`, and nested-interpreter deletion.
- Reject malformed quoting, unsupported shell escapes or options, missing or multiple targets, variables, wildcards, drive-relative paths, provider/expression syntax, and filesystem roots.
- Apply the same check to initial process commands and input sent to owned PowerShell or CMD sessions; require fully qualified paths for interactive deletion input.
- Track directly launched nested PowerShell/CMD sessions using their actual input shell and prune stale PID contexts.
- Do not add a general PowerShell or CMD parser, sandbox, approval UI, or configurable root-delete bypass.

---

### Task 1: Guard parser and tests

**Files:**
- Create: `src/directory-delete-guard.ts`
- Test: `test/test-directory-delete-guard.js`

**Interfaces:**
- Produces: `classifyDirectoryDeleteShell(shellPath)` and `validateDirectoryDeleteCommand(command, shellPath, cwd)`.

- [ ] Write failing tests for shell classification, valid routine deletions, malformed syntax, dynamic targets, and root targets.
- [ ] Run the focused test and confirm it fails because the guard module does not exist.
- [ ] Implement the bounded tokenizer, shell-specific grammar checks, path normalization, and root detection.
- [ ] Run the focused test and confirm it passes.

### Task 2: Runtime enforcement

**Files:**
- Create: `src/directory-delete-guard-runtime.ts`
- Modify: `src/index.ts`
- Test: `test/test-directory-delete-guard-runtime.js`

**Interfaces:**
- Consumes: `validateDirectoryDeleteCommand` and `formatDirectoryDeleteGuardError`.
- Produces: `installDirectoryDeleteGuard(manager?)`.

- [ ] Write failing tests for blocked initial execution, blocked interactive input, allowed routine deletion, and idempotent installation.
- [ ] Implement a narrow wrapper around terminal execution and input methods.
- [ ] Install the wrapper during server startup before any tool calls can execute.
- [ ] Run the focused runtime test and confirm it passes.

### Task 3: Documentation and full verification

**Files:**
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `CHANGELOG.md`

- [ ] Document the supported PowerShell/CMD boundary and explicit limitations.
- [ ] Run `npm run build`.
- [ ] Run `npm test`.
- [ ] Run `npm run test:integration`.
- [ ] Run `npm pack --dry-run --ignore-scripts`.
