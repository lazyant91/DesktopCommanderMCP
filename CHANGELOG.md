# Changelog

All notable changes to this fork are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Added a Codex CLI reminder for Remote and Local MCP workflows that refuses ordinary recognizable local Codex launches before execution and directs web ChatGPT workflows to continue through Inline Execution; because process calls carry no trusted origin metadata, the refusal applies to every matching Local MCP process-tool call.
- Added bounded interactive-session recognition for first-token CMD `/c` or `/k` host mode, PowerShell/pwsh option values and exact `-Command -`/`-File -` stdin forms, plus bash/sh/zsh exact `-s` stdin mode with script arguments.
- Corrected bounded command segmentation so a Windows path backslash or CMD single-quote usage cannot hide a later `;`, `|`, `&`, LF, or CRLF command boundary, recognized a single leading CMD echo-control `@`, matched exact `@openai/codex@<version-or-dist-tag>` package specs, and accepted the standard `npx --` option terminator.
- Added reusable project instructions and a marked `AGENTS.md` scope block that human-direct local Codex sessions can skip.

### Security

- Documented the Codex reminder as an accidental-use workflow guardrail rather than a sandbox or hostile-caller security boundary.

## [1.0.0] - 2026-07-21

First stable release of the standalone Local MCP Server fork.

### Fork origin

- Derived from [wonderwhy-er/DesktopCommanderMCP](https://github.com/wonderwhy-er/DesktopCommanderMCP)
- Upstream baseline: `78f8f4b1cd35ccca8af4a1208f196a0466dc39b0`
- Upstream version at the baseline: `0.2.46`
- Upstream license: MIT

### Added

- Independent package identity: `@lazyant91/local-mcp-server`
- Independent MCP server identity: `local-mcp-server`
- Product-specific configuration directory: `~/.local-mcp-server`
- Fixed public surface of 15 local configuration, filesystem, and terminal-session tools
- Exact text-block editing with occurrence-count protection
- Bounded file and process-output pagination
- Server-owned process-session lifecycle and termination
- Protocol-safe stdio transport with startup log buffering
- Windows-focused unit and integration validation
- Configuration snapshot and restoration around tests
- Clean-build packaging checks that prevent stale `dist` artifacts

### Changed

- Reframed the project as a client-agnostic, headless stdio MCP server
- Reduced the source tree and dependency graph to the local execution core
- Restricted process management to sessions created by the server
- Restricted structured file operations through canonical path checks and optional allowed roots
- Replaced fuzzy editing with deterministic exact replacement
- Updated documentation, security guidance, privacy handling, contribution workflow, and attribution for the independent fork
- Added a reproducible package lock for the v1.0.0 dependency graph

### Removed

- Remote-device, cloud-backend, gateway, proxy, and hosted-service integrations
- Telemetry, analytics, install tracking, onboarding, feedback, feature flags, and experiments
- MCP App resources, embedded UI, preview cards, and client-specific rendering metadata
- Specialized PDF, DOCX, spreadsheet, image-preview, and URL-reading handlers
- Background search sessions and bundled ripgrep management
- Host-wide process enumeration and arbitrary PID termination
- Client-specific setup and uninstall flows
- Docker packaging and installers
- Claude, Cursor, Gemini, and other editor-specific plugin metadata
- Obsolete release tooling, marketing media, screenshots, and compatibility assets

### Security and privacy

- No telemetry or analytics transport is present in the server
- No hosted backend or account system is required
- Structured file roots and command blocking are documented as guardrails, not a sandbox
- Tool results are sent only to the connected MCP client in response to tool calls
- Terminal commands retain the permissions and network access of the launching operating-system user

### Validation

The release process requires an independent review, a clean build, all unit and integration tests, package inspection, configuration preservation, process cleanup checks, and final validation on the exact `main` SHA used for the tag.

[1.0.0]: https://github.com/lazyant91/DesktopCommanderMCP/releases/tag/v1.0.0