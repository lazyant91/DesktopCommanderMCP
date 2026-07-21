# Third-Party Notices

## DesktopCommanderMCP

Local MCP Server was derived from the open-source DesktopCommanderMCP project:

- Upstream repository: https://github.com/wonderwhy-er/DesktopCommanderMCP
- Upstream baseline used for the fork: `78f8f4b1cd35ccca8af4a1208f196a0466dc39b0`
- Upstream release version at that baseline: `0.2.46`
- License: MIT
- Copyright: Copyright (c) 2024-2025 Eduard Ruzga and Desktop Commander Contributors

Retained and adapted portions include the stdio MCP server foundation, terminal and process-session implementation, local filesystem and path-policy implementation, configuration management, and related tests.

After the fork, the repository was reduced to a standalone local stdio server. Remote services, telemetry, embedded UI, specialized document handlers, background search management, global process control, client-specific installers, Docker packaging, and obsolete product assets were removed.

The upstream MIT license text is preserved in [LICENSE](LICENSE). Git history records the original source and subsequent modifications.

This fork is independently maintained by lazyant91 and is not presented as an official DesktopCommanderMCP release.