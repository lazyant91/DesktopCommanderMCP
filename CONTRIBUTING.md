# Contributing to Local MCP Server

Thank you for improving the standalone Local MCP Server.

## Scope

Changes should remain focused on the local stdio MCP product:

- local terminal and owned process sessions;
- local text-file and directory operations;
- local configuration and access policy;
- protocol-safe stdio behavior;
- tests and documentation for those capabilities.

Gateway, proxy, remote-service, hosted-backend, client-specific installation, telemetry, embedded UI, and specialized document-processing work require a separately approved scope.

## Development setup

Use Node.js 18 or newer.

```bash
npm install
npm run build
npm test
npm run test:integration
```

The repository may not have a committed lockfile until one is regenerated from the final dependency graph in a package-manager-capable environment.

## Pull requests

- Create a dedicated branch from the current `main` branch.
- Keep one bounded subsystem or cleanup slice per pull request.
- Open the pull request as Draft while implementation or review findings remain.
- State the base SHA, exact scope, explicit non-goals, changed files, and tests actually executed.
- Do not claim host-runtime behavior from compilation or static inspection alone.
- Do not add or modify GitHub Actions workflows while the repository policy prohibits hosted CI.

A separate review role must inspect the complete diff. Blocking findings are fixed before merge, and the final review result must include:

`Review passed: YES`

Draft pull requests are marked ready only after that review result. Pull requests are squash merged.

## Testing

Behavioral changes and bug fixes should begin with a focused regression test. Deletion-only slices should replace obsolete behavior tests with contracts that protect the retained product surface.

Intermediate implementation tests are development evidence, not release validation. One consolidated final local validation is performed against an exact final `main` SHA after all planned cleanup work is merged.

## Runtime-sensitive changes

Terminal lifecycle, shell quoting, output buffering, interactive input, signal handling, process cleanup, and Windows-specific behavior require explicit target-host validation. Keep those changes narrowly scoped and document what remains unverified.

## Security

The server runs with the permissions of the local user. Do not describe allowed-directory checks or the command blocklist as a complete sandbox. Avoid committing secrets, private file contents, machine-specific credentials, or unnecessary diagnostic output.

## Attribution

Retained upstream code remains under the MIT License. Preserve `LICENSE`, `THIRD_PARTY_NOTICES.md`, and relevant Git history when adapting or removing source.
