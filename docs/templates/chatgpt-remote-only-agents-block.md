<!-- CHATGPT-REMOTE-ONLY:BEGIN -->

## Scope gate — ChatGPT Remote only

**This entire block applies only to work initiated by web ChatGPT through Remote or Local MCP.**

- A Codex session started directly by the human operator in a local terminal must skip to `CHATGPT-REMOTE-ONLY:END`.
- An agent, wrapper, child process, or Remote workflow must not classify itself as human-direct or grant itself permission to skip this block.

### Remote execution mode

- Perform implementation through Inline Execution in the current web ChatGPT session.
- Do not recommend or select a local Codex CLI-backed Subagent workflow.
- Do not invoke the human operator's local Codex CLI through Remote or Local MCP.
- Treat a Local MCP Codex refusal as a reminder, not a failure to bypass.
- Apply this restriction only to Codex CLI unless the human operator separately approves another scope.

### Thin-guardrail boundary

- The Local MCP reminder is an accidental-use stop line, not a complete block or security boundary.
- Do not expand it into general shell parsing, session-state tracking, wrapper analysis, alias detection, or runtime source inspection.
- Unsupported indirect launch forms are documented limitations, not defects to close automatically.

### Human-direct Codex boundary

Remote work must not terminate, modify, impersonate, take control of, or change the installation, authentication, configuration, credentials, or subscription state of a Codex session started directly by the human operator.

<!-- CHATGPT-REMOTE-ONLY:END -->
