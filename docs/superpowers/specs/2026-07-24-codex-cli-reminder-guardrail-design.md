# Codex CLI Reminder Guardrail Design

## Status

Approved design for a fresh implementation based on `origin/main`. This design intentionally does not reuse the broad multi-agent command parser from Draft PR #25.

## Background

The incident that motivated this work occurred during a web ChatGPT implementation workflow. After a plan was written, the workflow offered two execution modes: Subagent and Inline Execution. The Subagent option was selected to observe how it behaved in this environment, and the implementation later launched the user's local Codex CLI and consumed local Codex subscription quota.

Before that incident, normal Remote and Local MCP work had not used the local Codex CLI. The observed failure was therefore a workflow-selection and context-loss problem, not an adversarial attempt to bypass a security boundary.

Draft PR #25 attempted to prevent every direct and indirect launch of several AI-agent CLIs. Repeated review showed that complete shell, runtime, REPL, wrapper, and alias inspection becomes an open-ended parser and policy-maintenance problem. This replacement design narrows the policy to the actual incident and treats it as a workflow guardrail rather than an operating-system sandbox.

## Goal

Prevent web ChatGPT, Remote, and Local MCP from unintentionally launching the user's local Codex CLI through the ordinary, recognizable execution paths used by a Codex-backed Subagent workflow.

When a normal Codex launch is requested, Local MCP must not run it. Instead, it returns a reminder that the task must continue through Inline Execution in the current web ChatGPT session.

## Non-goals

This feature does not attempt to:

- block OpenCode, Claude, Gemini, Aider, Cursor Agent, or any other AI tool;
- detect renamed or copied Codex binaries;
- analyze dynamically assembled executable names or arguments;
- parse complete CMD, PowerShell, POSIX shell, Node.js, Python, Bun, or Deno grammars;
- inspect arbitrary source files or unrelated scripts for hidden Codex launches;
- prevent a human operator from directly starting and using Codex in a local terminal;
- modify Codex installation, authentication, configuration, credentials, or subscription state;
- provide an operating-system security boundary.

The feature is deliberately a reminder and accidental-use guardrail. It must not be documented as complete enforcement against a hostile caller.

## Threat model

### In scope

- A web ChatGPT workflow recommends or selects a local Codex-backed Subagent.
- Context becomes long and the original "do not use local Codex" instruction is forgotten.
- The user accidentally requests a Codex-backed execution mode.
- A normal process request attempts `codex`, `codex exec`, `codex review`, or an equivalent direct Windows launcher.
- A normal official npm-package launch attempts the Codex package.
- A directly owned interactive shell receives the same recognizable Codex command.

### Out of scope

- Deliberately obfuscated commands.
- Custom forwarding programs or scripts.
- Renamed executables.
- Dynamic code that constructs the word `codex` at runtime.
- Environment-variable assignments or other launcher prefixes that require skipping tokens to infer a later executable.
- PowerShell option abbreviations or value-consuming startup options outside the fixed supported set.
- POSIX shell value-consuming startup options, such as `bash --rcfile profile.sh -i`, and combined short-option bundles such as `-is`.
- Shell-specific escaping or multiline grammar, including PowerShell/POSIX single-quoted separator data, PowerShell backtick continuation, CMD caret continuation, POSIX backslash continuation, and POSIX heredocs.
- Shell families outside cmd, PowerShell/pwsh, bash, sh, and zsh, including fish.
- Processes launched outside Local MCP.
- A human-owned terminal session that the human operator started directly.

## Defense layers

The design uses three small, complementary layers.

### 1. Reusable ChatGPT project-instruction template

Add a repository document containing a project-independent instruction template with blank fields for:

- project name;
- repository owner and name;
- local workspace root;
- default branch;
- optional project rules;
- optional merge rules.

The template tells web ChatGPT to:

- use Inline Execution for implementation work;
- not recommend or select a local Codex-backed Subagent workflow;
- not call the user's local Codex CLI through Remote or Local MCP;
- treat a Local MCP refusal as a reminder, not a failure to bypass;
- leave human-direct local Codex sessions alone;
- initialize or verify the Remote-only `AGENTS.md` block before modifying files, using Git, building, testing, or starting general local commands.

ChatGPT project instructions are configured outside the repository. The server cannot install this template into every ChatGPT project automatically. The document is a reusable source that the user can paste into each project configuration.

