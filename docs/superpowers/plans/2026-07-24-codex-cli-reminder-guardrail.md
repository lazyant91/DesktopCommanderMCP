# Codex CLI Reminder Guardrail Implementation Plan

> **For this project:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and perform every task through Inline Execution in the current web ChatGPT session. Do not use or recommend a local Codex CLI-backed subagent.

**Goal:** Add a small Remote-only workflow guardrail that refuses ordinary recognizable Codex CLI launches, reminds web ChatGPT to continue through Inline Execution, and leaves human-direct local Codex sessions and unrelated development tools unaffected.

**Architecture:** A pure `src/codex-guardrail.ts` module performs bounded token inspection for direct Codex executables and the official npm package launch. `start_process` calls it before configurable blocklist validation and process creation; `interact_with_process` calls it only for sessions classified as interactive shells. Reusable project instructions and a marked Remote-only `AGENTS.md` block provide the preventive workflow layer without creating a general shell, runtime, or REPL parser.

**Tech Stack:** TypeScript 5.3, Node.js 18+, ECMAScript modules, MCP SDK result conventions, existing plain-Node test runner, Git worktrees, GitHub CLI.

## PR #26 review amendment

The first independent review identified three ordinary-path omissions. The approved corrections supersede narrower examples later in this original execution plan:

- unquoted LF and CRLF are command-segment boundaries alongside `;`, `|`, and `&`;
- supported `npx` and `npm exec|x` forms remain matches when CLI arguments follow the `@openai/codex` package token;
- CMD `/k` and PowerShell/pwsh `-NoExit` sessions are classified as interactive shells, while CMD `/c` and PowerShell/pwsh `-Command` or `-File` without `-NoExit` remain `other`;
- README wording names only cmd, PowerShell/pwsh, bash, sh, and zsh. Environment-variable assignment prefixes and fish remain explicit non-goals.

No alias state, wrapper recursion, runtime-code parsing, prompt inference, or general shell grammar is added by this amendment.

The second independent review identified one further PowerShell session-classification omission. The approved correction recognizes exactly four PowerShell/pwsh options as consuming one following value: `-ExecutionPolicy`, `-WorkingDirectory`, `-InputFormat`, and `-OutputFormat`. A later self-review confirmed that `-NoExit` keeps the session open only when it appears before the execution target; a trailing `-NoExit` after `-Command`, `-File`, or a positional script is target input. Ordinary `-Command <text>` and `-File <path>` forms, missing option values, and positional script tokens without an effective preceding `-NoExit` remain `other`. Harmless stdin markers also confirmed that exact `-Command -` and `-File -` forms read subsequent input, so those two fixed forms are `shell`. PowerShell option abbreviations, additional value-consuming options, POSIX value-consuming shell options, backtick/caret continuation, and heredoc parsing remain non-goals.

The subsequent P0-P2 self-review found that treating backslash as a universal separator escape caused normal Windows path forms such as `C:\;` and a backslash before LF to hide a later direct launch. It also found that treating single quotes as universal segment protection missed ordinary CMD `&` execution because CMD does not use single quotes for quoting, and that CMD session classification must stop at the first `/c` or `/k` host-mode token because later occurrences belong to command text. The bounded segmenter therefore treats double-quote-external `;`, `|`, `&`, LF, and CRLF as boundaries regardless of a preceding backslash or single quote. Tokenization still accepts single-quoted direct tokens. PowerShell/POSIX single-quoted separator data and POSIX backslash continuation semantics remain deliberately unparsed and may produce conservative refusals.

The same self-review clarified two documentation contracts: Local MCP process calls contain no trusted origin metadata, so every matching call through the guarded process tools receives the reminder; and supported package-launch prefixes are limited to optional `npx -y|--yes`, optional `npx --`, and optional `npm exec|x --` positions. It also added two bounded identity rules: one leading CMD echo-control `@` is removed for both launch detection and shell-session classification, whether attached to the executable token or present as the first standalone token, and the exact `@openai/codex` package may carry a non-empty `@<version-or-dist-tag>` suffix without becoming a different package. For POSIX shells, exact `-s` before the execution target is recognized as stdin mode even when later positional script arguments exist; combined short-option bundles and general POSIX option-value parsing remain excluded.

## Global Constraints

- Work only on `feat/codex-cli-reminder-guardrail` in `D:\AI\dcmcp-worktrees\codex-cli-reminder-guardrail`.
- Base the implementation on fetched `origin/main` SHA `c62e1fd900a4db93f62c5db24c866360c27dc101`.
- Do not cherry-pick or copy implementation code from `feat/block-local-ai-agent-clis` or Draft PR #25.
- Restrict only Codex CLI and the official `@openai/codex` package-launch identity.
- Treat the feature as a workflow reminder and accidental-use guardrail, not an operating-system sandbox.
- Do not add a general CMD, PowerShell, POSIX shell, Node.js, Python, Bun, Deno, Base64, alias, source-code, or stateful REPL parser.
- Do not add configuration fields, dependencies, GitHub Actions, host changes, global packages, PATH changes, credential changes, or Codex installation changes.
- Preserve existing `blockedCommands`, terminal/session behavior, package identity, version `1.0.0`, MIT license, and notices.
- Use TDD for behavioral changes: failing regression, observed failure, minimum change, focused pass, commit.
- Keep the replacement PR Draft until an independent exact-head review concludes exactly `Review passed: YES`.
- Do not merge or close PR #25 until the replacement PR is reviewable.
- Final merge is squash merge with branch deletion when possible, followed by exact-`main` validation.

