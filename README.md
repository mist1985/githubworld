# GitHub Globe

A rotating 3D globe that comes alive with GitHub's public activity. Every commit,
star, pull request and issue from the [public Events API](https://docs.github.com/en/rest/activity/events)
lands somewhere on Earth and bursts outward as a spray of colored particles.

Built with **Vue 3** + **Three.js** + **Vite**.

![preview](preview.png)

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

Then `npm run build` / `npm run preview` for a production bundle.

## How it works

| Piece | File | Notes |
|-------|------|-------|
| Event stream | `src/github.js` | Polls `/events` (via a Vite proxy to dodge CORS), dedupes by id, respects GitHub's `X-Poll-Interval`, and **falls back to synthetic events** if the API is unreachable or rate-limited — so the globe is never dead. |
| Geolocation | `src/locations.js` | GitHub doesn't expose event locations, so each actor is **deterministically hashed** onto one of ~34 world cities (weighted toward dev hubs) with a little jitter. The same author always lands in the same place. |
| Rendering | `src/globe.js` | **Dotted-continents globe** — thousands of evenly spread points, kept only where they fall on land by sampling `public/earth.jpg` (an equirectangular Earth map) against the same lat/lng projection the bursts use. Plus an atmosphere glow shader, starfield, and a pooled particle system (6k particles) + ring-pulse pool for the bursts. |

> `public/earth.jpg` (a 2048×1024 land map) is required for the continents. If it's missing the globe falls back to a uniform dotted sphere.
| UI / loop | `src/App.vue` | Animation loop, drag-to-rotate / scroll-to-zoom, and the HUD (counters, legend, live ticker). |

Events are dripped out of a queue a couple per frame rather than all at once, so a
batch of 100 polled events reads as a lively continuous stream.

### Colors

| Color | Event |
|-------|-------|
| 🟢 green | push / commit |
| 🟡 amber | star |
| 🟣 purple | pull request |
| 🔴 red | issue |
| 🔵 blue | other |

## Deploy to GitHub Pages

It's a static site — no server needed. The browser calls `api.github.com`
directly (GitHub allows CORS), assets use relative paths (`base: './'`), so it
works from a project subpath.

A workflow is included at `.github/workflows/deploy.yml`:

1. Push this repo to GitHub with the default branch named `main`.
2. In **Settings → Pages**, set **Source: GitHub Actions**.
3. Push — the workflow builds and publishes automatically.

On Pages it runs **unauthenticated** (60 req/hr per visitor IP → ~60s polling,
still a continuous stream). **Do not** bake a token into the build — it would be
public in the bundle. The token path (below) is for local runs only.

## How live is it?

Two hard limits come from GitHub, not this app:

1. **The public firehose is ~5 minutes delayed.** The newest event the `/events`
   endpoint will ever hand you is about 5 minutes old. There is no lower-latency
   public REST feed.
2. **Rate limits.** Unauthenticated = **60 requests/hour**, and every poll costs
   one request (even a `304 Not Modified` — I verified). So without a token the
   fastest *sustainable* poll rate is ~60s.

Within those limits the app is as live as possible: events light up **the instant
a poll returns them** (no artificial delay), and the poll rate **self-tunes** to
the remaining budget — spreading requests over the reset window so it never locks
itself out.

### Near-live: add a token

A token raises the limit to **5,000/hour**, so the app polls every ~3s — new
events appear within a few seconds (still bounded by GitHub's 5-min feed delay).
The dev proxy attaches it server-side, so it never reaches the browser:

```bash
GITHUB_TOKEN=ghp_your_token npm run dev
```

A classic token with **no scopes** (public data only) is enough.

If you ever do hit the limit, it backs off and falls back to simulated events so
the globe is never dead.

## Author & license

**Mihajlo Stojanovski** — v1.0, July 2026
Licensed under the [MIT License](LICENSE).
