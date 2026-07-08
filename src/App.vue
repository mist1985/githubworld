<script setup>
import { onMounted, onBeforeUnmount, ref, reactive, computed } from 'vue'
import { createGlobe } from './globe.js'
import { createEventSource } from './github.js'

const canvasEl = ref(null)
const status = reactive({ ok: false, note: 'connecting…', remaining: null, every: null })
const counts = reactive({ commit: 0, star: 0, pr: 0, issue: 0, other: 0, total: 0 })
const feed = ref([]) // recent events for the ticker
const mode = ref('globe') // 'globe' | 'map'

// Running tallies for the leaderboards (this session).
const repoTally = reactive({})
const userTally = reactive({})
function top5(tally) {
  return Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, n]) => ({ name, n }))
}
const topRepos = computed(() => top5(repoTally))
const topUsers = computed(() => top5(userTally))


function setMode(m) {
  mode.value = m
  globe?.setMode(m)
}

const LEGEND = [
  { kind: 'commit', label: 'push / commit', color: '#39d353' },
  { kind: 'star', label: 'star', color: '#e3b341' },
  { kind: 'pr', label: 'pull request', color: '#a371f7' },
  { kind: 'issue', label: 'issue', color: '#f85149' },
  { kind: 'other', label: 'other', color: '#58a6ff' }
]

let globe = null
let source = null
let raf = 0

onMounted(() => {
  globe = createGlobe(canvasEl.value)
  const { renderer, camera, scene, world, atmosphere } = globe

  // Allow deep-linking a view, e.g. #map.
  if (location.hash.includes('map')) setMode('map')

  // --- Sizing ----------------------------------------------------------------
  function resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)

  // --- Pointer controls (drag to spin, wheel to zoom) ------------------------
  const rot = { x: -0.35, y: 0 }
  let autoSpin = 0.05
  let dragging = false
  let last = { x: 0, y: 0 }
  let idleTimer = null

  function onDown(e) {
    dragging = true
    autoSpin = 0
    last = { x: e.clientX ?? e.touches[0].clientX, y: e.clientY ?? e.touches[0].clientY }
  }
  function onMove(e) {
    if (!dragging) return
    const x = e.clientX ?? e.touches[0].clientX
    const y = e.clientY ?? e.touches[0].clientY
    rot.y += (x - last.x) * 0.005
    rot.x += (y - last.y) * 0.005
    rot.x = Math.max(-1.2, Math.min(1.2, rot.x))
    last = { x, y }
  }
  function onUp() {
    dragging = false
    clearTimeout(idleTimer)
    // Resume gentle auto-spin after a moment of inactivity.
    idleTimer = setTimeout(() => (autoSpin = 0.05), 2500)
  }
  function onWheel(e) {
    e.preventDefault()
    const d = camera.position.length() + e.deltaY * 0.001
    const clamped = Math.max(1.6, Math.min(6, d))
    camera.position.setLength(clamped)
  }

  const c = canvasEl.value
  c.addEventListener('mousedown', onDown)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  c.addEventListener('touchstart', onDown, { passive: true })
  window.addEventListener('touchmove', onMove, { passive: true })
  window.addEventListener('touchend', onUp)
  c.addEventListener('wheel', onWheel, { passive: false })

  // --- Render loop -----------------------------------------------------------
  let prev = performance.now()
  function frame(now) {
    raf = requestAnimationFrame(frame)
    const dt = Math.min((now - prev) / 1000, 0.05)
    prev = now

    // Only the 3D globe spins; the flat map stays put.
    if (mode.value === 'globe') {
      rot.y += autoSpin * dt
      world.rotation.x = rot.x
      world.rotation.y = rot.y
      atmosphere.rotation.y = rot.y * 0.3
    }

    globe.step(dt)
    renderer.render(scene, camera)
  }
  raf = requestAnimationFrame(frame)

  // --- Event source ----------------------------------------------------------
  source = createEventSource({
    onEvents(events) {
      // Every event lights the globe instantly (same place → a fresh flash each
      // time) and streams into the feed, counters and leaderboards, so the left
      // side always shows commits coming in.
      for (const ev of events) {
        globe.burst(ev.lat, ev.lng, ev.kind)
        counts[ev.kind] = (counts[ev.kind] ?? 0) + 1
        counts.total++
        if (ev.repo) repoTally[ev.repo] = (repoTally[ev.repo] ?? 0) + 1
        if (ev.actor) userTally[ev.actor] = (userTally[ev.actor] ?? 0) + 1
      }
      feed.value = [...[...events].reverse(), ...feed.value].slice(0, 14)
    },
    onStatus(s) {
      status.ok = s.ok
      status.note = s.note
      if (s.remaining != null && !Number.isNaN(s.remaining)) status.remaining = s.remaining
      if (s.every) status.every = s.every
    }
  })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  source?.stop()
  globe?.dispose()
  window.removeEventListener('resize', () => {})
})
</script>

