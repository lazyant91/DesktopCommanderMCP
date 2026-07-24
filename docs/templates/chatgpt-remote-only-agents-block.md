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