## File Map

- Create `src/codex-guardrail.ts`: pure detector, message, executable normalization, shell classification.
- Modify `src/types.ts`: store `TerminalSessionKind` on active sessions.
- Modify `src/terminal-manager.ts`: classify sessions from the original requested command.
- Modify `src/tools/improved-process-tools.ts`: deny before process creation/stdin delivery.
- Create focused tests:
  - `test/test-codex-guardrail-docs.js`
  - `test/test-codex-guardrail.js`
  - `test/test-codex-process-guardrail.js`
  - `test/test-codex-session-kind.js`
  - `test/test-codex-interactive-guardrail.js`
  - `test/test-codex-guardrail-performance.js`
- Create reusable docs:
  - `docs/templates/chatgpt-project-instructions-template.md`
  - `docs/templates/chatgpt-remote-only-agents-block.md`
- Modify `AGENTS.md`, `README.md`, `SECURITY.md`, and `CHANGELOG.md`.

---

### Task 1: Establish the Remote-only documentation boundary

**Files:**
- Modify: `AGENTS.md`
- Create: `docs/templates/chatgpt-project-instructions-template.md`
- Create: `docs/templates/chatgpt-remote-only-agents-block.md`
- Create: `test/test-codex-guardrail-docs.js`

**Produces:** Exact `CHATGPT-REMOTE-ONLY` markers, a project-independent template, and a reusable block copied exactly into root `AGENTS.md`.

- [ ] **Step 1: Append the approved scope block to root `AGENTS.md`**

Append exactly once, preserving all common repository rules:

```markdown
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

A Codex session manually started by the human operator in a local terminal is outside this block. Remote work must not terminate, modify, impersonate, or take control of that session. It must not change Codex installation, credentials, configuration, or subscription state unless the human operator explicitly requests that separate work, and it must check branch, worktree, and uncommitted-file conflicts before parallel edits.

### Local MCP refusal response

> Local Codex CLI execution was not performed.
>
> Local MCP process calls do not carry trusted origin metadata, so this reminder applies to every matching request and protects the human operator's local Codex subscription quota.
>
> Continue through Inline Execution in the current web ChatGPT session. Do not select a local Codex-backed Subagent and do not work around this refusal.
>
> A separate Codex session started directly by the human operator in a local terminal is outside this Local MCP process-tool guardrail.

<!-- CHATGPT-REMOTE-ONLY:END -->
```

- [ ] **Step 2: Write the missing-template regression**

Create `test/test-codex-guardrail-docs.js`:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const begin = '<!-- CHATGPT-REMOTE-ONLY:BEGIN -->';
const end = '<!-- CHATGPT-REMOTE-ONLY:END -->';
const count = (text, needle) => text.split(needle).length - 1;

function block(text) {
  assert.equal(count(text, begin), 1);
  assert.equal(count(text, end), 1);
  const start = text.indexOf(begin);
  const finish = text.indexOf(end) + end.length;
  assert.ok(start >= 0 && finish > start);
  return text.slice(start, finish).trim();
}

async function run() {
  const [agents, reusable, project] = await Promise.all([
    fs.readFile(path.join(root, 'AGENTS.md'), 'utf8'),
    fs.readFile(path.join(root, 'docs/templates/chatgpt-remote-only-agents-block.md'), 'utf8'),
    fs.readFile(path.join(root, 'docs/templates/chatgpt-project-instructions-template.md'), 'utf8'),
  ]);
  assert.equal(block(agents), block(reusable));
  const opening = block(reusable).split(/\r?\n/).slice(0, 12).join('\n');
  assert.match(opening, /applies only to work initiated by web ChatGPT/i);
  assert.match(opening, /started directly by the human operator/i);
  assert.match(opening, /skip directly to `CHATGPT-REMOTE-ONLY:END`/i);
  assert.match(opening, /must not classify itself/i);
  for (const label of ['Project name:', 'GitHub repository:', 'Local workspace root:', 'Default branch:']) {
    assert.match(project, new RegExp(`- ${label}\\s*$`, 'm'));
  }
  assert.match(project, /Inline Execution/);
  assert.match(project, /do not recommend or select a local Codex CLI-backed Subagent/i);
  assert.match(project, /both markers are present/i);
  assert.match(project, /only one marker is present/i);
  assert.doesNotMatch(project, /DesktopCommanderMCP|mcp-junction|D:\\AI\\MCP/);
  console.log('Codex guardrail documentation contract passed.');
}

run().catch((error) => { console.error(error); process.exit(1); });
```

- [ ] **Step 3: Run and observe missing template files**

```powershell
npm run build
node test/test-codex-guardrail-docs.js
```

Expected: `ENOENT` for one of the two template files.

- [ ] **Step 4: Create `docs/templates/chatgpt-remote-only-agents-block.md`**

Copy the exact marked block from Step 1, with no text outside the markers.

- [ ] **Step 5: Create `docs/templates/chatgpt-project-instructions-template.md`**

Use visibly blank project fields and these sections:

```markdown
# Project fields

