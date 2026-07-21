# Contributing to Local MCP Server

Thank you for improving the standalone Local MCP Server.

## Product scope

Changes should remain focused on the local stdio MCP product:

- local terminal and server-owned process sessions;
- local text-file and directory operations;
- local configuration and access policy;
- protocol-safe stdio behavior;
- tests and documentation for those capabilities.

Gateway, proxy, tunnel, hosted-backend, client-specific installation, telemetry, embedded UI, specialized document processing, background search management, Docker packaging, and host-wide process control require a separately approved scope.

## Development setup

Use Node.js 18 or newer.

```bash
npm ci
npm run build
npm test
npm run test:integration
```

`package-lock.json` records the reviewed dependency graph. Update it in the same pull request whenever package dependencies change.

For protocol inspection:

```bash
npm run inspector
```

## Branch and pull request workflow

- Create a dedicated branch from the current `main` branch.
- Keep one bounded subsystem, documentation update, or cleanup slice per pull request.
- Do not commit feature, bug-fix, or release preparation directly to `main`.
- Open the pull request as Draft while implementation or review findings remain.
- State the base SHA, exact scope, explicit non-goals, changed files, and commands actually executed.
- Do not claim host-runtime behavior from compilation or static inspection alone.
- Do not add or modify GitHub Actions workflows while the repository policy prohibits hosted CI.

A separate review role must inspect the complete diff. Blocking findings are fixed before merge, and the review result must include exactly:

```text
Review passed: YES
```

Draft pull requests are marked ready only after review passes. Pull requests are squash merged, and the feature branch is deleted when tooling permits.

## Testing policy

Behavioral changes and bug fixes should begin with a focused regression test:

1. add or narrow a test that demonstrates the problem;
2. observe the expected failure;
3. implement the minimum change;
4. run focused and relevant suites;
5. record the results without overstating coverage.

Deletion-only and documentation slices should update contracts that protect the retained product surface and prevent removed product material from returning.

The standard commands are:

```bash
npm run build
npm test
npm run test:integration
npm pack --dry-run --ignore-scripts
npm run clean
git diff --check
```

## Runtime-sensitive changes

Terminal lifecycle, shell quoting, output buffering, interactive input, signal handling, process cleanup, path canonicalization, and Windows-specific behavior require explicit target-host validation.

Keep those changes narrowly scoped and document:

- the operating system and runtime versions;
- exact base and head SHAs;
- commands executed and exit results;
- skipped cases and known warnings;
- any configuration or process state that was preserved.

## Release workflow

A release is created only after:

1. all planned pull requests are independently reviewed and squash merged;
2. `main` is clean and matches `origin/main`;
3. the version is consistent in package metadata, source, documentation, and changelog;
4. final local validation passes on the exact `main` SHA;
5. the release report records `Release validation: PASS`;
6. the release tag points to that exact validated SHA.

GitHub Actions are intentionally not used as a merge or release gate. Release artifacts are built locally from the validated revision.

## Documentation requirements

User-facing documentation must describe only the standalone Local MCP product. Do not restore upstream claims for telemetry, hosted services, UI previews, specialized file formats, Docker images, editor plugins, or client-specific setup unless those features are separately approved and implemented.

When changing the public tool surface, update:

- `README.md`;
- `FAQ.md` when behavior affects common usage;
- `SECURITY.md` or `PRIVACY.md` when trust or data handling changes;
- `CHANGELOG.md` for release-visible changes;
- contract tests that enumerate the product surface.

## Security

The server runs with the permissions of the local user. Do not describe allowed-directory checks or the command blocklist as a complete sandbox.

Avoid committing secrets, private file contents, machine-specific credentials, generated user configuration, or unnecessary diagnostic output. Follow [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Attribution

Retained upstream code remains under the MIT License. Preserve `LICENSE`, `THIRD_PARTY_NOTICES.md`, and relevant Git history when adapting or removing source. Do not describe this fork as an official upstream release.