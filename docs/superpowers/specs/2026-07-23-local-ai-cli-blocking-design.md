# Local AI Agent CLI Blocking Design

## Status

Approved scope for implementation on branch `feat/block-local-ai-agent-clis`.

## Purpose

Prevent MCP-connected agents from consuming separate local AI-agent quotas by launching local AI coding assistants through `start_process` or `interact_with_process`.

The policy is an immutable Local MCP runtime boundary. It is independent of the user-editable `blockedCommands` setting, so clearing or replacing `blockedCommands` must not disable AI-agent blocking.

## Security boundary

The policy applies only to commands and interactive input sent through this Local MCP server.

It does not uninstall, log out, modify, or disable AI tools for the human user outside Local MCP. It also does not claim to identify an arbitrarily renamed executable, an unknown custom wrapper, or a generic script that independently calls a model API. Preventing those cases would require an operating-system allowlist or sandbox outside this product's approved scope.

## Blocked agent families

The built-in policy blocks the following executable and package identities case-insensitively:

| Agent family | Executable identities | Package and launcher identities |
| --- | --- | --- |
| OpenAI Codex | `codex` | `@openai/codex` |
| OpenCode | `opencode` | `opencode-ai` |
| Anthropic Claude Code | `claude`, `claude-code` | `@anthropic-ai/claude-code` |
| Google Gemini CLI | `gemini` | `@google/gemini-cli` |
| Aider | `aider`, `aider-chat` | `aider-chat` |
| Cursor Agent | `cursor-agent` | `cursor-agent` |

Executable matching ignores a path prefix and the Windows launcher suffixes `.exe`, `.cmd`, `.bat`, and `.ps1`.

## Allowed development commands

The policy must not broadly block shells, package managers, interpreters, Git, build tools, or test runners. Examples that remain allowed include:

- `git status`
- `npm test`
- `npm exec -- tsc --noEmit`
- `npx eslint .`
- `pnpm dlx prettier --check .`
- `node scripts/build.js`
- `powershell -Command "npm test"`

A package manager or interpreter is blocked only when its launch target is a known AI-agent identity.

## Detection architecture

Create a focused module at `src/ai-agent-policy.ts` with no configuration dependency.

The module exposes pure command and interactive-input evaluators:

```ts
export type AiAgentPolicyDecision =
  | { allowed: true }
  | { allowed: false; agent: string; matchedToken: string; reason: string };

export function evaluateAiAgentInvocation(command: string): AiAgentPolicyDecision;
export function createAiAgentInteractivePolicyState(): AiAgentInteractivePolicyState;
export function evaluateAiAgentInteractiveInput(
  input: string,
  mode: InteractiveInputPolicyMode,
): AiAgentPolicyDecision;
export function evaluateAiAgentInteractiveInputWithState(
  input: string,
  mode: InteractiveInputPolicyMode,
  state: AiAgentInteractivePolicyState,
): { decision: AiAgentPolicyDecision; nextState: AiAgentInteractivePolicyState };
```

The implementation performs bounded, deterministic command inspection:

1. Tokenize command segments while respecting single and double quotes.
2. Inspect every top-level command in shell chains separated by `;`, `&&`, `||`, `|`, and `&`.
3. Normalize executable tokens by removing quotes, path prefixes, and known Windows launcher suffixes.
4. Block direct execution of a known agent identity.
5. Recognize package-manager launch forms even when global options precede the subcommand:
   - `npx [options] <package>`
   - `npm [global options] exec [options] -- <package>`
   - `pnpm [global options] dlx [options] <package>`
   - `yarn [global options] dlx [options] <package>`
6. Recognize shell-wrapper payloads, groups, common control statements, and recursively inspect their command text:
   - `cmd /c ...`, including CMD `@` echo-suppression prefixes
   - `powershell -Command ...`
   - `powershell -EncodedCommand ...` only when the Base64 payload can be decoded safely; malformed payloads fail closed
   - `pwsh -Command ...`
   - Bash, PowerShell, and CMD grouping, `if`, CMD `for`, and POSIX `case` forms without treating quoted examples as executable control syntax
7. Recognize PowerShell launch syntax and CMD `start` title semantics without conflating them:
   - call operator: `& "C:\path\codex.cmd"`
   - `Start-Process codex`
   - `Start-Process -FilePath "C:\path\claude.exe"`
   - PowerShell alias `start "codex" ...`
8. Recognize known script entry points invoked through `node`, `python`, `python3`, `py`, `bun`, or `deno` from the script basename, an official package path, or a known entry-point layout such as `codex/bin/index.js`. Ordinary project directories named after an agent are not sufficient to block an unrelated script.
9. Inspect static inline code supplied through Node `-e`, Python `-c`, Bun `-e`, and `deno eval` with the same runtime-aware process API parser used for REPL input.
10. Recursively inspect command substitutions and script blocks already supported by the command parser where applicable.
11. Validate the requested `start_process` shell override and resolved `defaultShell` before process creation.
12. Enforce a recursion-depth and 64 KiB input-length limit. Exceeding either limit returns a denied decision so malformed input cannot bypass policy.

The policy is deliberately narrower than a general text search. A harmless command such as `rg "codex" README.md` must remain allowed because the matched word is data, not an execution target.

## Tool integration

### `start_process`

`startProcess` evaluates the requested command before the existing configurable command blocklist. After resolving shell selection, it also evaluates an explicit `shell` override or configured `defaultShell` before calling the terminal manager.

When either the command or shell selection is denied, it returns an MCP error without spawning a process:

```text
Error: Local AI agent execution is not allowed: <matched identity>
```

The existing `blockedCommands` validation remains unchanged for general command policy.

### `interact_with_process`

