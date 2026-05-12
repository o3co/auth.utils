# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Changed

- **`gracefulShutdown(server, cleanup)` now awaits an async `cleanup`
  callback after `server.close()` drains in-flight requests.** The
  `cleanup` parameter type is widened from `() => void` to
  `() => void | Promise<void>` (backward-compatible at the call site —
  any function that previously satisfied `() => void` still satisfies
  the new union). Cleanup errors are caught with
  `console.error("gracefulShutdown: cleanup error", err)` and do not
  abort `process.exit(0)`.

  Previously, `cleanup` ran synchronously *before* `server.close()`,
  which meant any returned `Promise` was dropped on the floor — the
  process exited before async resource releases (Redis disconnects,
  database pools, file handles) could complete. The new shape is:

  1. SIGTERM/SIGINT triggers the handler.
  2. `server.close()` is registered with an async callback that fires
     once all sockets are closed; in parallel,
     `server.closeIdleConnections()` runs synchronously to release
     idle keep-alive sockets so the close callback can fire promptly.
  3. Inside the close callback, `await cleanup?.()` runs (caught +
     logged on rejection), then `process.exit(0)`.

  `server.closeIdleConnections()` deliberately leaves connections that
  are mid-request alone — those drain naturally through `server.close`,
  preserving the graceful-shutdown contract for in-flight requests.
  (Note: starting with Node.js 19.0.0, `server.close` reaps idle
  keep-alive connections on its own; the explicit
  `closeIdleConnections()` call is harmless on 19+ and necessary on
  18.x.)

  This is a behavior change. Operators relying on the old fire-and-forget
  ordering — where `cleanup` started before `server.close()` and ran
  concurrently with request draining — will now experience strictly
  sequential, awaited cleanup after the request drain. In practice, the
  new ordering is what most operators *expected* the old code to do, so
  the migration impact is typically zero.

### Added

- **`server.closeIdleConnections()` is invoked synchronously after
  `server.close()` registers its callback** so the close callback can
  fire promptly on Node 18.x without waiting for keep-alive timeouts.
  Active in-flight requests are not affected — only idle keep-alive
  connections are released. Requires Node.js >= 18.2.0; `package.json`
  now declares `engines.node >= 18.19.0` which already satisfies this.
- **`engines.node >= 18.19.0`** declared in `package.json` to match the
  consumer floor (`auth.provider`) and to fail fast for installers on
  pre-18.2 Node where `closeIdleConnections` is undefined.
- **Idempotent under repeated signal delivery.** A `shuttingDown` guard
  in the handler returns early on the second SIGTERM / SIGINT, and the
  signal listeners are removed on first invocation. Operators that send
  multiple SIGTERMs (k8s sending repeated TERM before falling back to
  SIGKILL, or operators pressing Ctrl+C several times) no longer cause
  duplicated `cleanup()` invocations or duplicate `process.exit(0)`
  calls.

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

## [0.0.3] — 2026-04-14

- CI / publishing infrastructure: OIDC Trusted Publishing, dependabot,
  pnpm store cache, idempotent release workflow, badges.