### 2. Remote-only `AGENTS.md` scope block

Add a marked block to the repository-root `AGENTS.md` and provide the same block as a reusable template for other repositories.

Markers:

```text
<!-- CHATGPT-REMOTE-ONLY:BEGIN -->
<!-- CHATGPT-REMOTE-ONLY:END -->
```

The first lines of the block must state:

- the entire block applies only to work initiated by web ChatGPT through Remote or Local MCP;
- a Codex session started directly by the human operator must skip to the end marker;
- an agent cannot classify itself as human-direct or grant itself permission to skip the block.

This scope gate allows a human-started Codex session to read only the opening lines, skip the Remote-only content, and continue reading common repository rules. The block is not a blanket local Codex prohibition.

Remote initialization rules documented in the reusable project template are:

- both markers present: do nothing;
- neither marker present: preserve existing content and append the block once;
- only one marker present: report a damaged block and do not repair automatically;
- read-only exploration alone does not require creating the block;
- the block must be present before local modification, Git mutation, build, test, or general process execution begins.

The Local MCP server does not silently modify arbitrary repositories. The Remote workflow performs this initialization under the project instructions when beginning local work.

### 3. Small Local MCP Codex launch reminder

Create a small configuration-independent detector dedicated only to recognizable Codex CLI launch requests. The process-tool request does not carry trusted origin metadata, so the Local MCP layer applies the reminder to every matching `start_process` call and matching input sent to a recognized owned shell. Human-direct use remains outside the policy by occurring in a separate local terminal rather than through Local MCP process tools.

Suggested interface:

```ts
export interface CodexGuardrailMatch {
  matched: true;
  form: 'direct-executable' | 'official-package-launch';
}

export type CodexGuardrailDecision =
  | { matched: false }
  | CodexGuardrailMatch;

export function detectCodexCliLaunch(command: string): CodexGuardrailDecision;
```

The detector is pure, synchronous, bounded by the supplied command string, and performs no filesystem, network, registry, package, or process inspection.

## Recognized launch forms

### Direct executable

Recognize a first executable token whose normalized basename is `codex` after removing one bounded CMD echo-control `@`, either attached to that executable token or present as the first standalone token, plus matching token quotes and these launcher suffixes:

- `.exe`
- `.cmd`
- `.bat`
- `.ps1`

This includes quoted or unquoted absolute paths such as:

```text
codex exec review
codex.cmd review
"C:\Users\example\AppData\Roaming\npm\codex.cmd" exec review
```

The detector splits ordinary command segments at double-quote-external `;`, `|`, `&`, LF, and CRLF boundaries, then examines the first token of each segment. Double quotes are the only cross-shell segment-protection quote because CMD does not treat single quotes as quoting; tokenization may still accept single quotes for a direct token. A backslash is not treated as a cross-shell escape for those segment separators. The detector does not skip environment-variable assignments or launcher prefixes to infer a later executable, and it must not add a new shell grammar or recursive runtime parser.

### Official package launch

Recognize only the ordinary official npm package-launch forms required by the incident model:

```text
npx @openai/codex
npx @openai/codex exec review
npm exec -- @openai/codex
npm exec -- @openai/codex --version
npm x -- @openai/codex
```

Once the package token is found in the supported launcher position, trailing tokens are treated as arguments passed to the Codex CLI and do not make the launch allowable. The package token may be exactly `@openai/codex` or the exact package name followed by a non-empty `@<version-or-dist-tag>` specifier; similarly named packages do not match. The bounded supported launcher options are optional `-y` or `--yes` immediately after `npx`, followed by an optional `--`, and an optional `--` immediately before the package token for `npm exec` or `npm x`. No other npm/npx option parsing is implied, and the implementation must not grow into a general npm parser.

Package references used for metadata operations remain allowed:

```text
npm view @openai/codex version
npm install @openai/codex --save-dev
```

### Explicitly allowed data and paths

The following must remain allowed:

```text
echo codex
rg codex README.md
node C:\projects\codex\scripts\build.js
npm view @openai/codex version
npm install @openai/codex --save-dev
```

A path segment, argument, search term, output string, or package metadata reference containing `codex` is not by itself a launch request.

## Tool integration

### `start_process`

