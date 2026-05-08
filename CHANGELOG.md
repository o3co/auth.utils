# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.0.4] — Unreleased

### Changed

- **`gracefulShutdown(server, cleanup)` now awaits an async `cleanup`
  callback after `server.close()` drains in-flight requests.** The
  `cleanup` parameter type is widened from `() => void` to
  `() => void | Promise<void>` (backward-compatible at the call site —
  any function that previously satisfied `() => void` still satisfies
  the new union). Cleanup errors are caught individually with
  `console.error("gracefulShutdown: cleanup error", err)` and do not
  abort `process.exit(0)`.

  Previously, `cleanup` ran synchronously *before* `server.close()`,
  which meant any returned `Promise` was dropped on the floor — the
  process exited before async resource releases (Redis disconnects,
  database pools, file handles) could complete. Now the order is:

  1. SIGTERM/SIGINT triggers the handler
  2. `server.close()` drains in-flight requests
  3. `server.closeAllConnections()` drains keep-alive sockets (Node.js
     >= 18.2.0)
  4. `await cleanup?.()` (caught + logged on rejection)
  5. `process.exit(0)`

  This is a behavior change. Operators relying on the old fire-and-forget
  ordering — where `cleanup` started before `server.close()` and ran
  concurrently with request draining — will now experience strictly
  sequential, awaited cleanup. In practice, the new ordering is what
  most operators *expected* the old code to do, so the migration impact
  is typically zero.

### Added

- **`server.closeAllConnections()` is invoked alongside `server.close()`**
  to drain keep-alive sockets that the latter alone leaves hanging on
  modern Express / HTTP/1.1 deployments. Requires Node.js >= 18.2.0
  (already an effective floor for this package's consumers).

### Migration

The signature widening from `() => void` to `() => void | Promise<void>`
is structurally backward-compatible: every previous caller's `cleanup`
shape still satisfies the new type. No code change is required at call
sites unless the caller explicitly wants to take advantage of awaited
async cleanup (e.g., switching from
`() => { redis.disconnect(); }` to
`async () => { await redis.disconnect(); }`).

For callers in `o3co/auth.provider` `templates/standalone/src/app.mts`:
the existing call `gracefulShutdown(server, () => handle.dispose())` was
already passing a function returning a `Promise` that the old code was
silently dropping. After this release, `handle.dispose()` is properly
awaited before `process.exit(0)` runs.

## [0.0.3] — 2026-04-18

- CI / publishing infrastructure: OIDC Trusted Publishing, dependabot,
  pnpm store cache, idempotent release workflow, badges.
