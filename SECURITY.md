# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.0.x | Yes |
| Earlier fork revisions | No |
| Upstream DesktopCommanderMCP releases | Maintained by the upstream project |

## Security model

Local MCP Server is a privileged local automation process. It can read and write files and execute terminal commands with the permissions of the operating-system user that starts it.

The connected MCP client and the account controlling that client are assumed to be trusted. The server does not attempt to distinguish a genuine user request from prompt injection, malicious repository content, a compromised client, or a compromised model account.

The server has no built-in hosted backend, account system, telemetry transport, or remote-control service. External connectivity can still be introduced by the MCP client, by a user-selected bridge, or by commands launched through the terminal tools.

## Built-in guardrails

| Control | Purpose | Security boundary? |
| --- | --- | --- |
| `allowedDirectories` | Reduce accidental access by structured file tools | No |
| Command blocklist | Reject explicitly listed command names | No |
| Codex CLI reminder | Refuse ordinary Remote-origin Codex launches and direct callers to Inline Execution | No |
| Canonical path checks | Reduce common symlink and ancestor path escapes | No |
| Exact edit matching | Prevent ambiguous text replacements | No |
| Owned process sessions | Prevent public tools from terminating arbitrary host PIDs | Partial guardrail |
| Separate OS account or virtual machine | Isolate the server from other user resources | Yes, subject to host configuration |

The Codex CLI reminder is a workflow guardrail for web ChatGPT, Remote, and Local MCP tasks. It is not a security boundary or sandbox, and it does not apply to a human-direct Codex session manually started by the operator in a local terminal.

Terminal execution is intentionally open-ended. A command can invoke another interpreter, use absolute paths, run scripts, access networks, or operate outside structured filesystem roots. File roots and command filtering must not be described as a sandbox.

## Recommended operation

- Connect only MCP clients and accounts you trust.
- Run the server as a non-administrator user.
- Restrict `allowedDirectories` to project-specific roots where practical.
- Review destructive commands and file changes when the context warrants it.
- Keep credentials and unrelated private data outside the execution account.
- Avoid exposing the stdio process through an untrusted bridge or shared service.
- Use a separate operating-system account, virtual machine, or dedicated workstation when stronger isolation is required.
- Keep Node.js and project dependencies updated through reviewed releases.

## Known limitations

- `allowedDirectories` does not constrain arbitrary terminal commands.
- Command-name filtering can be bypassed through scripts, aliases, alternate interpreters, absolute paths, or shell composition.
- The Codex CLI reminder does not detect renamed binaries, dynamic executable construction, custom forwarding scripts, or commands launched outside Local MCP.
- A hostile caller with general local code-execution capability can bypass name-based workflow reminders.
- A trusted client can request destructive operations.
- Tool descriptions and annotations do not enforce user intent.
- The server does not protect against compromise of the connected client, model account, operating system, or launched command.
- Process cleanup depends on operating-system and child-process behavior.
- Tool output can expose secrets already available to the launching user.

## Dependency and release policy

The v1.0.0 dependency graph is recorded in `package-lock.json`. Release validation is performed locally on the exact `main` SHA used for the release tag. GitHub Actions are not used as a security or release gate in this repository.

A version badge or passing test suite does not guarantee that the server is safe for every environment. Users remain responsible for account permissions, network policy, client trust, and isolation.

## Sensitive information

Bug reports, logs, screenshots, and reproductions must not include secrets, tokens, credentials, private file contents, personal information, or unnecessary command output.

Before sharing a reproduction:

1. replace real paths and usernames with placeholders;
2. remove access tokens and environment variables;
3. reduce files to the minimum content required;
4. verify that terminal output does not expose private data.

## Reporting a vulnerability

Use GitHub private vulnerability reporting when it is available for this repository. Otherwise contact the repository owner through a private GitHub channel before public disclosure.

Include:

- the affected version and commit SHA;
- operating system and Node.js version;
- a minimal reproduction;
- expected and actual security impact;
- whether the issue requires a malicious client, repository, command, or local user.

Do not open a public issue containing an unpatched exploit, secret, or private user data.

## License and responsibility

This project is provided under the MIT License without warranty. Users are responsible for selecting an appropriate execution account, access scope, MCP client, bridge, network policy, and isolation model.