Evaluate the command before configurable `blockedCommands` validation and before calling `terminalManager.executeCommand`.

When a recognized Codex launch is found:

- return an MCP error result;
- do not invoke the terminal manager;
- do not alter the command and retry;
- include the reminder message defined below.

The explicit `shell` option and configured `defaultShell` are not treated as general executable policy surfaces in this simplified design. The detector only checks them if their normalized executable basename is directly `codex`, which prevents the obvious `shell: "codex"` mistake without introducing shell-wrapper analysis.

### `interact_with_process`

Only directly owned sessions that were opened as ordinary interactive shells receive the Codex command guardrail. Store a small session classification when the process starts:

- `shell`: CMD, PowerShell, pwsh, bash, sh, or zsh launched as an interactive shell;
- `other`: REPLs, applications, scripts, builds, and unknown processes.

For fixed shell-start options, the first CMD `/c` or `/k` token selects the host mode: `/c` is `other` and `/k` is `shell`. Later occurrences belong to the command text and do not change the session kind. PowerShell or pwsh with `-NoExit` is `shell` when `-NoExit` appears before the execution target, including an initial `-Command` or `-File` form. A trailing `-NoExit` after `-Command`, `-File`, or a positional script is target input and does not keep the host open. Without an effective preceding `-NoExit`, ordinary `-Command <text>` and `-File <path>` forms are `other`, while the exact stdin forms `-Command -` and `-File -` are `shell`.

The bounded PowerShell/pwsh classifier recognizes only `-ExecutionPolicy`, `-WorkingDirectory`, `-InputFormat`, and `-OutputFormat` as options that consume exactly one following value. After those values are consumed, any remaining positional token is treated as a script or execution target and the session is `other` unless an effective preceding `-NoExit` was seen. Missing option values are also `other`. Do not infer abbreviations, maintain a complete PowerShell option table, or infer interactivity from output, prompts, process lookup, or script contents.

For bash, sh, and zsh, exact `-s` before the execution target selects stdin mode. Later positional values and values after an option terminator belong to the stdin script as arguments, so the session remains `shell`. `-c`, a script path before `-s`, or `-s` encountered only after `--` remains `other`. Do not parse combined short-option bundles or additional POSIX option-value grammars.

For a `shell` session, evaluate recognizable direct and official package-launch forms before calling `sendInputToProcess`.

For an `other` session, do not parse source code or REPL input. This avoids the previous stateful language parser and preserves ordinary strings, variables, comments, and code examples.

Unknown session context is treated as `other`, because this feature is an accidental-use reminder rather than a fail-closed security boundary.

## Reminder response

The refusal must explain the next action instead of returning only a generic blocklist error.

Required meaning:

```text
Local Codex CLI execution was not performed.

Local MCP process calls do not carry trusted origin metadata, so this reminder
applies to every matching request and protects the human operator's local Codex subscription quota.

Continue through Inline Execution in the current web ChatGPT session. Do not
select a local Codex-backed Subagent and do not work around this refusal.

A separate Codex session started directly by the human operator in a local terminal
is outside this Local MCP process-tool guardrail.
```

The implementation may format this text for existing MCP result conventions, but tests must verify all required meanings.

## Configuration behavior

- No new editable configuration field is added.
- The Codex reminder is independent of `blockedCommands` so clearing that list does not disable the reminder.
- The policy contains only the Codex CLI and official Codex npm package identity.
- Other AI services are not added automatically.
- The guardrail does not modify Codex or host configuration.

## Error handling

This is not a fail-closed security parser.

- A positive recognized match is denied.
- A non-match is allowed to continue through existing validation.
- The detector must be deterministic and avoid throwing for ordinary strings.
- An internal detector exception is logged and existing command validation continues; it must not disable the server or block unrelated commands.
- No recursion, persistent alias state, source-code lexer, Base64 decoder, or operating-system policy is introduced.

## Performance

The detector inspects short command strings with a small fixed set of tokens and identities. It performs no external I/O and stores no growing global state.

Expected complexity is linear in the command string length with a small constant factor. The implementation plan must include a microbenchmark or repeat-evaluation regression that demonstrates the detector does not materially change ordinary process-call latency.

## Testing strategy

Use test-driven development.

### Required blocked cases

