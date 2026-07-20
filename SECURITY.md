# Security Policy

## Security model

Local MCP Server is a privileged local automation process. It can read and write files and execute terminal commands with the permissions of the operating-system user that starts it.

The connected MCP client and the account controlling that client are assumed to be trusted. The server does not attempt to distinguish a genuine user request from prompt injection or a compromised client.

## Built-in guardrails

| Control | Purpose | Security boundary? |
| --- | --- | --- |
| Allowed directories | Reduce accidental access by structured file tools | No |
| Command blocklist | Reduce accidental execution of listed commands | No |
| Canonical path checks | Reduce common symlink and ancestor path escapes | No |
| Separate OS account or virtual machine | Isolate the server from other user resources | Yes, subject to host configuration |

Terminal execution is intentionally open-ended. A command can invoke other interpreters, use absolute paths, or access resources outside the structured filesystem roots. Therefore file and command policies must not be described as a sandbox.

## Recommended operation

- Start the server only for MCP clients you trust.
- Run it as a non-administrator user.
- Restrict structured file tools to project-specific directories where practical.
- Review destructive commands and file changes when the context warrants it.
- Keep credentials and unrelated private data outside the account or environment used by the server.
- Use a separate operating-system account, virtual machine, or dedicated workstation when stronger isolation is required.

## Known limitations

- `allowedDirectories` does not constrain arbitrary terminal commands.
- Command-name filtering can be bypassed by scripts, aliases, alternate interpreters, absolute paths, or shell composition.
- A trusted client can request destructive operations.
- The server does not protect against compromise of the connected client or its account.
- Process-session cleanup depends on operating-system and child-process behavior and must be validated on the target host.

## Sensitive information

Bug reports and logs must not include secrets, tokens, credentials, private file contents, or unnecessary command output. Reduce reproductions to the minimum data required to demonstrate the issue.

## Reporting a vulnerability

Open a security-related issue in this repository with a minimal technical description and reproduction. For a vulnerability that should not be disclosed publicly, contact the repository owner through an appropriate private channel before publishing details.

## License and responsibility

This project is provided under the MIT License without warranty. Users are responsible for choosing an appropriate execution account, access scope, and isolation model for their environment.
