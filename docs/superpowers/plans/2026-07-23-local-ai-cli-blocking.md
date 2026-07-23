# Immutable Local AI CLI Blocking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Local MCP process tools from launching local AI agent CLIs through direct commands, common package launchers, shell wrappers, script runtimes, or interactive shell input, regardless of `blockedCommands` configuration.

**Architecture:** Add one dependency-free, pure policy module that tokenizes shell input conservatively and returns a structured immutable-policy decision. Apply it before both `start_process` execution and `interact_with_process` input delivery, while retaining the existing configurable command blocklist as a separate guardrail. Unknown commands remain allowed; policy parsing errors fail closed.

**Tech Stack:** TypeScript, Node.js 18+, existing JavaScript test runner, npm scripts, PowerShell/Windows local validation.

## Global Constraints

- Work only on `feat/block-local-ai-agent-clis`; never commit feature code directly to `main`.
- Do not run Codex, OpenCode, Claude, Gemini, Aider, Cursor Agent, or another local AI CLI while implementing or reviewing.
- Do not add dependencies or GitHub Actions.
- The immutable policy cannot be changed through `blockedCommands`, `set_config_value`, or the config file.
- Block `codex`, `opencode`, `claude`, `gemini`, `aider`, and `cursor-agent`, including normal Windows executable/script suffixes.
- Block official package aliases `@openai/codex`, `opencode-ai`, `@anthropic-ai/claude-code`, `@google/gemini-cli`, and `aider-chat` when invoked through common launchers.
- Cover direct execution, absolute paths, command chains, npm-family launchers, shell wrappers, PowerShell call syntax, script runtimes, and interactive process input.
- Preserve normal Git, npm, Node.js, TypeScript, build, test, and non-agent shell workflows.
- Do not claim OS-level sandboxing: renamed binaries, arbitrary custom wrappers, and execution outside Local MCP remain outside the guarantee.

---

### Task 1: Pure immutable AI-agent invocation policy

**Files:**
- Create: `src/ai-agent-policy.ts`
- Create: `test/test-ai-agent-policy.js`

**Interfaces:**
- Produces: `AiAgentPolicyDecision = { allowed: true } | { allowed: false; agent: string; matchedToken: string; reason: string }`
- Produces: `evaluateAiAgentInvocation(input: string): AiAgentPolicyDecision`
- Produces: `IMMUTABLE_BLOCKED_AI_AGENTS: readonly string[]`

- [ ] **Step 1: Write the failing pure-policy test**

Create `test/test-ai-agent-policy.js` that imports `evaluateAiAgentInvocation` from `../dist/ai-agent-policy.js` and asserts blocking for:

```js
const blocked = [
  'codex exec "review this"',
  'C:\\Users\\user\\AppData\\Roaming\\npm\\codex.cmd exec',
  'OPENCODE run "review"',
  'npx -y @openai/codex@latest exec',
  'npm exec -- @anthropic-ai/claude-code',
  'npm exec --package @google/gemini-cli -- gemini',
  'pnpm dlx opencode-ai run review',
  'yarn dlx @google/gemini-cli',
  'bunx @openai/codex',
  'pipx run aider-chat',
  'uvx aider-chat',
  'python -m aider',
  'node C:\\tools\\codex.js exec',
  'cmd /c "codex exec review"',
  'powershell -Command "claude -p review"',
  'pwsh -c "gemini -p review"',
  'Start-Process -FilePath cursor-agent',
  '& "C:\\tools\\opencode.ps1" run review',
  'git status && codex exec review',
];
```

Assert allowance for:

```js
const allowed = [
  'git status',
  'npm test',
  'npm exec -- eslint .',
  'npx tsc --noEmit',
  'node dist/index.js',
  'python -m pytest',
  'echo codex',
  'Write-Output "claude"',
  'Get-Content .\\docs\\codex-notes.md',
  'npm view @openai/codex version',
];
```

Also assert an empty or whitespace-only input is allowed.

- [ ] **Step 2: Build and run the focused test to verify RED**

Run:

```powershell
npm run build
node test/test-ai-agent-policy.js
```

Expected: the build or test fails because `src/ai-agent-policy.ts` / `dist/ai-agent-policy.js` does not exist.

- [ ] **Step 3: Implement the minimal pure policy module**

Create `src/ai-agent-policy.ts` with:

```ts
export type AiAgentPolicyDecision =
  | { allowed: true }
  | { allowed: false; agent: string; matchedToken: string; reason: string };

export const IMMUTABLE_BLOCKED_AI_AGENTS = [
  'codex',
  'opencode',
  'claude',
  'gemini',
  'aider',
  'cursor-agent',
] as const;

export function evaluateAiAgentInvocation(input: string): AiAgentPolicyDecision {
  // dependency-free shell segmentation, token normalization, wrapper recursion,
  // official package alias recognition, and fail-closed error handling
}
```