<template>
  <div class="stage">
    <canvas ref="canvasEl"></canvas>

    <!-- Title -->
    <header class="hud top-left">
      <h1>GitHub&nbsp;Globe</h1>
      <p class="sub">live public activity · cities light up where events land</p>
      <div class="status" :class="{ live: status.ok }">
        <span class="dot"></span>
        <span>{{ status.note }}</span>
        <span v-if="status.every" class="rl">· every {{ status.every }}s</span>
        <span v-if="status.remaining != null" class="rl">· {{ status.remaining }} req left</span>
      </div>
    </header>

    <!-- Counters -->
    <div class="hud top-right counters">
      <div class="total">
        <span class="n">{{ counts.total.toLocaleString() }}</span>
        <span class="k">events</span>
      </div>
      <ul class="legend">
        <li v-for="l in LEGEND" :key="l.kind">
          <span class="swatch" :style="{ background: l.color }"></span>
          <span class="lbl">{{ l.label }}</span>
          <span class="cnt">{{ counts[l.kind].toLocaleString() }}</span>
        </li>
      </ul>
    </div>

    <!-- View toggle -->
    <div class="hud top-center toggle">
      <button :class="{ on: mode === 'globe' }" @click="setMode('globe')">Globe</button>
      <button :class="{ on: mode === 'map' }" @click="setMode('map')">Map</button>
    </div>

    <!-- Leaderboards -->
    <div class="hud left-mid boards">
      <div class="board">
        <div class="board-h">Top repos</div>
        <div v-for="r in topRepos" :key="r.name" class="board-row">
          <span class="board-n">{{ r.n }}</span>
          <span class="board-name">{{ r.name }}</span>
        </div>
        <div v-if="!topRepos.length" class="board-empty">waiting…</div>
      </div>
      <div class="board">
        <div class="board-h">Top users</div>
        <div v-for="u in topUsers" :key="u.name" class="board-row">
          <span class="board-n">{{ u.n }}</span>
          <span class="board-name">{{ u.name }}</span>
        </div>
        <div v-if="!topUsers.length" class="board-empty">waiting…</div>
      </div>
    </div>

    <!-- Live ticker -->
    <div class="hud bottom-left feed">
      <transition-group name="fade">
        <div v-for="ev in feed" :key="ev.id" class="row">
          <span class="pip" :class="'k-' + ev.kind"></span>
          <span class="txt">{{ ev.text }}</span>
          <span class="loc">{{ ev.city }}</span>
        </div>
      </transition-group>
    </div>

    <div class="hud bottom-right hint">drag to rotate · scroll to zoom</div>
  </div>
</template>

<style scoped>
.stage {
  position: fixed;
  inset: 0;
}
canvas {
  position: absolute;
  top: 0;
  left: 0;
  /* Force the element box to the viewport regardless of the WebGL drawing
     buffer size. Without this, on HiDPI screens the canvas takes its 2x
     backing-store pixel size as its CSS size and overflows to the corner. */
  width: 100%;
  height: 100%;
  display: block;
}

