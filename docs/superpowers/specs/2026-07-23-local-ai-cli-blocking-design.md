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

Create a focused module at `src/ai-agent-execution-policy.ts` with no configuration dependency.

The module exposes:

```ts
export interface AiAgentPolicyDecision {
  allowed: boolean;
  matchedIdentity?: string;
  reason?: string;
}

export function evaluateAiAgentExecution(command: string): AiAgentPolicyDecision;
```

The implementation performs bounded, deterministic command inspection:

1. Tokenize command segments while respecting single and double quotes.
2. Inspect every top-level command in shell chains separated by `;`, `&&`, `||`, `|`, and `&`.
3. Normalize executable tokens by removing quotes, path prefixes, and known Windows launcher suffixes.
4. Block direct execution of a known agent identity.
5. Recognize package-manager launch forms:
   - `npx [options] <package>`
   - `npm exec [options] -- <package>`
   - `pnpm dlx [options] <package>`
   - `yarn dlx [options] <package>`
6. Recognize shell-wrapper payloads and recursively inspect their command text:
   - `cmd /c ...`
   - `powershell -Command ...`
   - `powershell -EncodedCommand ...` only when the Base64 payload can be decoded safely as UTF-16LE or UTF-8; malformed payloads fail closed
   - `pwsh -Command ...`
7. Recognize PowerShell launch syntax:
   - call operator: `& "C:\path\codex.cmd"`
   - `Start-Process codex`
   - `Start-Process -FilePath "C:\path\claude.exe"`
8. Recognize known script entry points invoked through `node`, `python`, `python3`, `py`, `bun`, or `deno` when the script basename or path segment is a known agent executable or package identity.
9. Recursively inspect command substitutions already supported by the command parser where applicable.
10. Enforce a recursion-depth and input-length limit. Exceeding either limit returns a denied decision so malformed input cannot bypass policy.

The policy is deliberately narrower than a general text search. A harmless command such as `rg "codex" README.md` must remain allowed because the matched word is data, not an execution target.

## Tool integration

### `start_process`

`startProcess` evaluates the immutable AI-agent policy before the existing configurable command blocklist.

When denied, it returns an MCP error without spawning a process:

```text
Error: Local AI agent execution is not allowed: <matched identity>
```

The existing `blockedCommands` validation remains unchanged for general command policy.

### `interact_with_process`

`interactWithProcess` evaluates the exact input before writing it to the owned process stdin.

When denied, it returns the same class of MCP error and does not call `terminalManager.sendInputToProcess`. This closes the bypass where an agent first opens PowerShell, CMD, Bash, Node REPL, or another interactive process and then submits an AI CLI command.

Because interactive input may also be ordinary REPL data, the policy blocks only input that parses as a known execution form. Plain prose containing an agent name remains allowed.

## Configuration behavior

No new user-editable setting is added.

- `blockedCommands` continues to control the existing configurable blocklist.
- The immutable AI-agent list is not returned as a configurable value.
- `set_config_value` cannot disable or replace the AI-agent policy.
- Resetting configuration cannot disable the AI-agent policy.

This avoids presenting a security control that an MCP-connected agent can remove using the same MCP server.

## Error handling

Policy parsing is fail closed only for inputs that appear to be an execution wrapper the policy is responsible for but cannot safely decode or inspect, such as a malformed PowerShell `-EncodedCommand` payload.

Unexpected internal policy errors deny execution and return a sanitized reason. They must not crash the MCP server or expose local paths beyond the command text already supplied by the caller.

## Testing strategy

Use test-driven development. Each behavior is first represented by a failing test and observed failing before production code is added.

Create `test/test-ai-agent-execution-policy.js` to cover the pure policy module and add focused handler coverage for both MCP process tools.

Required blocked cases:

- Direct executable names for all six families.
- `.exe`, `.cmd`, `.bat`, and `.ps1` variants.
- Quoted absolute Windows and Unix paths.
- Mixed case.
- Commands embedded in shell chains.
- `npx`, `npm exec`, `pnpm dlx`, and `yarn dlx` package launches.
- `cmd /c`, PowerShell, and pwsh wrapper payloads.
- PowerShell call operator and `Start-Process` forms.
- Known JavaScript or Python entry-point paths passed to an interpreter.
- An AI CLI command sent through `interact_with_process`.
- AI blocking while `blockedCommands` is empty.
- Malformed or excessive recursive wrapper input fails closed.

Required allowed cases:

- Git, npm scripts, TypeScript, ESLint, Prettier, and ordinary Node scripts.
- Package-manager launches of non-agent packages.
- Search, echo, and file operations where an agent name is only data.
- Ordinary interactive REPL input and prose mentioning agent names.
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