Implementation requirements:

- Normalize case, surrounding quotes, slash direction, paths, executable suffixes, and package version suffixes.
- Split command chains only outside quoted strings.
- Inspect command position rather than matching arbitrary argument text, so `echo codex` remains allowed.
- Recognize `npx`, `npm exec`/`npm x`, `pnpm dlx`, `yarn dlx`, `bunx`, `pipx run`, and `uvx` targets.
- Recognize `python -m aider` and agent-named scripts launched with Node/Python/Bun/Deno.
- Recursively inspect `cmd /c|/k`, `powershell|pwsh -Command|-c`, and decoded PowerShell `-EncodedCommand` payloads.
- Recognize PowerShell `Start-Process` and the `&` call operator.
- Limit recursive wrapper inspection to a small fixed depth and return a blocked fail-closed result on parser exceptions.

- [ ] **Step 4: Rebuild and run the focused test to verify GREEN**

Run:

```powershell
npm run build
node test/test-ai-agent-policy.js
```

Expected: all blocked and allowed policy cases pass.

- [ ] **Step 5: Commit the pure policy slice**

```powershell
git add src/ai-agent-policy.ts test/test-ai-agent-policy.js
git commit -m "feat: add immutable local AI CLI policy"
```

---

### Task 2: Enforce the policy at both process entry points

**Files:**
- Modify: `src/command-manager.ts`
- Modify: `src/tools/improved-process-tools.ts`
- Create: `test/test-ai-agent-process-policy.js`

**Interfaces:**
- Consumes: `evaluateAiAgentInvocation(input: string): AiAgentPolicyDecision`
- Preserves: `commandManager.validateCommand(command: string): Promise<boolean>`
- Produces user-facing policy errors beginning with `Error: Local AI agent CLI execution is disabled by immutable policy`.

- [ ] **Step 1: Write failing process-entry tests**

Create `test/test-ai-agent-process-policy.js` that:

```js
import assert from 'node:assert/strict';
import { configManager } from '../dist/config-manager.js';
import { startProcess, interactWithProcess } from '../dist/tools/improved-process-tools.js';

await configManager.setValue('blockedCommands', []);

const direct = await startProcess({ command: 'codex exec review', timeout_ms: 100 });
assert.equal(direct.isError, true);
assert.match(direct.content[0].text, /immutable policy/i);

const wrapped = await startProcess({
  command: 'powershell -Command "npx -y @openai/codex exec review"',
  timeout_ms: 100,
});
assert.equal(wrapped.isError, true);
assert.match(wrapped.content[0].text, /immutable policy/i);

const interactive = await interactWithProcess({
  pid: 2147483000,
  input: 'opencode run review',
  timeout_ms: 100,
});
assert.equal(interactive.isError, true);
assert.match(interactive.content[0].text, /immutable policy/i);

const normalInput = await interactWithProcess({
  pid: 2147483000,
  input: 'git status',
  timeout_ms: 100,
});
assert.equal(normalInput.isError, true);
assert.doesNotMatch(normalInput.content[0].text, /immutable policy/i);
```

- [ ] **Step 2: Build and run the focused test to verify RED**

Run:

```powershell
npm run build
node test/test-ai-agent-process-policy.js
```

Expected: direct start may be blocked only by configurable behavior or may execute, and interactive input reaches the nonexistent-session error rather than immutable-policy denial.

- [ ] **Step 3: Apply immutable enforcement with clear errors**

In `src/command-manager.ts`, import `evaluateAiAgentInvocation` and deny immutable violations before reading `blockedCommands`, preserving the boolean API for future callers.

In `src/tools/improved-process-tools.ts`, add a small formatter:

```ts
function immutablePolicyError(input: string): ServerResult | null {
  const decision = evaluateAiAgentInvocation(input);
  if (decision.allowed) return null;
  return {
    content: [{
      type: 'text',
      text: `Error: Local AI agent CLI execution is disabled by immutable policy (${decision.agent}).`,
    }],
    isError: true,
  };
}
```

Call it:

- in `startProcess` before telemetry and before `commandManager.validateCommand`;
- in `interactWithProcess` after argument parsing but before output snapshots or `sendInputToProcess`.

Do not log or echo full command contents in the immutable-policy error.

- [ ] **Step 4: Rebuild and run both focused tests to verify GREEN**

Run:

```powershell
npm run build
node test/test-ai-agent-policy.js
node test/test-ai-agent-process-policy.js
node test/test-blocked-commands.js
node test/test-blocklist-bypass.js
```

Expected: all focused policy and existing blocklist tests pass.

- [ ] **Step 5: Commit process-entry enforcement**

```powershell
git add src/command-manager.ts src/tools/improved-process-tools.ts test/test-ai-agent-process-policy.js
git commit -m "feat: enforce AI CLI policy on process input"
```