.hud {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  font-size: 12px;
  line-height: 1.4;
  /* Keep text legible over the bright 2D map. */
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9), 0 0 2px rgba(0, 0, 0, 0.9);
}
.top-left { top: 22px; left: 24px; }
.top-right { top: 22px; right: 24px; text-align: right; }
.top-center { top: 22px; left: 50%; transform: translateX(-50%); }
.left-mid { top: 130px; left: 24px; }
.bottom-left { bottom: 22px; left: 24px; }
.bottom-right { bottom: 18px; right: 24px; }

.boards { display: flex; flex-direction: column; gap: 16px; width: 230px; }
.board-h {
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--dim);
  margin-bottom: 6px;
}
.board-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 2px 0;
}
.board-n {
  color: #58a6ff;
  font-variant-numeric: tabular-nums;
  min-width: 24px;
  font-weight: 700;
}
.board-name {
  color: var(--fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.board-empty { color: var(--dim); opacity: 0.6; }

.toggle {
  pointer-events: auto;
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(6px);
}
.toggle button {
  pointer-events: auto;
  cursor: pointer;
  border: 0;
  background: transparent;
  color: var(--dim);
  font: inherit;
  font-size: 12px;
  padding: 5px 16px;
  border-radius: 999px;
  transition: color 0.15s, background 0.15s;
}
.toggle button:hover { color: var(--fg); }
.toggle button.on {
  color: #fff;
  background: linear-gradient(90deg, #2f6feb, #6f4bd6);
}

h1 {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.5px;
  background: linear-gradient(90deg, #58a6ff, #a371f7 60%, #39d353);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.sub { color: var(--dim); margin-top: 2px; }

.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--dim);
}
.status .dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #f85149;
  box-shadow: 0 0 8px #f85149;
}
.status.live .dot { background: #39d353; box-shadow: 0 0 8px #39d353; }
.status.live { color: var(--fg); }
.rl { opacity: 0.6; }

.counters .total {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-bottom: 12px;
}
.counters .total .n {
  font-size: 30px;
  font-weight: 700;
  color: var(--fg);
  line-height: 1;
}
.counters .total .k { color: var(--dim); text-transform: uppercase; letter-spacing: 1.5px; font-size: 10px; }

.legend { list-style: none; display: flex; flex-direction: column; gap: 5px; }
.legend li { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
.legend .swatch { width: 9px; height: 9px; border-radius: 2px; box-shadow: 0 0 6px currentColor; }
.legend .lbl { color: var(--dim); min-width: 84px; text-align: right; }
.legend .cnt { color: var(--fg); min-width: 42px; text-align: right; font-variant-numeric: tabular-nums; }

.feed {
  width: min(46vw, 460px);
  max-height: 42vh;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to top, #000 70%, transparent);
  mask-image: linear-gradient(to top, #000 70%, transparent);
}
.feed .row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  color: var(--dim);
  white-space: nowrap;
  overflow: hidden;
}
.feed .txt {
  color: var(--fg);
  overflow: hidden;
  text-overflow: ellipsis;
}
.feed .loc { margin-left: auto; opacity: 0.6; font-size: 11px; }
.feed .pip { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.k-commit { background: #39d353; box-shadow: 0 0 6px #39d353; }
.k-star { background: #e3b341; box-shadow: 0 0 6px #e3b341; }
.k-pr { background: #a371f7; box-shadow: 0 0 6px #a371f7; }
.k-issue { background: #f85149; box-shadow: 0 0 6px #f85149; }
.k-other { background: #58a6ff; box-shadow: 0 0 6px #58a6ff; }

.hint { color: var(--dim); opacity: 0.6; }

.fade-enter-active { transition: all 0.4s ease; }
.fade-enter-from { opacity: 0; transform: translateX(-8px); }
.fade-move { transition: transform 0.4s ease; }
</style>
