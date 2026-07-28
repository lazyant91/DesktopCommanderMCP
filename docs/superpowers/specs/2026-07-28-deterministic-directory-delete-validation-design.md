# Deterministic Directory Delete Validation Design

## Problem

The existing guard validates only direct first-position PowerShell and CMD deletion commands. It can therefore miss a deletion hidden inside a compound statement or nested interpreter, including the incident form:

```powershell
$featurePath='D:\AI\WebService\VibeTutor\learnrepo\.worktrees\codex-oauth-provider-pr1'

if (Test-Path $featurePath) {
    cmd /c "rmdir /s /q \"$featurePath\""
}
```

The safety decision must not depend on an agent correctly remembering PowerShell, native-process, and CMD quoting rules. MCP must reject a deletion unless its supported syntax has one deterministic interpretation and a literal target that can be checked before execution.

## Goals

- Inspect commands before `executeCommand` or `sendInputToProcess` forwards them.
- Continue allowing documented direct PowerShell and CMD directory deletion forms with one explicit literal target.
- Detect directory-delete intent that appears in compound statements or nested PowerShell/CMD interpreter payloads.
- Reject deletion intent that is not fully consumed by the supported direct grammar.
- Reject malformed quoting, shell escapes, variables, multiple targets, unsupported options, and filesystem roots.
- Return an actionable error that asks the caller to retry with the current shell's canonical direct deletion form.

## Non-goals

- Implement a complete PowerShell or CMD parser.
- Execute a candidate command in a dry-run shell or infer safety from shell output.
- Inspect `.ps1`, `.cmd`, `.bat`, Node.js, Python, or other program source files before execution.
- Protect against a hostile caller intentionally hiding deletion through arbitrary code generation or alternate binaries.
- Change the public MCP tool surface or terminal process semantics.

## Considered approaches

### Full shell emulation

Reproduce PowerShell and CMD tokenization, interpolation, native argument conversion, control flow, and nested interpreter semantics. This would offer broader acceptance but is too large and fragile for a thin local guardrail; small differences from the real shell would create false confidence.

### Execute or dry-run the command

Ask the shell to reveal the final command or use command-specific preview features. This is unsafe because parsing and execution are coupled, previews are inconsistent, and `cmd rmdir` has no reliable universal dry-run mode.

### Canonical allowlist with fail-closed intent detection

Keep the existing bounded direct grammars. Separately scan parsed shell tokens for directory-delete intent. If the direct validator does not consume every detected deletion, block the command as an unsupported context. This is the selected approach because it is deterministic, small, testable, and directly prevents cross-shell quoting mistakes.

## Architecture

`validateDirectoryDeleteCommand` remains the single public validation entry point.

For each recognized shell command:

1. Split the input into bounded top-level segments while preserving quoted content.
2. Tokenize each segment with quote metadata.
3. Identify directory-delete intent in unquoted tokens and in payloads following recognized nested interpreter switches such as `cmd /c` or `powershell -Command`.
4. Run the existing direct PowerShell or CMD deletion validator.
5. Allow only when every detected deletion is exactly the direct command validated by the current shell grammar.
6. If deletion intent remains inside control flow, a nested interpreter, a quoted interpreter payload, or another unsupported context, block before process creation or stdin delivery.

The guard deliberately does not attempt to prove nested-shell deletion safe. It requires the caller to express the operation directly in the current shell using one literal target.

## Expected behavior

Allowed:

```powershell
Remove-Item -LiteralPath 'D:\AI\project\.worktrees\feature' -Recurse -Force
```

```cmd
rmdir /s /q "D:\AI\project\.worktrees\feature"
```

Blocked:

```powershell
if (Test-Path $featurePath) { cmd /c "rmdir /s /q \"$featurePath\"" }
```

```powershell
cmd /c 'rmdir /s /q "D:\AI\project\.worktrees\feature"'
```

```powershell
if (Test-Path -LiteralPath 'D:\AI\project\.worktrees\feature') {
    Remove-Item -LiteralPath 'D:\AI\project\.worktrees\feature' -Recurse -Force
}
```

The last command is blocked not because the target is necessarily dangerous, but because the direct grammar does not validate PowerShell control flow. The caller can retry the direct `Remove-Item` command with `-ErrorAction SilentlyContinue` when existence tolerance is needed.

Harmless text remains allowed:

```powershell
Write-Output 'Example: rmdir /s /q D:\temp'
```

```cmd
echo rmdir /s /q D:\temp
```

## Error handling

Add an `unsupported-context` block reason. The formatted error states that deletion was detected in compound or nested shell syntax and that no command was executed. It recommends one direct literal-path deletion command in the active shell.

Malformed commands continue to use `invalid-syntax`; dynamic targets use `dynamic-target`; root targets use `filesystem-root`.

## Testing

Focused parser tests must cover:

- the exact incident command;
- the same nested CMD deletion with correct PowerShell quoting;
- static and dynamic nested interpreter payloads;
- deletion inside PowerShell `if` and CMD parenthesized groups;
- reverse nesting from CMD to PowerShell;
- harmless quoted examples and `echo` output;
- existing allowed direct forms and root/dynamic/malformed regressions.

Runtime tests must prove blocked initial commands never call the wrapped executor and blocked interactive input never reaches stdin.

Full verification remains `npm run build`, `npm test`, `npm run test:integration`, and `npm pack --dry-run --ignore-scripts` on the final exact head.