---

### Task 3: Document the immutable boundary and current aliases

**Files:**
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `CHANGELOG.md`
- Create: `test/test-ai-agent-policy-docs.js`

**Interfaces:**
- Documents that `blockedCommands` remains configurable but cannot disable the built-in AI-agent policy.
- Documents the exact supported agent commands and the explicit non-sandbox limitations.

- [ ] **Step 1: Write the failing documentation contract test**

Create `test/test-ai-agent-policy-docs.js` and assert that README and SECURITY contain:

```js
for (const required of [
  'immutable AI agent CLI policy',
  'blockedCommands cannot disable',
  'codex',
  'opencode',
  'claude',
  'gemini',
  'aider',
  'cursor-agent',
  'renamed binaries',
  'outside Local MCP',
]) {
  assert.ok(combinedDocs.toLowerCase().includes(required.toLowerCase()), required);
}
```

Assert CHANGELOG includes an `[Unreleased]` section describing the new immutable policy without changing package version `1.0.0`.

- [ ] **Step 2: Run the documentation test to verify RED**

Run:

```powershell
node test/test-ai-agent-policy-docs.js
```

Expected: FAIL because the approved policy is not yet documented.

- [ ] **Step 3: Update README, SECURITY, and CHANGELOG**

README changes:

- Add an `Immutable AI agent CLI policy` subsection under configuration or security.
- State that the policy blocks the six approved agent commands and common official package launch routes.
- State explicitly: `blockedCommands cannot disable this policy`.
- Explain that ordinary Git/npm/build/test commands remain available.
- Explain limits: renamed binaries, arbitrary custom wrappers, commands run outside Local MCP, and already-running non-owned processes are not an OS sandbox guarantee.

SECURITY changes:

- Add the immutable policy to defense-in-depth guidance.
- Keep `allowedDirectories` and configurable `blockedCommands` documented as guardrails.
- Advise removing credentials or using OS controls when stronger assurance is required.

CHANGELOG changes:

```md
## [Unreleased]

### Added

- Immutable Local MCP execution policy that blocks common local AI agent CLIs across direct process starts, package launchers, shell wrappers, script runtimes, and interactive process input.
```

- [ ] **Step 4: Run documentation and focused policy tests to verify GREEN**

Run:

```powershell
node test/test-ai-agent-policy-docs.js
npm run build
node test/test-ai-agent-policy.js
node test/test-ai-agent-process-policy.js
```

Expected: all pass.

- [ ] **Step 5: Commit documentation**

```powershell
git add README.md SECURITY.md CHANGELOG.md test/test-ai-agent-policy-docs.js
git commit -m "docs: explain immutable AI CLI blocking"
```

---

### Task 4: Full verification and Draft PR preparation

**Files:**
- Modify only if verification reveals a feature-scoped defect.
- No `.github/workflows/` changes.

**Interfaces:**
- Produces a clean feature branch with implementation evidence and a Draft PR.

- [ ] **Step 1: Run the complete unit suite**

```powershell
npm test
```

Expected: all discovered tests pass, including the three new policy tests.

- [ ] **Step 2: Run integration and package checks**

```powershell
npm run test:integration
npm pack --dry-run --ignore-scripts
```

Expected: all integration tests pass and package inspection contains the compiled policy module.

- [ ] **Step 3: Run static scope and cleanliness checks**

```powershell
git diff --check main...HEAD
git status --short
git diff --name-only main...HEAD
```

Expected:

- no whitespace errors;
- only approved source, tests, docs, spec, and plan files changed;
- no workflow, dependency, package-version, or unrelated terminal semantics changes.

- [ ] **Step 4: Push and create a Draft PR**

```powershell
git push -u origin feat/block-local-ai-agent-clis
gh pr create --draft --base main --head feat/block-local-ai-agent-clis --title "feat: block local AI agent CLIs" --body-file <prepared-pr-body>
```

The PR body must record:

- starting base SHA `c62e1fd900a4db93f62c5db24c866360c27dc101`;
- approved immutable-policy scope and non-goals;
- changed files and no new dependencies;
- focused/full tests and results;
- renamed-binary/custom-wrapper limitation;
- final head SHA;
- `Review passed: PENDING`;
- `Merge allowed: NO`;
- `Release validation: NOT RUN`.

- [ ] **Step 5: Review without local AI CLIs**

Perform a fresh, read-only review in this web GPT session against the full PR diff. Check scope, false positives, wrapper recursion, fail-closed behavior, interactive enforcement, documentation accuracy, and regression risk. Do not use Codex/OpenCode/Claude/Gemini/Aider/Cursor Agent as a reviewer.

Record blocking findings and non-blocking observations and conclude with exactly one of:

```text
Review passed: YES
```

or

```text
Review passed: NO
```

Do not merge until the user explicitly requests or approves merge after review.