`interactWithProcess` evaluates input before writing it to the owned process stdin. Shell and unknown sessions use full command inspection. Directly opened standard Python, Node.js, Deno, and Bun REPL sessions retain a runtime-specific input mode and a bounded per-session static alias state.

When denied, it returns the same class of MCP error and does not call `terminalManager.sendInputToProcess`. In REPL data modes, quoted names, plain prose, comments, string literals, and regular-expression literals remain allowed, while explicit standard process-launch APIs are tokenized and inspected: Node `child_process`, Python `subprocess` and `os.system`, `Bun.spawn`, and `Deno.Command`. Static argv arrays and Python tuples are recursively evaluated through shell wrappers. Static dot or bracket properties and Node `spawn` shell options are inspected, while JavaScript template-literal or Python f-string code expressions are inspected separately from surrounding text.

Recognized module receivers, imported functions, Bun spawn aliases, and Deno command constructors are retained across successive inputs as session-scoped aliases. The next state is committed only after stdin accepts the declaration, is capped at 64 aliases, and fails closed on overflow. This closes direct and stateful REPL process-launch bypasses without treating every agent-name string as a command. Dynamically constructed targets or arguments, arbitrary evaluation helpers, and unrelated scripts remain outside the name-based parser's guarantee.

## Configuration behavior

No new user-editable setting is added.

- `blockedCommands` continues to control the existing configurable blocklist.
- The immutable AI-agent list is not returned as a configurable value.
- `set_config_value` cannot disable or replace the AI-agent policy.
- A `defaultShell` value is inspected at process-start time, so storing a blocked executable cannot bypass the immutable rule.
- Resetting configuration cannot disable the AI-agent policy.

This avoids presenting a security control that an MCP-connected agent can remove using the same MCP server.

## Error handling

Policy parsing is fail closed only for inputs that appear to be an execution wrapper the policy is responsible for but cannot safely decode or inspect, such as a malformed PowerShell `-EncodedCommand` payload.

Unexpected internal policy errors deny execution and return a sanitized reason. They must not crash the MCP server or expose local paths beyond the command text already supplied by the caller.

## Testing strategy

Use test-driven development. Each behavior is first represented by a failing test and observed failing before production code is added.

Use `test/test-ai-agent-policy.js` for command parsing, `test/test-ai-agent-interactive-policy.js` for runtime-specific REPL data, and focused handler coverage for both MCP process tools.

Required blocked cases:

- Direct executable names for all six families.
- `.exe`, `.cmd`, `.bat`, and `.ps1` variants.
- Quoted absolute Windows and Unix paths.
- Mixed case.
- Commands embedded in shell chains, groups, and common `if` control statements.
- `npx`, `npm exec`, `pnpm dlx`, and `yarn dlx` package launches, including global options before subcommands.
- `cmd /c`, PowerShell, and pwsh wrapper payloads.
- PowerShell call operator, `Start-Process`, `saps`, and positional `start` forms while preserving CMD title semantics.
- Known JavaScript or Python entry-point basenames, official package paths, and known entry-point layouts passed to an interpreter.
- Bun and Deno runtime options before a blocked `run` target.
- A blocked executable supplied as an explicit `start_process` shell override or configured `defaultShell`.
- Direct Node, Python, Bun, and Deno REPL process-launch APIs sent through `interact_with_process`.
- Static argv shell-wrapper launches, executable overrides, and process calls inside template or f-string expressions.
- Session-scoped aliases declared in earlier REPL inputs, including module, function, Bun, and Deno aliases.
- AI blocking while `blockedCommands` is empty.
- Malformed, oversized, alias-overflow, or excessive recursive wrapper input fails closed.

Required allowed cases:

- Git, npm scripts, TypeScript, ESLint, Prettier, and ordinary Node scripts.
- Package-manager launches of non-agent packages.
- Search, echo, and file operations where an agent name is only data.
- Ordinary project directories named after an agent when the actual script is unrelated.
- CMD `start` window titles containing an agent name when the launched command is harmless.
- Ordinary interactive REPL input, prose mentioning agent names, comments, string literals, harmless template/f-string expressions, and process-launch APIs targeting non-agent tools.
- Existing configurable `blockedCommands` behavior.

Run the focused policy tests, complete unit suite, clean TypeScript build, and integration suite before opening the pull request.

## Documentation changes

Update `README.md`, `SECURITY.md`, `CHANGELOG.md`, and configuration documentation to explain:

- Local MCP permanently blocks known local AI-agent CLIs.
- The rule protects separate local AI quotas from MCP-connected agents.
- The policy cannot be disabled through `blockedCommands`.
- Human terminal use outside Local MCP is unaffected.
- The limitation regarding renamed or unknown custom launchers.

## Delivery process

- Implement on `feat/block-local-ai-agent-clis`, never directly on `main`.
- Keep the PR in Draft until implementation and review are complete.
- Do not invoke Codex, OpenCode, Claude, Gemini, Aider, Cursor Agent, or another local AI reviewer.
- Review the complete diff in the current web GPT session against this specification.
- Run local build and tests through Remote.
- Record exact base and head SHAs and validation evidence in the PR.
- Mark the PR ready only after review concludes `Review passed: YES`.
- Squash merge and delete the feature branch when possible.

## Acceptance criteria

The feature is complete when all of the following are true:

1. Known local AI-agent CLIs cannot be launched through `start_process` using the covered direct and indirect forms.
2. Known local AI-agent CLIs cannot be launched by sending commands through `interact_with_process`.
3. Clearing `blockedCommands` does not weaken the immutable AI-agent policy.
4. Normal local development commands continue to work.
5. The complete unit and integration suites pass on Windows.
6. Documentation accurately states the protection and its limits.
7. No local AI CLI is invoked during implementation or review.
