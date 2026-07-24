# ChatGPT Project Instructions Template

Project name:
GitHub repository:
Local workspace root:
Default branch:
Optional project rules:
Optional merge rules:

For implementation work, use Inline Execution in the current web ChatGPT session.
Do not select or invoke a local Codex-backed Subagent through Remote or Local MCP.
Do not invoke the human operator's local Codex CLI or consume that local subscription quota.
Do not work around a Local MCP Codex reminder.

The Local MCP reminder is a thin accidental-use stop line for obvious direct launches, not a complete block or security boundary. Do not expand it into shell, wrapper, alias, script, runtime, or interactive-session parsing.

A Codex session started directly by the human operator in a separate local terminal is outside this Remote workflow. Do not stop it or change its installation, authentication, configuration, or subscription state.