- `codex`
- `codex exec review`
- `codex review`
- `codex.exe exec review`
- `codex.cmd exec review`
- `codex.ps1 exec review`
- quoted absolute path to `codex.cmd` or `codex.exe`
- ordinary chained or multiline command whose actual command segment starts Codex
- `npx @openai/codex`
- `npx @openai/codex exec review`
- `npx @openai/codex@latest exec review`
- `npm exec -- @openai/codex`
- `npm exec -- @openai/codex --version`
- `npm x -- @openai/codex`
- explicit `start_process` shell value whose executable basename is `codex`
- direct Codex input sent to an owned shell session
- Codex input sent after starting CMD with `/k`
- Codex input sent after starting PowerShell or pwsh with `-NoExit`
- Codex input sent after starting PowerShell/pwsh with exact stdin forms `-Command -` or `-File -`
- Codex input sent after starting PowerShell/pwsh with `-ExecutionPolicy`, `-WorkingDirectory`, `-InputFormat`, or `-OutputFormat` and one option value
- Codex input sent after starting bash, sh, or zsh in exact `-s` stdin mode with script arguments
- recognized launch while `blockedCommands` is empty

### Required allowed cases

- `git status`
- `npm test`
- `node scripts/build.js`
- `echo codex`
- `rg codex README.md`
- `npm view @openai/codex version`
- `npm install @openai/codex --save-dev`
- `CI=1 codex exec review`, because environment-variable assignment prefixes are not skipped
- `bash --rcfile profile.sh -i` sessions, because POSIX value-consuming startup options are not parsed
- fish sessions, because fish is outside the bounded interactive-shell classifier
- unrelated script inside a directory named `codex`
- quoted string `"codex"` in Node or Python REPL input
- prose or code examples containing the word `codex`
- non-Codex AI tools

### Integration assertions

- recognized `start_process` request never reaches `executeCommand`;
- recognized owned-shell input never reaches `sendInputToProcess`;
- non-shell REPL input is not evaluated as a shell command;
- reminder output contains the required next-step guidance;
- existing configurable blocklist behavior remains unchanged;
- existing unit and integration suites pass;
- package contents include the detector module and declarations if a new module is created.

## Documentation deliverables

The implementation should add or update:

- `docs/templates/chatgpt-project-instructions-template.md` — reusable project-independent instructions with blank fields;
- `docs/templates/chatgpt-remote-only-agents-block.md` — reusable marked block for repository `AGENTS.md` files;
- root `AGENTS.md` — append the marked Remote-only block once while preserving existing repository rules;
- `README.md` — explain the reminder guardrail, its Remote-only scope, and its explicit limitations;
- `SECURITY.md` — state that this is a workflow guardrail, not a sandbox;
- `CHANGELOG.md` — record the unreleased behavior.

## Branch and PR strategy

The previous implementation remains preserved for reference:

- branch: `feat/block-local-ai-agent-clis`
- Draft PR: #25

Do not reset, rewrite, cherry-pick, or partially reuse that branch.

Implement this design on a fresh branch from the latest fetched `origin/main`:

```text
feat/codex-cli-reminder-guardrail
```

Use a separate Git worktree. Open a new Draft PR after focused and full validation. Keep PR #25 open as a historical comparison until the replacement PR reaches a reviewable state.

After the replacement PR receives `Review passed: YES`:

1. mark the replacement PR ready for review;
2. add a superseded-by note to PR #25 and close it without merging;
3. squash merge the replacement PR;
4. delete the replacement branch when possible;
5. run required release validation on the exact updated `main` SHA according to repository rules.

## Acceptance criteria

The design is complete when all of the following are true:

- web ChatGPT guidance defaults implementation work to Inline Execution;
- the reusable project instruction template contains no project-specific hard-coded values;
- the `AGENTS.md` block clearly applies only to ChatGPT/Remote/Local MCP work and can be skipped by human-direct Codex sessions after reading its scope gate;
- normal recognizable Codex launches are refused before local execution;
- the refusal reminds the caller to continue Inline Execution and not bypass it;
- direct human use of Codex remains outside the documented restriction;
- only Codex is restricted;
- normal Git, npm, Node.js, build, test, search, metadata, and REPL-data workflows remain available;
- no general shell/runtime/REPL policy engine is introduced;
- dedicated and existing tests pass;
- independent review records `Review passed: YES` before merge.
