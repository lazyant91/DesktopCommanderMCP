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