- Project name:
- GitHub repository:
- Local workspace root:
- Default branch:
- Optional project rules:
- Optional merge rules:

# ChatGPT execution mode

- These instructions apply when web ChatGPT performs work through Remote or Local MCP.
- Perform implementation through Inline Execution in the current web ChatGPT session.
- Do not recommend or select a local Codex CLI-backed Subagent workflow.
- When origin is unclear, remain in Inline Execution.

# Local Codex CLI reminder

- Do not invoke or consume the human operator's local Codex CLI subscription quota.
- Refused Codex requests are reminders, not failures to bypass.
- Apply this restriction only to Codex CLI unless separately approved.

# Human-direct local Codex boundary

- A Codex session manually started by the human operator is outside the Remote restriction.
- Do not stop, modify, impersonate, or take control of it.
- Do not change Codex installation, credentials, configuration, or subscription state unless the human operator explicitly requests that separate work.
- Check branch, worktree, and uncommitted-file conflicts before parallel work.
- An agent cannot classify itself as human-direct.

# Repository AGENTS.md initialization

- Before any file mutation, Git mutation, build, test, or general local process execution, locate and read the repository-root `AGENTS.md` and ensure the reusable Remote-only block is present.
- The block markers are `<!-- CHATGPT-REMOTE-ONLY:BEGIN -->` and `<!-- CHATGPT-REMOTE-ONLY:END -->`.
- When both markers are present, do nothing.
- When neither marker is present, preserve existing content and append the reusable block once.
- When only one marker is present, report damage and do not repair automatically.
- Read-only exploration used only to locate the repository and inspect instructions does not require creating the block.

# Git, verification, and reporting

- Use a feature branch, keep Draft while blocked, mark ready before merge, squash merge, and delete the merged branch when possible.
- Run relevant tests before claiming completion and report unexecuted validation honestly.
```

- [ ] **Step 6: Run the docs test and commit**

```powershell
node test/test-codex-guardrail-docs.js
git add AGENTS.md docs/templates test/test-codex-guardrail-docs.js
git commit -m "docs: add Remote-only Codex workflow boundary"
```

Expected: test passes and one focused commit is created.

---

### Task 2: Implement the bounded pure detector

**Files:**
- Create: `src/codex-guardrail.ts`
- Create: `test/test-codex-guardrail.js`

**Produces:**

```ts
export type CodexGuardrailDecision =
  | { matched: false }
  | { matched: true; form: 'direct-executable' | 'official-package-launch' };
export type TerminalSessionKind = 'shell' | 'other';
export const CODEX_GUARDRAIL_MESSAGE: string;
export function detectCodexCliLaunch(command: string): CodexGuardrailDecision;
export function isCodexExecutable(value: string): boolean;
export function classifyTerminalSession(command: string): TerminalSessionKind;
```

- [ ] **Step 1: Write `test/test-codex-guardrail.js`**

```js
import assert from 'node:assert/strict';
import { classifyTerminalSession, detectCodexCliLaunch, isCodexExecutable } from '../dist/codex-guardrail.js';

