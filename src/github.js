import { locateBySeed } from './locations.js'

// Classify a raw GitHub event into a coarse type we render with a color.
export function classify(type) {
  switch (type) {
    case 'PushEvent':
      return 'commit'
    case 'WatchEvent':
      return 'star'
    case 'PullRequestEvent':
    case 'PullRequestReviewEvent':
    case 'PullRequestReviewCommentEvent':
      return 'pr'
    case 'IssuesEvent':
    case 'IssueCommentEvent':
      return 'issue'
    default:
      return 'other'
  }
}

function summarize(ev) {
  const kind = classify(ev.type)
  const repo = ev.repo?.name ?? 'unknown/repo'
  const actor = ev.actor?.login ?? 'someone'
  if (kind === 'commit') {
    const n = ev.payload?.commits?.length ?? ev.payload?.size ?? 1
    return `${actor} pushed ${n} commit${n === 1 ? '' : 's'} to ${repo}`
  }
  if (kind === 'star') return `${actor} starred ${repo}`
  if (kind === 'pr') return `${actor} opened/updated a PR in ${repo}`
  if (kind === 'issue') return `${actor} touched an issue in ${repo}`
  return `${actor} → ${repo} (${ev.type})`
}

// Normalize a raw event to what the globe needs.
function normalize(ev) {
  const loc = locateBySeed(ev.actor?.login || ev.repo?.name || ev.id)
  return {
    id: ev.id,
    kind: classify(ev.type),
    text: summarize(ev),
    repo: ev.repo?.name,
    actor: ev.actor?.login,
    lat: loc.lat,
    lng: loc.lng,
    city: loc.name
  }
}

// Poll the public Events API. In dev we hit the Vite proxy (/gh) to dodge CORS.
// Returns only events we haven't emitted before, oldest-first.
export function createEventSource({ onEvents, onStatus } = {}) {
  const base = import.meta.env.DEV ? '/gh' : 'https://api.github.com'
  const seen = new Set()
  let etag = null
  let timer = null
  let stopped = false

  // Poll as fast as the rate budget allows. GitHub charges one request per poll
  // even for a 304, and unauthenticated is only 60/hr — so without a token the
  // sustainable rate is ~60s. With a token (5000/hr, attached by the dev proxy)
  // we can poll every few seconds for a near-live feed. We self-tune by
  // spreading the remaining budget over the time until it resets. (GitHub's
  // public firehose is itself ~5 min delayed, so that's the latency floor.)
  const FAST_MS = 2000
  const SLOW_MS = 60000
  let pollMs = FAST_MS

  async function tick() {
    if (stopped) return
    try {
      const headers = { Accept: 'application/vnd.github+json' }
      if (etag) headers['If-None-Match'] = etag
      const res = await fetch(`${base}/events?per_page=100`, { headers })

      const remaining = Number(res.headers.get('X-RateLimit-Remaining'))
      const reset = Number(res.headers.get('X-RateLimit-Reset')) // epoch seconds
      if (Number.isFinite(remaining) && Number.isFinite(reset)) {
        const msToReset = Math.max(reset * 1000 - Date.now(), 1000)
        const budget = Math.max(remaining - 2, 1) // keep a small reserve
        pollMs = Math.min(Math.max(msToReset / budget, FAST_MS), SLOW_MS)
      } else {
        pollMs = FAST_MS
      }

      const every = Math.round(pollMs / 1000)
      if (res.status === 304) {
        onStatus?.({ ok: true, note: 'live · watching', remaining, every })
      } else if (res.ok) {
        etag = res.headers.get('ETag') || etag
        const raw = await res.json()
        const fresh = []
        for (const ev of raw) {
          if (seen.has(ev.id)) continue
          seen.add(ev.id)
          fresh.push(normalize(ev))
        }
        // Trim the seen-set so it can't grow forever.
        if (seen.size > 5000) {
          const arr = [...seen].slice(-3000)
          seen.clear()
          arr.forEach((x) => seen.add(x))
        }
        fresh.reverse() // API is newest-first; emit oldest-first
        onStatus?.({ ok: true, note: `live · +${fresh.length}`, remaining, every })
        if (fresh.length) onEvents?.(fresh, pollMs)
      } else if (res.status === 403 || res.status === 429) {
        // Rate limited — back off hard, then resume.
        pollMs = SLOW_MS
        onStatus?.({ ok: false, note: 'rate limited — slowing', remaining })
      } else {
        throw new Error(`HTTP ${res.status}`)
      }
    } catch (err) {
      onStatus?.({ ok: false, note: `${err.message}`, remaining: null })
      pollMs = FAST_MS
    } finally {
      if (!stopped) timer = setTimeout(tick, pollMs)
    }
  }

  // Steady heartbeat: emit a simulated origin point ~1.6x/second so the globe
  // lights up every second even while GitHub is between refreshes. Real events
  // (from tick) fire on top and drive the feed + leaderboards.
  const heartbeat = setInterval(() => {
    if (!stopped) onEvents?.(simulateBatch(1))
  }, 300)

  tick()
  return {
    stop() {
      stopped = true
      clearTimeout(timer)
      clearInterval(heartbeat)
    }
  }
}

// --- Simulated activity ------------------------------------------------------
// Realistic-looking filler so the stream stays alive between GitHub refreshes.
const KINDS = ['commit', 'commit', 'commit', 'commit', 'star', 'pr', 'issue', 'other']
const BOTS = ['github-actions[bot]', 'dependabot[bot]', 'renovate[bot]']
const NAMES = [
  'alexk', 'yuki', 'marco', 'priya', 'chen', 'sam', 'lena', 'diego', 'omar',
  'noa', 'ivan', 'mei', 'raj', 'tom', 'ana', 'kai', 'sara', 'leo', 'wei', 'nina'
]
const SLUGS = [
  'app', 'api', 'web', 'core', 'bot', 'data', 'ml-pipeline', 'dashboard', 'cli',
  'docs', 'infra', 'sandbox', 'portfolio', 'notes', 'engine', 'toolkit', 'service'
]

let simSeed = Date.now()
function rand() {
  simSeed = (simSeed * 1103515245 + 12345) & 0x7fffffff
  return simSeed / 0x7fffffff
}
function pick(arr) {
  return arr[Math.floor(rand() * arr.length)]
}
let simN = 0

export function simulateBatch(n = 6) {
  const out = []
  for (let i = 0; i < n; i++) {
    const kind = pick(KINDS)
    const actor = rand() < 0.22 ? pick(BOTS) : pick(NAMES) + Math.floor(rand() * 9000)
    const owner = rand() < 0.3 ? pick(NAMES) + Math.floor(rand() * 900) : actor
    const repo = `${owner}/${pick(SLUGS)}`
    const loc = locateBySeed(actor + repo)
    const verb =
      kind === 'commit' ? 'pushed 1 commit to' :
        kind === 'star' ? 'starred' :
          kind === 'pr' ? 'opened a PR in' :
            kind === 'issue' ? 'filed an issue in' : 'created'
    out.push({
      id: `sim-${simSeed}-${simN++}`,
      kind,
      text: `${actor} ${verb} ${repo}`,
      repo,
      actor,
      lat: loc.lat,
      lng: loc.lng,
      city: loc.name,
      sim: true
    })
  }
  return out
}
