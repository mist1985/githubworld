import * as THREE from 'three'

export const KIND_COLORS = {
  commit: 0x39d353,
  star: 0xe3b341,
  pr: 0xa371f7,
  issue: 0xf85149,
  other: 0x58a6ff
}

const GLOBE_RADIUS = 1
// Flat map plane dimensions (equirectangular 2:1).
const MAP_W = 4
const MAP_H = 2

// Convert geographic coordinates to a point on the globe surface.
function latLngToVec3(lat, lng, radius = GLOBE_RADIUS) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  )
}

// Soft round glow sprite used for the city-light dots.
function makeDotTexture() {
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.3, 'rgba(255,255,255,0.85)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.2)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createGlobe(canvas) {
  const scene = new THREE.Scene()
  const fog = new THREE.FogExp2(0x05070d, 0.14)
  scene.fog = fog

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)
  const GLOBE_DIST = 3.6
  const MAP_DIST = 3.0
  camera.position.set(0, 0, GLOBE_DIST)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setClearColor(0x05070d, 1)
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))

  const dotTex = makeDotTexture()

  // Shared Earth texture, applied to both the globe and the flat map.
  const globeMat = new THREE.MeshStandardMaterial({
    color: 0x3a4560,
    emissive: 0xffffff,
    emissiveIntensity: 0.0,
    roughness: 1.0,
    metalness: 0.0
  })
  const mapMat = new THREE.MeshBasicMaterial({ color: 0x8a94aa })

  new THREE.TextureLoader().load('earth.jpg', (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
    globeMat.map = tex
    globeMat.emissiveMap = tex
    globeMat.emissiveIntensity = 1.05
    globeMat.color.setHex(0xffffff)
    globeMat.needsUpdate = true
    mapMat.map = tex
    mapMat.color.setHex(0xffffff)
    mapMat.needsUpdate = true
  })

  // --- Globe container (rotates) ---------------------------------------------
  const world = new THREE.Group()
  scene.add(world)

  const globe = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS, 96, 96), globeMat)
  world.add(globe)

  const graticule = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS * 1.003, 36, 24),
    new THREE.MeshBasicMaterial({ color: 0x4a7fb5, wireframe: true, transparent: true, opacity: 0.05 })
  )
  world.add(graticule)

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS * 1.2, 64, 64),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(0x4d93ff) } },
      vertexShader: `
        varying vec3 vN;
        void main() {
          vN = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vN;
        uniform vec3 uColor;
        void main() {
          float i = pow(0.62 - dot(vN, vec3(0.0, 0.0, 1.0)), 3.0);
          gl_FragColor = vec4(uColor, 1.0) * clamp(i, 0.0, 1.0);
        }`
    })
  )
  scene.add(atmosphere)

  // --- Flat map container (static) -------------------------------------------
  const mapGroup = new THREE.Group()
  mapGroup.visible = false
  scene.add(mapGroup)
  const mapPlane = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W, MAP_H), mapMat)
  mapGroup.add(mapPlane)

  // --- Lighting --------------------------------------------------------------
  scene.add(new THREE.AmbientLight(0xffffff, 1.0))
  const key = new THREE.DirectionalLight(0xffffff, 0.5)
  key.position.set(3, 1.5, 2)
  scene.add(key)

  // Starfield backdrop.
  const starGeo = new THREE.BufferGeometry()
  const starPos = new Float32Array(1200 * 3)
  for (let i = 0; i < 1200; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(20 + Math.random() * 30)
    starPos.set([v.x, v.y, v.z], i * 3)
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  scene.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0x9fb4d8, size: 0.06, transparent: true, opacity: 0.55 })
    )
  )

  // --- City-light dots -------------------------------------------------------
  // Markers live in `markerGroup`, which is parented to the globe (so they spin
  // with it) or to the map, depending on mode.
  const markerGroup = new THREE.Group()
  world.add(markerGroup)

  let mode = 'globe'

  // Project geographic coords into the current view's local space.
  function project(lat, lng, out = new THREE.Vector3()) {
    if (mode === 'globe') return out.copy(latLngToVec3(lat, lng, GLOBE_RADIUS * 1.008))
    // Equirectangular placement on the flat plane, just in front of it.
    return out.set((lng / 180) * (MAP_W / 2), (lat / 90) * (MAP_H / 2), 0.02)
  }

  const POOL = 300
  const lights = []
  for (let i = 0; i < POOL; i++) {
    const dot = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: dotTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true, // opaque globe occludes far-side dots
        blending: THREE.AdditiveBlending
      })
    )
    dot.scale.setScalar(0.03)
    dot.visible = false
    markerGroup.add(dot)
    lights.push({ dot, life: 0, maxLife: 1, lat: 0, lng: 0, size: 0.03 })
  }
  let cursor = 0
  const tmpVec = new THREE.Vector3()

  // Light up one dot for one event, at its city.
  function burst(lat, lng, kind) {
    const color = KIND_COLORS[kind] ?? KIND_COLORS.other
    const light = lights[cursor]
    cursor = (cursor + 1) % POOL
    light.lat = lat
    light.lng = lng
    light.dot.visible = true
    light.dot.position.copy(project(lat, lng, tmpVec))
    light.dot.material.color.setHex(color)
    light.size = 0.03 + Math.random() * 0.016
    // 2-second light-up: pops on, holds, fades over ~2s.
    light.maxLife = 5
    light.life = light.maxLife
  }

  // Pull the camera to a distance that fits the globe (or map) in the current
  // viewport — including narrow portrait phones, where width is the limit.
  function fitCamera() {
    const t = Math.tan((camera.fov * Math.PI) / 360)
    const a = camera.aspect || 1
    if (mode === 'globe') {
      const R = 1.32 // globe + atmosphere + margin
      camera.position.setLength(Math.max(R / t, R / (t * a)))
    } else {
      const hh = (MAP_H / 2) * 1.06
      const hw = (MAP_W / 2) * 1.06
      camera.position.setLength(Math.max(hh / t, hw / (t * a)))
    }
  }

  // Switch between the 3D globe and the flat 2D map.
  function setMode(next) {
    if (next === mode) return
    mode = next
    const isGlobe = next === 'globe'
    globe.visible = isGlobe
    graticule.visible = isGlobe
    atmosphere.visible = isGlobe
    mapGroup.visible = !isGlobe
    scene.fog = isGlobe ? fog : null
    fitCamera()
      // Reparent markers to the moving globe or the static map, and reproject.
      ; (isGlobe ? world : mapGroup).add(markerGroup)
    for (const l of lights) {
      if (l.life > 0) l.dot.position.copy(project(l.lat, l.lng, tmpVec))
    }
  }

  // Advance the city lights by dt seconds.
  const RISE = 0.15 // fixed, fast onset so a dot pops in with its text row
  function step(dt) {
    for (const light of lights) {
      if (light.life <= 0) continue
      light.life -= dt
      if (light.life <= 0) {
        light.dot.visible = false
        light.dot.material.opacity = 0
        continue
      }
      const age = light.maxLife - light.life
      // Fast rise to full brightness, then a gentle fade over the rest of life.
      const a =
        age < RISE
          ? age / RISE
          : Math.pow(Math.max(light.life / (light.maxLife - RISE), 0), 1.4)
      light.dot.material.opacity = Math.max(a, 0)
      light.dot.scale.setScalar(light.size * (0.85 + 0.15 * a))
    }
  }

  return {
    scene,
    camera,
    renderer,
    world,
    atmosphere,
    burst,
    step,
    setMode,
    fitCamera,
    getMode: () => mode,
    dispose() {
      renderer.dispose()
    }
  }
}

export { latLngToVec3 }