const blocked = [
  'codex', 'codex exec review', 'codex.exe review', 'codex.cmd review', 'codex.ps1 review',
  '"C:\\Program Files\\Codex\\codex.exe" review', 'echo ready && codex review',
  'npx @openai/codex', 'npx --yes @openai/codex',
  'npm exec -- @openai/codex', 'npm x -- @openai/codex',
];
const allowed = [
  'git status', 'npm test', 'node scripts/build.js', 'echo codex', 'rg codex README.md',
  'npm view @openai/codex version', 'npm install @openai/codex --save-dev',
  'node C:\\projects\\codex\\scripts\\build.js', 'node -e "console.log(\'codex\')"',
  'claude --version', 'gemini --version', 'aider --version',
];
for (const command of blocked) assert.equal(detectCodexCliLaunch(command).matched, true, command);
for (const command of allowed) assert.deepEqual(detectCodexCliLaunch(command), { matched: false }, command);
for (const executable of ['codex', 'codex.exe', 'codex.cmd', 'C:\\tools\\codex.exe', '/usr/local/bin/codex']) {
  assert.equal(isCodexExecutable(executable), true, executable);
}
for (const executable of ['node', 'codex-helper', 'my-codex.cmd', 'C:\\projects\\codex\\build.exe']) {
  assert.equal(isCodexExecutable(executable), false, executable);
}
for (const command of ['cmd', 'cmd.exe /d /q', 'powershell -NoLogo', 'pwsh -NoLogo', 'bash -i', 'sh', 'zsh -l']) {
  assert.equal(classifyTerminalSession(command), 'shell', command);
}
for (const command of ['node -i', 'python -i', 'bash script.sh', 'sh -c "echo ok"', 'powershell -Command "Get-Date"', 'cmd /c echo ok']) {
  assert.equal(classifyTerminalSession(command), 'other', command);
}
console.log('Codex guardrail detector tests passed.');
```

- [ ] **Step 2: Build and observe the missing module**

```powershell
npm run build
node test/test-codex-guardrail.js
```

Expected: module-not-found failure for `dist/codex-guardrail.js`.

- [ ] **Step 3: Create `src/codex-guardrail.ts`**

Implement only:

1. quote-aware splitting on `;`, `|`, `||`, `&`, and `&&`;
2. quote-aware whitespace tokenization;
3. portable basename normalization through `path.posix.basename` then `path.win32.basename`;
4. suffix stripping for `.exe`, `.cmd`, `.bat`, and `.ps1`;
5. direct first-token match for normalized basename `codex`;
6. `npx` with optional `-y`/`--yes`, and `npm exec|x` with optional `--`, followed immediately by `@openai/codex`;
7. shell classification for `cmd`, `powershell`, `pwsh`, `bash`, `sh`, and `zsh`, rejecting command/script execution forms such as `/c`, `-Command`, `-File`, and `-c`;
8. this exact stable message:

```ts
export const CODEX_GUARDRAIL_MESSAGE = `Local Codex CLI execution was not performed.

Local MCP process calls do not carry trusted origin metadata, so this reminder applies to every matching request and protects the human operator's local Codex subscription quota.

Continue through Inline Execution in the current web ChatGPT session. Do not select a local Codex-backed Subagent and do not work around this refusal.

A separate Codex session started directly by the human operator in a local terminal is outside this Local MCP process-tool guardrail.`;
```

The module must import only `node:path`, perform no I/O, store no persistent state, and return `{ matched: false }` for non-matches.

- [ ] **Step 4: Run focused tests and commit**

```powershell
npm run build
node test/test-codex-guardrail.js
node test/test-blocked-commands.js
node test/test-blocklist-bypass.js
git add src/codex-guardrail.ts test/test-codex-guardrail.js
git commit -m "feat: detect ordinary Codex CLI launches"
```

Expected: all focused tests pass and existing blocklist behavior is unchanged.

---
### Task 3: Refuse recognized `start_process` launches before execution

**Files:**
- Modify: `src/tools/improved-process-tools.ts`
- Create: `test/test-codex-process-guardrail.js`

**Consumes:** `detectCodexCliLaunch`, `isCodexExecutable`, and `CODEX_GUARDRAIL_MESSAGE`.

**Produces:** A dedicated MCP error before `commandManager.validateCommand` and `terminalManager.executeCommand` for recognized command or shell launches.

- [ ] **Step 1: Write `test/test-codex-process-guardrail.js`**

```js
import assert from 'node:assert/strict';
import { configManager } from '../dist/config-manager.js';
import { CODEX_GUARDRAIL_MESSAGE } from '../dist/codex-guardrail.js';
import { terminalManager } from '../dist/terminal-manager.js';
import { startProcess } from '../dist/tools/improved-process-tools.js';

const originalExecute = terminalManager.executeCommand.bind(terminalManager);
let originalConfig;
let calls = 0;

function assertReminder(result) {
  assert.equal(result.isError, true);
  assert.equal(result.content?.[0]?.text, CODEX_GUARDRAIL_MESSAGE);
  for (const phrase of [
    'Local Codex CLI execution was not performed',
    'local Codex subscription quota',
    'Inline Execution',
    'local Codex-backed Subagent',
    'do not work around this refusal',
    'started directly by the human operator',
  ]) assert.match(result.content[0].text, new RegExp(phrase, 'i'));
}

async function run() {
  originalConfig = await configManager.getConfig();
  terminalManager.executeCommand = async () => {
    calls += 1;
    return { pid: 43210, output: 'safe stub', isBlocked: false };
  };
  await configManager.setValue('blockedCommands', []);

  for (const args of [
    { command: 'codex exec review', timeout_ms: 100 },
    { command: 'npx @openai/codex', timeout_ms: 100 },
    { command: 'echo ready && codex review', timeout_ms: 100 },
    { command: 'echo safe', timeout_ms: 100, shell: 'codex.exe' },
  ]) {
    calls = 0;
    assertReminder(await startProcess(args));
    assert.equal(calls, 0, JSON.stringify(args));
  }

  await configManager.setValue('defaultShell', 'codex.cmd');
  calls = 0;
  assertReminder(await startProcess({ command: 'echo safe', timeout_ms: 100 }));
  assert.equal(calls, 0);

  await configManager.updateConfig({ ...originalConfig, blockedCommands: [] });
  calls = 0;
  const allowed = await startProcess({ command: 'echo codex', timeout_ms: 100 });
  assert.equal(allowed.isError, undefined);
  assert.equal(calls, 1);
  console.log('Codex start_process guardrail tests passed.');
}

run()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    terminalManager.executeCommand = originalExecute;
    if (originalConfig) await configManager.updateConfig(originalConfig);
  });
```

- [ ] **Step 2: Build and observe the expected failure**

```powershell
npm run build
node test/test-codex-process-guardrail.js
```

Expected: a recognized request reaches the stub or returns the old generic behavior.

- [ ] **Step 3: Add imports and two small helpers**

In `src/tools/improved-process-tools.ts` add:

```ts
import {
  CODEX_GUARDRAIL_MESSAGE,
  detectCodexCliLaunch,
  isCodexExecutable,
} from '../codex-guardrail.js';
```

Above `startProcess`, add:

```ts
function codexGuardrailError(): ServerResult {
  return {
    content: [{ type: 'text', text: CODEX_GUARDRAIL_MESSAGE }],
    isError: true,
  };
}

