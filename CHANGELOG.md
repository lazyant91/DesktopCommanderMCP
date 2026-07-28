# Changelog

All notable changes to this fork are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Added a bounded PowerShell/CMD directory deletion validator for initial terminal commands and input sent to owned interactive sessions.
- Added focused coverage for routine direct deletions, malformed quoting, variables and multiple targets, unsupported options or shell escapes, chained commands, PowerShell aliases, CMD `@` and `call` prefixes, filesystem roots, ambiguous paths, compound control flow, nested interpreter payloads, and interactive session shell tracking.

### Security

- Only one direct directory deletion command in the active shell with exactly one static target is allowed; filesystem roots and root wildcards are always refused before execution or stdin delivery.
- Directory-delete intent inside chained commands, PowerShell/CMD control flow, CMD `call`, or nested interpreters is refused rather than relying on an agent to reproduce cross-shell quoting and argument-conversion rules.
- Drive-relative paths, PowerShell providers or expressions, variables, wildcards, home expansion, malformed syntax, unsupported options, and multi-target deletion return an actionable error.
- Interactive deletion requires a fully qualified path, directly launched nested PowerShell/CMD sessions are checked using their actual input shell, and stale PID contexts are pruned.
- The guard remains an accidental-error stop line rather than a sandbox or hostile-caller defense; script contents, encoded/generated commands, alternate deletion programs, and non-shell filesystem APIs remain outside its bounded inspection scope.

## [1.0.1] - 2026-07-27

Maintenance release adding a thin Codex CLI reminder for web ChatGPT workflows that use Remote or Local MCP.

### Added

- Added a bounded pre-execution reminder in `start_process` for obvious direct Codex CLI launches.
- Recognized direct `codex`, `codex.exe`, `codex.cmd`, and `codex.ps1` executables, fixed npm/npx package-launch forms, and explicit or configured Codex shell executables.
- Added detector, process-level, and documentation contract tests for the supported refusal boundary.

### Security

- Refused recognized Codex launches before command validation or process creation.
- Documented the reminder as an accidental-use stop line rather than a complete block, sandbox, hostile-caller defense, or security boundary.
- Kept chained or later commands, multiline follow-up commands, aliases, wrappers, scripts, environment prefixes, CMD `@`, versioned package specifications, and `interact_with_process` input outside the intentionally narrow scope.

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

[Unreleased]: https://github.com/lazyant91/DesktopCommanderMCP/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/lazyant91/DesktopCommanderMCP/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/lazyant91/DesktopCommanderMCP/releases/tag/v1.0.0
