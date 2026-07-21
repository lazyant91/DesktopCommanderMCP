# Privacy and Data Handling

**Effective date: July 21, 2026**

## Summary

Local MCP Server runs on the user's machine and communicates with one connected MCP client over stdio. The server does not include telemetry, analytics, advertising, installation tracking, feedback collection, a hosted backend, an account system, or a server-managed remote service.

The server processes data only to perform requested local tool calls. It does not independently upload file contents, command history, usage events, identifiers, or system information to this repository's maintainer.

## Data handled locally

Depending on the tool called, the server may access or generate:

- local file paths, text-file contents, and directory listings;
- file and directory metadata;
- terminal commands, standard output, and standard error;
- interactive process input and process-session state;
- local configuration and host information returned by `get_config`.

This information is held in local process memory or local configuration files as required to perform the operation.

## Data sent to the MCP client

Tool results and MCP logging notifications are sent to the connected MCP client through stdin and stdout. The client may then transmit some or all of that information to a model provider or another service according to the client's configuration and privacy policy.

This repository cannot control or audit what an external MCP client does with tool arguments, tool results, conversation content, or logs. Users should connect only clients and accounts they trust.

## Network access

The Local MCP Server has no built-in analytics or hosted-service transport. However, commands launched through `start_process` run with the permissions of the operating-system user and may access the network when the command itself does so.

Examples include package managers, Git clients, web-request tools, SSH clients, and custom scripts. Network activity created by those commands belongs to the invoked program, not to a telemetry feature in this server.

## Configuration storage

Configuration is stored locally at:

```text
~/.local-mcp-server/config.json
```

The configuration can contain command-blocking rules, allowed directory roots, a default shell, and read/write limits. It does not contain a telemetry client identifier or analytics opt-in state because those features are not part of this fork.

## Retention

The project maintainer does not receive or retain local tool data through the server.

Local retention depends on the operation:

- configuration remains until the user edits or deletes the local configuration file;
- process output remains in bounded server memory while its owned session is retained;
- files created or modified by tools remain on the local filesystem;
- an MCP client may retain conversation and tool data under its own policy.

## Sensitive information

Terminal output and file contents can contain secrets, tokens, credentials, private source code, personal data, and internal system details. Users should:

- restrict structured file access to necessary directories;
- avoid sending secrets through prompts or issue reports;
- review commands that may print environment variables or credentials;
- use a separate operating-system account or virtual machine for stronger isolation;
- understand the privacy policy of the connected MCP client and model provider.

## Bug reports

Issue reports must not include private file contents, access tokens, passwords, API keys, personal information, or unnecessary command output. Provide the smallest sanitized reproduction that demonstrates the problem.

## Changes to this document

Material changes to data handling will be documented in the changelog and this file. A future feature that transmits data outside the local stdio connection must not be introduced silently and would require an explicit design, review, and documentation update.

## Contact

Open a repository issue for general privacy questions that do not contain sensitive information. For a private concern, contact the repository owner through an appropriate private GitHub channel.

This document describes only the independent Local MCP Server fork. The upstream project and external MCP clients have their own policies.