function isRecognizedCodexLaunch(command: string): boolean {
  try {
    return detectCodexCliLaunch(command).matched;
  } catch (error) {
    capture('server_codex_guardrail_error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
```

- [ ] **Step 4: Reorder only the required `startProcess` preflight**

After telemetry capture and before existing configurable validation:

```ts
  if (isRecognizedCodexLaunch(parsed.data.command)) {
    return codexGuardrailError();
  }
```

Resolve `shellUsed` using the existing explicit-shell/defaultShell/platform fallback block before configurable validation. Then add:

```ts
  if (shellUsed && isCodexExecutable(shellUsed)) {
    return codexGuardrailError();
  }
```

After those checks, retain the existing `commandManager.validateCommand` block unchanged. Do not inspect wrapper payloads, shell arguments, environment variables, scripts, or source code.

- [ ] **Step 5: Run focused tests and commit**

```powershell
npm run build
node test/test-codex-process-guardrail.js
node test/test-blocked-commands.js
node test/test-default-shell.js
git add src/tools/improved-process-tools.ts test/test-codex-process-guardrail.js
git commit -m "feat: refuse ordinary Codex process launches"
```

Expected: all tests pass and every recognized case records zero `executeCommand` calls.

---

### Task 4: Store a bounded owned-session classification

**Files:**
- Modify: `src/types.ts`
- Modify: `src/terminal-manager.ts`
- Create: `test/test-codex-session-kind.js`

**Consumes:** `classifyTerminalSession(command)` and `TerminalSessionKind`.

**Produces:** `TerminalSession.sessionKind: 'shell' | 'other'`, available through `terminalManager.getSession(pid)`.

- [ ] **Step 1: Write the real-session regression**

Create `test/test-codex-session-kind.js`:

```js
import assert from 'node:assert/strict';
import { terminalManager } from '../dist/terminal-manager.js';

async function inspect(command, expected) {
  const result = await terminalManager.executeCommand(command, 500);
  assert.ok(result.pid > 0, command);
  const session = terminalManager.getSession(result.pid);
  assert.ok(session, command);
  assert.equal(session.sessionKind, expected, command);
  terminalManager.forceTerminate(result.pid);
}

async function run() {
  await inspect(process.platform === 'win32' ? 'cmd.exe' : 'sh', 'shell');
  await inspect('node -i', 'other');
  console.log('Codex session-kind tests passed.');
}

run().catch((error) => { console.error(error); process.exit(1); });
```

- [ ] **Step 2: Build and observe missing metadata**

```powershell
npm run build
node test/test-codex-session-kind.js
```

Expected: FAIL because `sessionKind` is undefined.

- [ ] **Step 3: Add the type and stored classification**

In `src/types.ts`:

```ts
import type { TerminalSessionKind } from './codex-guardrail.js';
```

Add to `TerminalSession` after `startTime`:

```ts
  sessionKind: TerminalSessionKind;
```

In `src/terminal-manager.ts`:

```ts
import { classifyTerminalSession } from './codex-guardrail.js';
```

Add to the created `TerminalSession` object:

```ts
      sessionKind: classifyTerminalSession(command),
```

Use the original requested command only. Do not classify from output, prompt text, PID, process name lookup, or command history.

- [ ] **Step 4: Run focused tests and commit**

```powershell
npm run build
node test/test-codex-session-kind.js
node test/test-repl-interaction.js
node test/test-owned-terminal-sessions-only.js
git add src/types.ts src/terminal-manager.ts test/test-codex-session-kind.js
git commit -m "feat: classify owned interactive shell sessions"
```

Expected: all tests pass and test sessions terminate.

---

### Task 5: Refuse Codex input only for owned shell sessions

**Files:**
- Modify: `src/tools/improved-process-tools.ts`
- Create: `test/test-codex-interactive-guardrail.js`

**Consumes:** `TerminalSession.sessionKind`, `isRecognizedCodexLaunch`, and `codexGuardrailError`.

**Produces:** Denial before `captureOutputSnapshot` and `sendInputToProcess` only for owned shell sessions.

- [ ] **Step 1: Write `test/test-codex-interactive-guardrail.js`**

```js
import assert from 'node:assert/strict';
import { terminalManager } from '../dist/terminal-manager.js';
import { interactWithProcess } from '../dist/tools/improved-process-tools.js';

const originals = {
  getSession: terminalManager.getSession.bind(terminalManager),
  capture: terminalManager.captureOutputSnapshot.bind(terminalManager),
  send: terminalManager.sendInputToProcess.bind(terminalManager),
};
let kind = 'shell';
let sends = 0;

async function run() {
  terminalManager.getSession = () => ({ sessionKind: kind });
  terminalManager.captureOutputSnapshot = () => ({ totalChars: 0, lineCount: 0 });
  terminalManager.sendInputToProcess = () => { sends += 1; return true; };

  sends = 0;
  const refused = await interactWithProcess({ pid: 70001, input: 'codex exec review', wait_for_prompt: false });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /Inline Execution/);
  assert.equal(sends, 0);

  sends = 0;
  const shellData = await interactWithProcess({ pid: 70001, input: 'echo codex', wait_for_prompt: false });
  assert.equal(shellData.isError, undefined);
  assert.equal(sends, 1);

  kind = 'other';
  sends = 0;
  const replData = await interactWithProcess({ pid: 70002, input: '"codex"', wait_for_prompt: false });
  assert.equal(replData.isError, undefined);
  assert.equal(sends, 1);

  kind = undefined;
  sends = 0;
  const unknown = await interactWithProcess({ pid: 70003, input: 'codex', wait_for_prompt: false });
  assert.equal(unknown.isError, undefined);
  assert.equal(sends, 1);
  console.log('Codex interact_with_process guardrail tests passed.');
}

run()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => {
    terminalManager.getSession = originals.getSession;
    terminalManager.captureOutputSnapshot = originals.capture;
    terminalManager.sendInputToProcess = originals.send;
  });
```

- [ ] **Step 2: Build and observe stdin delivery**

```powershell
npm run build
node test/test-codex-interactive-guardrail.js
```

Expected: FAIL because the shell Codex input reaches the send stub.

- [ ] **Step 3: Add the shell-only preflight**

Immediately after argument destructuring in `interactWithProcess`, before configuration reads and snapshots:

```ts
  const session = terminalManager.getSession(pid);
  if (session?.sessionKind === 'shell' && isRecognizedCodexLaunch(input)) {
    return codexGuardrailError();
  }
```

Do not inspect input for `other` or unknown sessions. Do not infer a shell from prompts and do not add alias, history, lexer, or REPL state.

- [ ] **Step 4: Run focused tests and commit**

```powershell
npm run build
node test/test-codex-interactive-guardrail.js
node test/test-codex-session-kind.js
node test/test-repl-interaction.js
node test/test-node-repl.js
git add src/tools/improved-process-tools.ts test/test-codex-interactive-guardrail.js
git commit -m "feat: remind on Codex input to owned shells"
```

Expected: all tests pass; quoted non-shell REPL data remains allowed.

---
### Task 6: Document the public behavior and limitations

**Files:**
- Modify: `test/test-codex-guardrail-docs.js`
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `CHANGELOG.md`

**Produces:** User-facing documentation that never claims complete enforcement and clearly separates Remote work from human-direct Codex work.

- [ ] **Step 1: Extend the docs regression before editing public docs**

Read `README.md`, `SECURITY.md`, and `CHANGELOG.md` in the existing test and add:

```js
  assert.match(readme, /Codex CLI reminder guardrail/i);
  assert.match(readme, /Inline Execution/);
  assert.match(readme, /human operator.*directly/i);
  assert.match(readme, /not a sandbox/i);
  assert.match(readme, /does not attempt to detect renamed|does not detect renamed/i);

  assert.match(security, /Codex CLI reminder/i);
  assert.match(security, /workflow guardrail/i);
  assert.match(security, /not a security boundary|not a sandbox/i);
  assert.match(security, /human-direct/i);

  assert.match(changelog, /## \[Unreleased\]/);
  assert.match(changelog, /Codex CLI/i);
  assert.match(changelog, /Inline Execution/i);
```

- [ ] **Step 2: Run and observe missing documentation**

```powershell
node test/test-codex-guardrail-docs.js
```

Expected: FAIL on the first missing README, security, or changelog statement.

- [ ] **Step 3: Add the README section under `## Runtime behavior`**

```markdown
### Codex CLI reminder guardrail

When work originates from web ChatGPT through Remote or Local MCP, ordinary recognizable launches of the local Codex CLI are refused before execution. The refusal tells the caller to continue through Inline Execution in the current web ChatGPT session instead of using a local Codex-backed Subagent.

The process tools do not receive trusted origin metadata, so every matching Local MCP process-tool call receives the reminder. The reminder covers direct `codex` launcher names, bounded official `@openai/codex` npm execution forms, and the same commands sent to recognized owned shells. It is independent of the editable `blockedCommands` list. Other AI tools, ordinary Git/npm/build/test commands, package metadata operations, paths containing the word `codex`, and strings in non-shell REPL sessions are not restricted by this feature.

A Codex session that the human operator starts directly in a local terminal is outside this Remote-only rule. The guardrail does not stop or modify that session.

This is an accidental-use workflow guardrail, not a sandbox. It does not attempt to detect renamed binaries, dynamically constructed executable names, custom forwarding scripts, or launches performed outside Local MCP. Use a separate operating-system account or virtual machine when stronger isolation is required.
```

- [ ] **Step 4: Update `SECURITY.md`**

Add this controls-table row:

```markdown
| Codex CLI reminder | Refuse ordinary recognizable Codex launches through Local MCP and direct callers to Inline Execution | No |
```

Add after the table:

```markdown
The Codex CLI reminder is a workflow guardrail for web ChatGPT, Remote, and Local MCP tasks. Local MCP process calls do not carry trusted origin metadata, so every matching guarded call receives the same refusal. It is not a security boundary or sandbox, and it does not apply to a human-direct Codex session manually started by the operator in a separate local terminal.
```

Add under known limitations:

```markdown
- The Codex CLI reminder does not detect renamed binaries, dynamic executable construction, custom forwarding scripts, or commands launched outside Local MCP.
- A hostile caller with general local code-execution capability can bypass name-based workflow reminders.
```

- [ ] **Step 5: Add the changelog entry before `1.0.0`**

```markdown
## [Unreleased]

### Added

- Added a Codex CLI reminder for Remote and Local MCP workflows that refuses ordinary recognizable local Codex launches before execution and directs web ChatGPT workflows to continue through Inline Execution; because process calls carry no trusted origin metadata, every matching guarded call receives the same refusal.
- Added reusable project instructions and a marked `AGENTS.md` scope block that human-direct local Codex sessions can skip.

### Security

- Documented the Codex reminder as an accidental-use workflow guardrail rather than a sandbox or hostile-caller security boundary.
```

- [ ] **Step 6: Run focused tests and commit**

```powershell
node test/test-codex-guardrail-docs.js
node test/test-codex-guardrail.js
node test/test-codex-process-guardrail.js
node test/test-codex-interactive-guardrail.js
git add README.md SECURITY.md CHANGELOG.md test/test-codex-guardrail-docs.js
git commit -m "docs: explain Codex reminder scope"
```

Expected: all tests pass.

---

### Task 7: Add performance regression and complete branch validation

**Files:**
- Create: `test/test-codex-guardrail-performance.js`
- Verify only: `package.json`, `package-lock.json`, `.github/workflows/`, generated `dist/`, local config.

- [ ] **Step 1: Add the bounded performance regression**

Create `test/test-codex-guardrail-performance.js`:

```js
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { detectCodexCliLaunch } from '../dist/codex-guardrail.js';

const commands = [
  'git status',
  'npm test',
  'node scripts/build.js',
  'echo codex',
  'rg codex README.md',
  'npm view @openai/codex version',
  'node C:\\projects\\codex\\scripts\\build.js',
];
const iterations = 20_000;
const started = performance.now();
let matches = 0;
for (let index = 0; index < iterations; index += 1) {
  for (const command of commands) {
    if (detectCodexCliLaunch(command).matched) matches += 1;
  }
}
const elapsedMs = performance.now() - started;
const decisions = iterations * commands.length;
const averageMs = elapsedMs / decisions;
assert.equal(matches, 0);
assert.ok(averageMs < 0.25, `Average detector cost ${averageMs.toFixed(6)}ms exceeded 0.25ms`);
console.log(`Codex guardrail performance passed: ${decisions} decisions in ${elapsedMs.toFixed(2)}ms (${averageMs.toFixed(6)}ms average).`);
```

- [ ] **Step 2: Build and run all focused tests**

```powershell
npm run build
node test/test-codex-guardrail-docs.js
node test/test-codex-guardrail.js
node test/test-codex-process-guardrail.js
node test/test-codex-session-kind.js
node test/test-codex-interactive-guardrail.js
node test/test-codex-guardrail-performance.js
```

Expected: all six modules pass; the performance average is below `0.25ms` per decision.

- [ ] **Step 3: Snapshot local configuration**

```powershell
$configPath = Join-Path $HOME '.local-mcp-server\config.json'
$beforeConfigHash = if (Test-Path $configPath) { (Get-FileHash $configPath -Algorithm SHA256).Hash } else { 'MISSING' }
$beforeConfigHash
```

Record the value.

- [ ] **Step 4: Run complete unit and integration suites**

```powershell
npm test
npm run test:integration
```

Expected: every discovered unit and integration test passes. Record exact totals and durations.

- [ ] **Step 5: Verify package contents**

```powershell
npm pack --dry-run --ignore-scripts --json | Tee-Object .codex-guardrail-pack.json | Out-Null
$pack = Get-Content .codex-guardrail-pack.json -Raw | ConvertFrom-Json
$paths = $pack[0].files.path
if (-not ($paths -contains 'dist/codex-guardrail.js')) { throw 'dist/codex-guardrail.js missing' }
if (-not ($paths -contains 'dist/codex-guardrail.d.ts')) { throw 'dist/codex-guardrail.d.ts missing' }
Remove-Item .codex-guardrail-pack.json
```

Expected: both generated files are packaged and the temporary file is removed.

- [ ] **Step 6: Verify configuration preservation**

```powershell
$afterConfigHash = if (Test-Path $configPath) { (Get-FileHash $configPath -Algorithm SHA256).Hash } else { 'MISSING' }
"before=$beforeConfigHash"
"after=$afterConfigHash"
if ($beforeConfigHash -ne $afterConfigHash) { throw 'Local MCP config changed during validation' }
```

- [ ] **Step 7: Verify approved scope**

```powershell
git diff --check
git diff origin/main...HEAD -- package.json package-lock.json .github/workflows
git diff --stat origin/main...HEAD
git status --short
```

Expected: no whitespace errors, no protected-file diff, and only the approved detector, integration, tests, templates, AGENTS block, and docs.

- [ ] **Step 8: Commit the performance regression and record the exact feature head**

```powershell
git add test/test-codex-guardrail-performance.js
git commit -m "test: bound Codex reminder detector cost"
npm run build
node test/test-codex-guardrail-performance.js
git diff --check
git status --short
git rev-parse HEAD
git log --oneline origin/main..HEAD
```

Expected: clean tree and exact feature head recorded.

---

### Task 8: Open a replacement Draft PR and request independent review

**Files:** No repository changes expected.

- [ ] **Step 1: Confirm the exact branch state**

```powershell
git fetch origin
git status --short
git branch --show-current
git rev-parse origin/main
git rev-parse HEAD
git log --oneline origin/main..HEAD
```

Expected: clean `feat/codex-cli-reminder-guardrail`; any movement in `origin/main` is reviewed before proceeding.

- [ ] **Step 2: Push without touching the preserved broad-parser branch**

```powershell
git push -u origin feat/codex-cli-reminder-guardrail
```

Do not force-push or modify `feat/block-local-ai-agent-clis`.

- [ ] **Step 3: Create a Draft PR**

Create a temporary PR body that records:

- goal and actual incident;
- accidental-use threat model;
- direct executable/official package/owned-shell scope;
- explicit non-goals and “not a sandbox” limitation;
- Codex-only restriction;
- human-direct local Codex boundary;
- base and exact head SHAs;
- focused/full test totals, package check, config hash preservation, and `git diff --check`;
- no dependencies, version, workflows, or host changes;
- these gates:

```text
Review passed: NO
Merge allowed: NO
Release validation: NOT RUN
```

Then run:

```powershell
gh pr create --draft --base main --head feat/codex-cli-reminder-guardrail --title "Add Remote-only Codex CLI reminder guardrail" --body-file .pr-body-codex-guardrail.md
Remove-Item .pr-body-codex-guardrail.md
```

- [ ] **Step 4: Verify local, remote, and PR heads match**

```powershell
$localHead = git rev-parse HEAD
$remoteHead = git rev-parse origin/feat/codex-cli-reminder-guardrail
$prHead = gh pr view --json headRefOid --jq .headRefOid
if ($localHead -ne $remoteHead -or $localHead -ne $prHead) { throw 'PR head mismatch' }
gh pr view --json number,state,isDraft,mergeable,url
```

Expected: all SHAs match and the PR is open and Draft.

- [ ] **Step 5: Request independent complete-diff review**

Provide the separate reviewer with the exact base/head, approved spec, complete diff, explicit non-goals, and validation evidence. Require blocking findings, non-blocking observations, and exactly one conclusion:

```text
Review passed: YES
```

or

```text
Review passed: NO
```

The reviewer must not invoke the human operator's local Codex CLI. Keep the PR Draft while review is pending or blocking findings remain.

---

### Task 9: Resolve review, supersede PR #25, merge, and validate exact `main`

- [ ] **Step 1: Match the review to the exact PR head**

```powershell
$currentHead = git rev-parse HEAD
$prHead = gh pr view --json headRefOid --jq .headRefOid
if ($currentHead -ne $prHead) { throw 'Review is stale or PR head differs' }
```

Accept the merge gate only for an exact-head conclusion of `Review passed: YES`.

- [ ] **Step 2A: For `Review passed: NO`, repair only by focused TDD**

For each blocking finding: reproduce with a failing test, observe failure, apply the minimum in-scope fix, run focused/full tests, commit, push, update evidence, and obtain a new complete-diff review. Do not broaden into general shell/runtime parsing. Return to the user when a finding requires a threat-model expansion.

- [ ] **Step 2B: For exact `Review passed: YES`, mark the replacement ready**

```powershell
gh pr ready
gh pr view --json number,isDraft,state,headRefOid
```

Expected: `isDraft` is false and head unchanged.

- [ ] **Step 3: Mark PR #25 superseded and close without merge**

```powershell
$newPrUrl = gh pr view --json url --jq .url
gh pr comment 25 --body "Superseded by the narrower Remote-only Codex CLI reminder guardrail: $newPrUrl. This broad parser PR is intentionally closed without merge."
gh pr close 25
```

Do not delete its branch unless separately approved.

- [ ] **Step 4: Squash merge the replacement and delete its branch when possible**

```powershell
gh pr merge --squash --delete-branch
gh pr view --json state,mergedAt,mergeCommit,url
```

- [ ] **Step 5: Update the main worktree and record exact SHA**

From `D:\AI\dcmcp-fork`:

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
$mainSha = git rev-parse HEAD
$originMainSha = git rev-parse origin/main
if ($mainSha -ne $originMainSha) { throw 'Local main does not match origin/main' }
git status --short
```

- [ ] **Step 6: Run consolidated exact-main validation**

```powershell
npm ci
npm test
npm run test:integration
npm pack --dry-run --ignore-scripts --json | Out-Null
git diff --check
git status --short
git rev-parse HEAD
```

Repeat the configuration before/after SHA-256 preservation check and confirm no unexpected owned test process remains. Only when every check succeeds record exactly:

```text
Release validation: PASS
```

Do not claim the running Local MCP has the new guardrail until the merged server is rebuilt and the MCP process/client is restarted or reconnected.

- [ ] **Step 7: Remove only the replacement worktree after successful handoff**

```powershell
git worktree remove D:\AI\dcmcp-worktrees\codex-cli-reminder-guardrail
git worktree prune
git branch --list feat/codex-cli-reminder-guardrail
git worktree list
```

Expected: replacement worktree removed; preserved broad-parser worktree remains until separately approved.
