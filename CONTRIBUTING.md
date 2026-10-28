# Contributing

[English](CONTRIBUTING.md) · [简体中文](CONTRIBUTING.zh-CN.md)

Thanks for improving `opencode-deepseek-search`.

## Before you start

- Read the root `AGENTS.md`.
- Read the OpenCode V2 plugin documentation and the relevant OpenCode implementation when changing plugin APIs.
- Do not include API keys, server passwords, signed URLs, or private page content in commits, tests, logs, or issue reports.
- Prefer network-free tests. Paid DeepSeek API calls are not part of CI.

## Local setup

```sh
bun install
bun run format
bun run test
bun run check
```

Useful commands:

```sh
bun run format        # rewrite supported files with Bun
bun run format:check  # verify formatting
bun run test          # network-free tests
bun run typecheck     # TypeScript only
bun run build         # GUI bundle
bun run check         # formatting, typecheck, and build
```

## Architecture rules

Keep changes in the layer that owns the contract:

- `src/rpc.ts` owns public cross-process RPC schemas and types.
- `src/server/http.ts` owns the shared DeepSeek HTTP transport, retries, and response bounds.
- `src/server/search.ts` and `src/server/fetch.ts` own the endpoint-specific schemas and normalization.
- `src/server/plugin.ts` owns OpenCode registration, permissions, credential use, and mapping to tools/providers/RPC.
- `src/server/format.ts` owns model-facing text rendering and total output budgets.
- `src/gui/` owns Desktop presentation and calls the current session server through RPC.

Do not duplicate public schemas or domain interfaces in callers. Keep DeepSeek's snake_case wire schema separate from the camelCase OpenCode contract because they are different external boundaries.

## GUI plugin rules

- Keep GUI feature switches in persistent `Store.global` state. Settings is always available; other entry points must be gated by their switches.
- Use `ctx.ui` primitives and OpenCode theme tokens before adding custom controls or visual contracts.
- Opening a panel or restoring cached results must not trigger a paid DeepSeek request. Only explicit search actions may call Search.
- Keep server data and GUI cache boundaries explicit: session-local result reuse is not the same as persisted search history.

## Tool and permission changes

When adding or changing a tool:

1. define the input/output schema at the tool boundary;
2. document whether it is direct-call only or also Code Mode;
3. pass the session signal or use Effect interruption for cancellable work;
4. perform permission assertions before remote side effects;
5. cap model-facing output;
6. add a network-free test for validation, formatting, or retry behavior.

Keep the built-in `webfetch` contract intact. This plugin adds DeepSeek Fetch; it does not silently replace OpenCode's native fetch behavior.

## Tests

Tests must not require an API key or network access. Use fake HTTP responses and deterministic `Retry-After` values. Test observable behavior such as:

- credential precedence;
- URL and option validation;
- retry and cancellation behavior;
- bounded response and output sizes;
- malformed upstream response handling;
- tool formatting and untrusted-content markers.

Do not assert implementation strings or create tests that only prove a test exists.

## Pull requests

Keep pull requests focused. Include:

- a short explanation of the user-visible behavior;
- the affected boundary or contract;
- tests or a reason tests are not applicable;
- documentation updates for new options, permissions, or billing behavior;
- the exact commands used for verification.

Avoid drive-by formatting changes. Run `bun run format` only when the formatting configuration or the intended change requires it.

## Documentation

Update both `README.md` and `README.zh-CN.md` when changing public behavior. Update both contribution guides when changing development workflow or repository policy.

## Security

Do not report secrets in public issues. For a suspected vulnerability, provide a minimal redacted reproduction privately to the maintainers instead of opening a public issue with credentials or page data.
