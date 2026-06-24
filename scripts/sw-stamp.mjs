// Shared helpers for stamping a UNIQUE version into the service worker at build
// time. The version string is the SW's cache key AND its update trigger: because
// every build produces a different string, the bytes of /sw.js change on every
// deploy, so the browser always detects a new worker (no more hand-bumped mpm-vN).
//
// Used by vite.config.js (build plugin) and exercised by sw-stamp.test.js.

// A new id per build: ms timestamp (sortable) + random suffix so two builds can
// never collide, even within the same millisecond. Args injectable for testing.
export function makeBuildId(now = Date.now(), rand = Math.random()) {
  return 'mpm-' + now.toString(36) + '-' + rand.toString(36).slice(2, 8)
}

// Replace the __SW_VERSION__ placeholder in public/sw.js with the build id.
export function stampServiceWorker(source, buildId) {
  return source.replace(/__SW_VERSION__/g, buildId)
}
