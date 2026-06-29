// Marketing attribution capture (UTM first/last touch). Pairs with
// /api/track-attribution + db/migration-7. The landing site (different origin →
// no shared storage) forwards utm_* + referrer + landing_path into the app URL;
// here we read them, keep a FIRST touch (set once) and a LAST touch (latest),
// and best-effort POST them so the funnel can be measured. Never blocks the app.

const FIRST_KEY = 'mpm-attr-first'
const LAST_KEY  = 'mpm-attr-last'

// Read the current URL's attribution signal into a touch, or null if there is
// nothing worth recording (no utm source AND no forwarded/real referrer). We don't
// want a row for every organic visitor — only attributed ones.
function readTouch() {
  try {
    const p = new URLSearchParams(window.location.search)
    const touch = {
      source:       p.get('utm_source')   || null,
      medium:       p.get('utm_medium')   || null,
      campaign:     p.get('utm_campaign') || null,
      content:      p.get('utm_content')  || null,
      referrer:     p.get('mpm_ref')      || (document.referrer || null),
      landing_path: p.get('mpm_lp')       || (window.location.pathname + window.location.search),
      captured_at:  new Date().toISOString(),
    }
    if (!touch.source && !touch.referrer) return null
    return touch
  } catch { return null }
}

function load(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}

// Capture this visit. first-touch is written once; last-touch overwrites on each
// attributed visit. Safe to call on every load.
export function captureAttribution() {
  const touch = readTouch()
  if (touch) {
    if (!load(FIRST_KEY)) {
      try { localStorage.setItem(FIRST_KEY, JSON.stringify(touch)) } catch {}
    }
    try { localStorage.setItem(LAST_KEY, JSON.stringify(touch)) } catch {}
  }
}

export function getAttribution() {
  return { first: load(FIRST_KEY), last: load(LAST_KEY) }
}

export function hasAttribution() {
  return !!(load(FIRST_KEY) || load(LAST_KEY))
}

// Best-effort POST to the server.
//   mode 'stamp' → attribute the caller's own session (token = current session).
//   mode 'link'  → copy the touches onto a freshly created account (targetUserId),
//                  authorized by the still-valid guest token. Used right after signUp.
// Attribution must NEVER block or break the app — all errors are swallowed.
export async function trackAttribution({ token, mode = 'stamp', targetUserId } = {}) {
  if (!token || !hasAttribution()) return
  const { first, last } = getAttribution()
  try {
    await fetch('/api/track-attribution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode, targetUserId, firstTouch: first, lastTouch: last }),
    })
  } catch { /* best-effort */ }
}
