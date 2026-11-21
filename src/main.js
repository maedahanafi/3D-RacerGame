import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'

const BASE = `${import.meta.env.BASE_URL}assets/`
const BEST_KEY = 'redline-run-best'

const SEG = 12
const SEG_COUNT = 18
const LANE = 1.62
const ROAD_Y = 0.16
const GRAVITY = 24
const JUMP_V = 8.6
const STAND_H = 1.02
const DUCK_H = 0.46
const CAR_HALF_W = 0.52
const CAR_HALF_D = 1.05

const GLTF_FILES = {
  palm: 'beach/palm.glb',
  tree: 'beach/tree.glb',
  lamp: 'beach/lamp.glb',
  barrier: 'roads/road_barrier_1.glb',
  cone: 'roads/hazzard_cone_1.glb',
  barrel: 'roads/traffic_barell_1.glb',
  coin: 'world/Coin.gltf',
  gem: 'world/Gem_Blue.gltf',
  star: 'world/Star.gltf',
  crate: 'world/Cube_Crate.gltf',
  spikes: 'world/Spikes.gltf',
  saw: 'world/Hazard_Saw.gltf',
  rock: 'world/Rock_1.gltf',
  rock2: 'world/Rock_2.gltf',
  cloud1: 'world/Cloud_1.gltf',
  cloud2: 'world/Cloud_2.gltf',
  cloud3: 'world/Cloud_3.gltf',
  bee: 'world/Bee.gltf',
  crab: 'world/Crab.gltf',
}

const CLOUDS = ['cloud1', 'cloud2', 'cloud3']

const LESSONS = [
  { kind: 'coins', lane: 0, hint: 'Left and Right to switch lanes' },
  { kind: 'coins', lane: -1, hint: 'Coins on the left — move over' },
  { kind: 'coins', lane: 1, hint: 'Now take the right lane' },
  { kind: 'jump', lane: 0, hint: 'Jump with Up, W, or Space' },
  { kind: 'block', lane: -1, hint: 'Too tall to jump — change lanes' },
  { kind: 'overhead', lane: 0, hint: 'Duck with Down or S' },
]

const $ = (id) => document.getElementById(id)
const ui = {
  loading: $('loading'),
  loadText: $('load-text'),
  loadBar: $('load-bar'),
  menu: $('menu'),
  hud: $('hud'),
  hint: $('hint'),
  gameover: $('gameover'),
  pad: $('pad'),
  flash: $('flash'),
  score: $('score'),
  coins: $('coins'),
  best: $('best'),
  menuBest: $('menu-best'),
  finalScore: $('final-score'),
  finalDistance: $('final-distance'),
  finalCoins: $('final-coins'),
  newBest: $('new-best'),
  mute: $('mute'),
}

const rand = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[(Math.random() * arr.length) | 0]

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.08
renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.prepend(renderer.domElement)

const scene = new THREE.Scene()
scene.background = makeSky()
scene.fog = new THREE.Fog(0xc7e8fb, 42, 140)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.15, 260)
scene.add(new THREE.AmbientLight(0xfff6e8, 0.46))
scene.add(new THREE.HemisphereLight(0xcfe9ff, 0xe7c98a, 1.05))
const sun = new THREE.DirectionalLight(0xfff3cf, 1.85)
sun.position.set(-16, 28, 12)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.near = 1
sun.shadow.camera.far = 70
sun.shadow.camera.left = -22
sun.shadow.camera.right = 22
sun.shadow.camera.top = 22
sun.shadow.camera.bottom = -22
sun.shadow.bias = -0.0006
sun.shadow.normalBias = 0.04
scene.add(sun)
sun.target.position.set(0, 0.5, -8)
scene.add(sun.target)

const sunBall = new THREE.Mesh(
  new THREE.SphereGeometry(6, 14, 10),
  new THREE.MeshBasicMaterial({ color: 0xffe39a }),
)
sunBall.position.set(-58, 42, -110)
scene.add(sunBall)

const farGround = new THREE.Mesh(
  new THREE.PlaneGeometry(520, 520),
  new THREE.MeshLambertMaterial({ color: 0x1a93d6 }),
)
farGround.rotation.x = -Math.PI / 2
farGround.position.y = -0.55
farGround.receiveShadow = true
scene.add(farGround)

const world = new THREE.Group()
scene.add(world)

const models = {}
const hazards = []
const pickups = []
const bits = []
const segments = []
const pendingHints = []
const wheels = []
const laneQueue = []

const tmp = new THREE.Vector3()
const clock = new THREE.Clock()

const sandGeo = new THREE.PlaneGeometry(30, SEG + 0.3)
sandGeo.rotateX(-Math.PI / 2)
const sandMat = new THREE.MeshLambertMaterial({ color: 0xe6c57a })
const asphaltGeo = new THREE.BoxGeometry(7.2, ROAD_Y, SEG)
const asphaltMat = new THREE.MeshLambertMaterial({ color: 0x1c6ed8 })
const curbGeo = new THREE.BoxGeometry(0.2, 0.24, SEG)
const curbMat = new THREE.MeshLambertMaterial({ color: 0xf6f3ec })
const edgeGeo = new THREE.BoxGeometry(0.09, 0.02, SEG)
const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
const dashGeo = new THREE.BoxGeometry(0.12, 0.02, 1.7)
const duneGeo = new THREE.SphereGeometry(1, 7, 5)
const duneMat = new THREE.MeshLambertMaterial({ color: 0xd4ae62 })
const bitGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14)
const coinBit = new THREE.MeshBasicMaterial({ color: 0xffd15c })
const gemBit = new THREE.MeshBasicMaterial({ color: 0x49b6ff })

const bodyMat = new THREE.MeshStandardMaterial({
  color: 0xde1c16,
  roughness: 0.55,
  metalness: 0.05,
  flatShading: true,
  emissive: 0x4a0c0c,
  emissiveIntensity: 0.45,
})
const glassMat = new THREE.MeshStandardMaterial({
  color: 0x1a2633,
  roughness: 0.12,
  metalness: 0.05,
  transparent: true,
  opacity: 0.62,
  flatShading: true,
})
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2c2c })
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4 })

let palette = null
let state = 'menu'
let speed = 0
let distance = 0
let coins = 0
let score = 0
let carX = 0
let laneTarget = 0
let y = 0
let vy = 0
let duckBlend = 0
let duckKey = false
let duckButton = false
let duckTimer = 0
let nextRowZ = -40
let lesson = 0
let deadT = 0
let shake = 0
let crashSide = 1
let camX = 0
let hintUntil = 0
let wheelSign = -1
let muted = localStorage.getItem('redline-run-mute') === '1'

const carRoot = new THREE.Group()
const carVisual = new THREE.Group()
const carPivot = new THREE.Group()
carRoot.add(carVisual)
carVisual.add(carPivot)
scene.add(carRoot)

const blobTex = makeBlob()
const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(1.7, 2.5),
  new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: 0x000000 }),
)
blob.rotation.x = -Math.PI / 2
blob.renderOrder = 2
scene.add(blob)

const sfx = makeAudio()
bindInput()
boot()

async function boot() {
  try {
    const loader = new GLTFLoader()
    const names = Object.keys(GLTF_FILES)
    let finished = 0
    const total = names.length + 2
    const mark = () => {
      finished += 1
      const pct = Math.round((finished / total) * 100)
      ui.loadBar.style.width = `${pct}%`
      ui.loadText.textContent = `Loading the garage… ${pct}%`
    }

    await Promise.all(names.map(async (name) => {
      const gltf = await loader.loadAsync(BASE + GLTF_FILES[name])
      flatten(gltf.scene)
      if (name === 'lamp') glowLamp(gltf.scene)
      models[name] = gltf
      mark()
    }))

    palette = await new THREE.TextureLoader().loadAsync(`${BASE}cars/palette.png`)
    palette.colorSpace = THREE.SRGBColorSpace
    palette.flipY = true
    mark()

    const fbx = await new FBXLoader().loadAsync(`${BASE}cars/tristar.fbx`)
    mark()
    buildCar(fbx)
    buildRoad()
    refreshBest()
    ui.loading.hidden = true
    ui.menu.hidden = false
    clock.start()
    renderer.setAnimationLoop(tick)
  } catch (err) {
    console.error(err)
    ui.loadText.textContent = 'Could not load the models. Check the console for the missing file.'
  }
}

function tick() {
  const dt = Math.min(0.033, clock.getDelta())
  const time = clock.elapsedTime
  const playing = state === 'play'
  const targetSpeed = playing ? Math.min(38, 16 + distance * 0.014) : state === 'menu' ? 8 : 0
  speed += (targetSpeed - speed) * Math.min(1, dt * (state === 'dead' ? 2.2 : 1.4))

  world.position.z += speed * dt
  if (playing) distance += speed * dt

  recycleSegments()
  if (playing) fillRows()

  const onGround = y <= 0.02 && vy <= 0
  const wantDuck = playing && onGround && (duckKey || duckButton || duckTimer > 0)
  if (duckTimer > 0) duckTimer = Math.max(0, duckTimer - dt)
  duckBlend += ((wantDuck ? 1 : 0) - duckBlend) * Math.min(1, dt * 14)

  if (playing) {
    vy -= GRAVITY * dt
    y += vy * dt
    if (y <= 0) {
      y = 0
      vy = 0
    }
    const desired = laneTarget * LANE
    carX += (desired - carX) * Math.min(1, dt * 12)
    if (Math.abs(carX - desired) < 0.05 && laneQueue.length) laneTarget = laneQueue.shift()
  }

  const carH = STAND_H + (DUCK_H - STAND_H) * duckBlend
  if (state === 'dead') {
    deadT += dt
    carRoot.rotation.z = crashSide * Math.min(1.05, deadT * 2.5)
    carRoot.rotation.y = crashSide * deadT * 0.8
    carVisual.rotation.set(0.35, 0, 0)
    carVisual.scale.y = 1
    carRoot.position.set(carX + crashSide * Math.min(deadT, 0.6) * 1.4, ROAD_Y + Math.max(0, 0.28 - deadT * 0.4), 0)
  } else {
    carRoot.rotation.set(0, 0, 0)
    carRoot.position.set(carX, ROAD_Y + y, 0)
    carVisual.scale.y = 1 - duckBlend * 0.55
    carVisual.rotation.x = vy * 0.016 - duckBlend * 0.14
    carVisual.rotation.z = (laneTarget * LANE - carX) * -0.18
    carVisual.rotation.y = 0
  }

  const spin = speed * dt * 0.85 * wheelSign
  for (const wheel of wheels) wheel.mesh.rotateOnAxis(wheel.axis, spin)

  const lift = Math.min(1, y / 1.35)
  blob.position.set(carX, ROAD_Y + 0.03, 0.15)
  blob.scale.setScalar(1 + lift * 0.45)
  blob.material.opacity = 0.5 * (1 - lift * 0.7)

  updateActors(dt, time, carH)
  updateBits(dt)
  updateHints()
  updateCamera(dt)
  if (playing) {
    score = Math.floor(distance) + coins * 10
    ui.score.textContent = String(score)
    ui.coins.textContent = String(coins)
  }
  sfx.setSpeed(speed, state !== 'dead')
  renderer.render(scene, camera)
}

function updateActors(dt, time, carH) {
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i]
    h.obj.getWorldPosition(tmp)
    if (tmp.z > 10) {
      world.remove(h.root)
      hazards.splice(i, 1)
      continue
    }
    if (h.mixer) h.mixer.update(dt)
    if (h.tick) h.tick(time)
    if (state === 'play' && tmp.z > -16 && tmp.z < 3 && overlapsCar(h, carH)) crash()
  }

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]
    p.obj.rotation.y += dt * 2.6
    p.obj.position.y = p.baseY + Math.sin(time * 3.2 + p.phase) * 0.07
    p.obj.getWorldPosition(tmp)
    if (tmp.z > 6) {
      world.remove(p.obj)
      pickups.splice(i, 1)
      continue
    }
    if (state !== 'play') continue
    const dx = tmp.x - carX
    const dz = tmp.z
    const mid = ROAD_Y + y + (STAND_H + (DUCK_H - STAND_H) * duckBlend) * 0.45
    const dy = tmp.y - mid
    if (dx * dx + dz * dz < 0.95 && dy * dy < 1.6) {
      coins += p.value
      sfx.coin(p.value > 1)
      burst(tmp, p.value > 1 ? 'gem' : 'coin')
      world.remove(p.obj)
      pickups.splice(i, 1)
    }
  }
}

function overlapsCar(h, carH) {
  h.obj.getWorldPosition(tmp)
  const minX = tmp.x + h.min.x
  const maxX = tmp.x + h.max.x
  const minY = tmp.y + h.min.y
  const maxY = tmp.y + h.max.y
  const minZ = tmp.z + h.min.z
  const maxZ = tmp.z + h.max.z
  const bottom = ROAD_Y + y
  const top = bottom + carH
  return maxX > carX - CAR_HALF_W && minX < carX + CAR_HALF_W
    && maxZ > -CAR_HALF_D && minZ < CAR_HALF_D
    && maxY > bottom + 0.04 && minY < top - 0.02
}

function updateBits(dt) {
  for (let i = bits.length - 1; i >= 0; i--) {
    const m = bits[i]
    m.userData.life -= dt
    m.userData.v.y -= 12 * dt
    m.position.addScaledVector(m.userData.v, dt)
    m.scale.setScalar(Math.max(0.2, m.userData.life * 3))
    if (m.userData.life <= 0) {
      scene.remove(m)
      bits.splice(i, 1)
    }
  }
}

function updateHints() {
  while (pendingHints.length) {
    const ahead = pendingHints[0].z + world.position.z
    if (ahead > -20) {
      setHint(pendingHints.shift().text)
    } else break
  }
  if (hintUntil && performance.now() > hintUntil) {
    ui.hint.classList.remove('show')
    hintUntil = 0
  }
}

function updateCamera(dt) {
  const aspect = camera.aspect
  const back = aspect < 0.9 ? 10.6 : 8.9
  const height = aspect < 0.9 ? 5.3 : 4.15
  camX += (carX * 0.78 - camX) * Math.min(1, dt * 4)
  const bob = Math.sin(clock.elapsedTime * (speed * 0.45 + 2)) * 0.035
  const sx = (Math.random() - 0.5) * shake
  const sy = (Math.random() - 0.5) * shake
  camera.position.set(camX + sx, height + bob + sy, back)
  camera.lookAt(carX * 0.25, 0.9, -10)
  camera.rotateZ((laneTarget * LANE - carX) * 0.035)
  shake = Math.max(0, shake - dt * 1.1)
  camera.fov = aspect < 0.85 ? 74 : 60
  camera.updateProjectionMatrix()
}

function buildRoad() {
  for (let i = 0; i < SEG_COUNT; i++) {
    const seg = new THREE.Group()
    seg.position.z = 24 - i * SEG
    world.add(seg)
    segments.push(seg)
    dressSegment(seg)
  }
}

function recycleSegments() {
  for (let n = 0; n < 4; n++) {
    let front = segments[0]
    let back = null
    for (const seg of segments) {
      if (seg.position.z < front.position.z) front = seg
      const wz = seg.position.z + world.position.z
      if (wz > SEG * 1.3 && (!back || seg.position.z > back.position.z)) back = seg
    }
    if (!back) break
    back.position.z = front.position.z - SEG
    dressSegment(back)
  }
}

function dressSegment(seg) {
  for (let i = seg.children.length - 1; i >= 0; i--) seg.remove(seg.children[i])

  const sand = new THREE.Mesh(sandGeo, sandMat)
  sand.position.y = -0.02
  sand.receiveShadow = true
  seg.add(sand)

  const road = new THREE.Mesh(asphaltGeo, asphaltMat)
  road.position.y = ROAD_Y / 2
  road.receiveShadow = true
  seg.add(road)

  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(curbGeo, curbMat)
    curb.position.set(side * 3.7, 0.12, 0)
    curb.castShadow = true
    curb.receiveShadow = true
    seg.add(curb)

    const edge = new THREE.Mesh(edgeGeo, lineMat)
    edge.position.set(side * 3.38, ROAD_Y + 0.012, 0)
    seg.add(edge)

    const lamp = prop('lamp', { height: rand(3.3, 4.1), yaw: -side * Math.PI / 2 })
    lamp.position.set(side * 4.5, 0, rand(-3.2, 3.2))
    lamp.traverse((o) => { if (o.isMesh) o.castShadow = true })
    seg.add(lamp)

    for (let n = 0; n < 2; n++) {
      const palm = prop('palm', { height: rand(4.8, 6.6), yaw: rand(0, Math.PI * 2) })
      palm.position.set(side * rand(6.4, 8.6), 0, rand(-SEG / 2 + 0.5, SEG / 2 - 0.5))
      palm.traverse((o) => { if (o.isMesh) o.castShadow = true })
      seg.add(palm)
    }

    const tree = prop('tree', { height: rand(3.5, 5.2), yaw: rand(0, Math.PI * 2) })
    tree.position.set(side * rand(9.4, 12.4), 0, rand(-SEG / 2, SEG / 2))
    tree.traverse((o) => { if (o.isMesh) o.castShadow = true })
    seg.add(tree)

    if (Math.random() < 0.75) {
      const dune = new THREE.Mesh(duneGeo, duneMat)
      dune.scale.set(rand(2.4, 4.2), rand(0.35, 0.75), rand(1.6, 2.8))
      dune.position.set(side * rand(13.4, 14.8), -0.08, rand(-4, 4))
      dune.castShadow = true
      dune.receiveShadow = true
      seg.add(dune)
    }
  }

  if (Math.random() < 0.7) {
    const cloud = prop(pick(CLOUDS), { height: rand(2.4, 4) })
    cloud.position.set(rand(-22, 22), rand(14, 22), rand(-SEG / 2, SEG / 2))
    seg.add(cloud)
  }

  for (const x of [-LANE / 2, LANE / 2]) {
    for (let i = 0; i < 3; i++) {
      const dash = new THREE.Mesh(dashGeo, lineMat)
      dash.position.set(x, ROAD_Y + 0.014, -4.2 + i * 4.2)
      seg.add(dash)
    }
  }
}

function fillRows() {
  const horizon = -world.position.z - 125
  let guard = 0
  while (nextRowZ > horizon && guard++ < 10) {
    const extra = spawnRow(nextRowZ)
    nextRowZ -= rowGap() + extra
  }
}

function rowGap() {
  return 15 + Math.min(8, distance / 220)
}

function spawnRow(z) {
  if (lesson < LESSONS.length) {
    const step = LESSONS[lesson++]
    pendingHints.push({ z, text: step.hint })
    if (step.kind === 'coins') return spawnCoinLine(step.lane, z, 6, false)
    if (step.kind === 'jump') {
      spawnJump(step.lane, z, 'cones')
      return 0
    }
    if (step.kind === 'block') {
      spawnBlock(step.lane, z, 'crate')
      return 0
    }
    spawnOverhead(step.lane, z, 'gate')
    return 0
  }

  const d = distance
  const roll = Math.random()
  if (roll < 0.2) {
    const lane = pick([-1, 0, 1])
    return spawnCoinLine(lane, z, 5, Math.random() < 0.35)
  }
  if (roll < 0.46) {
    const lanes = sampleLanes(d > 260 && Math.random() < 0.45 ? 2 : 1)
    lanes.forEach((lane) => spawnJump(lane, z))
    if (Math.random() < 0.55) return spawnCoinLine(lanes[0], z - 1.2, 4, true) + 1.2
    return 0
  }
  if (roll < 0.72) {
    const count = d > 140 && Math.random() < 0.55 ? 2 : 1
    const lanes = sampleLanes(count)
    const open = [-1, 0, 1].find((lane) => !lanes.includes(lane))
    lanes.forEach((lane) => spawnBlock(lane, z))
    if (open !== undefined && Math.random() < 0.65) return spawnCoinLine(open, z, 3, false)
    return 0
  }
  if (roll < 0.9) {
    const count = d > 320 && Math.random() < 0.28 ? 3 : (Math.random() < 0.5 ? 2 : 1)
    sampleLanes(count).forEach((lane) => spawnOverhead(lane, z))
    return 0
  }
  sampleLanes(3).forEach((lane) => spawnJump(lane, z))
  return 0
}

function sampleLanes(count) {
  const lanes = [-1, 0, 1]
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[lanes[i], lanes[j]] = [lanes[j], lanes[i]]
  }
  return lanes.slice(0, count)
}

function spawnCoinLine(lane, z, count, arched) {
  const spacing = 2.15
  for (let i = 0; i < count; i++) {
    const arc = arched ? Math.sin((i / Math.max(1, count - 1)) * Math.PI) : 0
    const bonus = !arched && Math.random() < 0.08
    const kind = bonus ? (Math.random() < 0.5 ? 'gem' : 'star') : 'coin'
    const height = arched ? 0.85 + arc * 1.25 : 0.9
    spawnPickup(lane, z - i * spacing, height, kind)
  }
  return Math.max(0, count - 1) * spacing
}

function spawnPickup(lane, z, height, kind) {
  const obj = prop(kind, { height: kind === 'coin' ? 0.62 : 0.78, anchor: 'center' })
  obj.position.set(lane * LANE, ROAD_Y + height, z)
  world.add(obj)
  pickups.push({
    obj,
    baseY: obj.position.y,
    phase: rand(0, 6),
    value: kind === 'coin' ? 1 : 5,
  })
}

function spawnJump(lane, z, force) {
  const kind = force || pick(['cones', 'rock', 'spikes', 'barrier'])
  const g = new THREE.Group()
  if (kind === 'cones') {
    ;[[-0.32, 0.12], [0.32, 0.12], [0, -0.22]].forEach(([x, dz]) => {
      const cone = prop('cone', { height: 0.72, yaw: rand(0, 3) })
      cone.position.set(x, 0, dz)
      g.add(cone)
    })
  } else if (kind === 'rock') {
    g.add(prop(Math.random() < 0.5 ? 'rock' : 'rock2', { height: 0.78, width: 1.05, depth: 0.95, yaw: rand(0, 6) }))
  } else if (kind === 'spikes') {
    ;[-0.28, 0, 0.28].forEach((x) => {
      const spike = prop('spikes', { height: 0.7, width: 0.42, depth: 0.42 })
      spike.position.set(x, 0, 0)
      g.add(spike)
    })
  } else {
    g.add(prop('barrier', { height: 0.68, width: 1.15, depth: 0.5 }))
  }
  placeHazard(g, lane * LANE, ROAD_Y, z)
}

function spawnBlock(lane, z, force) {
  const kind = force || pick(['crate', 'barrel', 'crab'])
  let obj
  let mixer = null
  if (kind === 'crate') obj = prop('crate', { height: 1.58, width: 1.12, depth: 1.12 })
  else if (kind === 'barrel') obj = prop('barrel', { height: 1.62, width: 1.05, depth: 1.05 })
  else {
    const critter = spawnCritter('crab', 'Idle', { height: 1.55, width: 1.12, depth: 1.0 })
    obj = critter.outer
    mixer = critter.mixer
  }
  placeHazard(obj, lane * LANE, ROAD_Y, z, mixer)
}

function spawnOverhead(lane, z, force) {
  const kind = force || pick(['gate', 'saw', 'bee'])
  const g = new THREE.Group()
  let solid
  let mixer = null
  if (kind === 'gate') {
    solid = prop('crate', { width: 1.35, height: 1.6, depth: 0.42, anchor: 'center' })
    solid.position.y = 0.84 + 0.8
    g.add(solid)
    for (const side of [-1, 1]) {
      const post = prop('barrier', { width: 0.18, height: 0.88, depth: 0.18 })
      post.position.set(side * 0.78, 0, 0)
      g.add(post)
    }
  } else if (kind === 'saw') {
    solid = prop('saw', { height: 1.55, width: 1.25, anchor: 'center' })
    solid.position.y = 0.82 + 0.775
    g.add(solid)
    const spin = solid
    g.userData.tick = (t) => { spin.rotation.z = t * 6.5 }
  } else {
    const critter = spawnCritter('bee', 'Flying', { height: 0.85, width: 1.15, depth: 0.7, anchor: 'ground' })
    solid = critter.outer
    solid.position.y = 0.8
    mixer = critter.mixer
    g.add(solid)
    const phase = rand(0, 5)
    g.userData.tick = (t) => { solid.position.y = 0.8 + Math.sin(t * 4 + phase) * 0.06 }
  }
  placeHazard(g, lane * LANE, ROAD_Y, z, mixer, solid)
}

function placeHazard(root, x, y, z, mixer = null, colliderObj = null) {
  root.position.set(x, y, z)
  root.traverse((o) => { if (o.isMesh) o.castShadow = true })
  world.add(root)
  world.updateMatrixWorld(true)
  const target = colliderObj || root
  const box = captureCollider(target)
  hazards.push({
    root,
    obj: target,
    mixer,
    tick: root.userData.tick || null,
    min: box.min,
    max: box.max,
  })
}

function spawnCritter(name, clipName, opts) {
  const src = models[name]
  const model = SkeletonUtils.clone(src.scene)
  const outer = frameModel(model, opts)
  const mixer = new THREE.AnimationMixer(model)
  const clip = THREE.AnimationClip.findByName(src.animations, clipName)
  if (clip) mixer.clipAction(clip).play()
  return { outer, mixer }
}

function prop(name, opts) {
  return frameModel(models[name].scene.clone(true), opts)
}

function frameModel(model, { height = 1, width = 0, depth = 0, anchor = 'ground', yaw = 0 } = {}) {
  const outer = new THREE.Group()
  const inner = new THREE.Group()
  outer.add(inner)
  inner.add(model)
  outer.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const sy = height / Math.max(0.0001, size.y)
  const sx = width ? width / Math.max(0.0001, size.x) : sy
  const sz = depth ? depth / Math.max(0.0001, size.z) : sy
  inner.scale.set(sx, sy, sz)
  inner.position.set(-center.x * sx, anchor === 'center' ? -center.y * sy : -box.min.y * sy, -center.z * sz)
  outer.rotation.y = yaw
  return outer
}

function captureCollider(obj) {
  obj.updateWorldMatrix(true, true)
  const box = new THREE.Box3().setFromObject(obj)
  const wp = obj.getWorldPosition(new THREE.Vector3())
  const cx = (box.min.x + box.max.x) / 2
  const cy = (box.min.y + box.max.y) / 2
  const cz = (box.min.z + box.max.z) / 2
  const hx = ((box.max.x - box.min.x) / 2) * 0.82
  const hy = ((box.max.y - box.min.y) / 2) * 0.94
  const hz = ((box.max.z - box.min.z) / 2) * 0.82
  return {
    min: new THREE.Vector3(cx - hx - wp.x, cy - hy - wp.y, cz - hz - wp.z),
    max: new THREE.Vector3(cx + hx - wp.x, cy + hy - wp.y, cz + hz - wp.z),
  }
}

function buildCar(fbx) {
  fbx.traverse((o) => {
    if (!o.isMesh) return
    o.castShadow = true
    o.receiveShadow = true
    const n = o.name.toLowerCase()
    if (n.includes('glass')) {
      o.material = glassMat
    } else if (n.includes('wheel')) {
      const mat = new THREE.MeshStandardMaterial({
        map: palette,
        color: 0xffffff,
        roughness: 0.72,
        metalness: 0.04,
        flatShading: true,
      })
      o.material = mat
      const axis = wheelAxis(o)
      wheels.push({ mesh: o, axis })
    } else {
      o.material = bodyMat
    }
  })

  fbx.rotation.set(0, 0, 0)
  fbx.updateMatrixWorld(true)
  const size = new THREE.Box3().setFromObject(fbx).getSize(new THREE.Vector3())
  if (size.x > size.z * 1.05) fbx.rotation.y = Math.PI / 2
  fbx.updateMatrixWorld(true)
  const front = meanZ(fbx, /lfwheel|rfwheel/i)
  const rear = meanZ(fbx, /lrwheel|rrwheel/i)
  if (front !== null && rear !== null && front > rear) fbx.rotation.y += Math.PI

  const fitted = frameModel(fbx, { height: 1.05 })
  carPivot.add(fitted)

  carPivot.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(carPivot)
  const carSize = box.getSize(new THREE.Vector3())
  const rearZ = box.max.z
  const noseZ = box.min.z
  const lightY = box.min.y + carSize.y * 0.42
  const lightX = carSize.x * 0.33
  for (const side of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.05), tailMat)
    tail.position.set(side * lightX, lightY, rearZ + 0.02)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.05), headMat)
    head.position.set(side * lightX, lightY, noseZ - 0.02)
    carPivot.add(tail, head)
  }
}

function wheelAxis(mesh) {
  const geo = mesh.geometry
  if (!geo.boundingBox) geo.computeBoundingBox()
  const size = geo.boundingBox.getSize(new THREE.Vector3())
  if (size.x <= size.y && size.x <= size.z) return new THREE.Vector3(1, 0, 0)
  if (size.y <= size.x && size.y <= size.z) return new THREE.Vector3(0, 1, 0)
  return new THREE.Vector3(0, 0, 1)
}

function meanZ(root, re) {
  root.updateMatrixWorld(true)
  const v = new THREE.Vector3()
  let n = 0
  let z = 0
  root.traverse((o) => {
    if (o.isMesh && re.test(o.name)) {
      o.getWorldPosition(v)
      z += v.z
      n += 1
    }
  })
  return n ? z / n : null
}

function clearActors() {
  for (const h of hazards) world.remove(h.root)
  for (const p of pickups) world.remove(p.obj)
  for (const b of bits) scene.remove(b)
  hazards.length = 0
  pickups.length = 0
  bits.length = 0
  pendingHints.length = 0
}

function startRun() {
  sfx.unlock()
  clearActors()
  state = 'play'
  distance = 0
  coins = 0
  score = 0
  y = 0
  vy = 0
  carX = 0
  laneTarget = 0
  laneQueue.length = 0
  duckBlend = 0
  duckKey = false
  duckButton = false
  duckTimer = 0
  deadT = 0
  lesson = 0
  nextRowZ = -world.position.z - 24
  ui.menu.hidden = true
  ui.gameover.hidden = true
  ui.hud.hidden = false
  ui.pad.hidden = false
  ui.score.textContent = '0'
  ui.coins.textContent = '0'
  setHint('Left and Right to switch lanes')
}

function crash() {
  if (state !== 'play') return
  state = 'dead'
  deadT = 0
  shake = 0.55
  crashSide = Math.random() < 0.5 ? -1 : 1
  ui.flash.classList.add('on')
  setTimeout(() => ui.flash.classList.remove('on'), 220)
  sfx.crash()
  setTimeout(showGameOver, 700)
}

function showGameOver() {
  if (state !== 'dead') return
  score = Math.floor(distance) + coins * 10
  const best = Number(localStorage.getItem(BEST_KEY) || 0)
  const isNew = score > best && score > 0
  if (isNew) localStorage.setItem(BEST_KEY, String(score))
  ui.finalScore.textContent = String(score)
  ui.finalDistance.textContent = `${Math.floor(distance)} m`
  ui.finalCoins.textContent = String(coins)
  ui.newBest.hidden = !isNew
  ui.gameover.hidden = false
  refreshBest()
}

function refreshBest() {
  const best = localStorage.getItem(BEST_KEY) || '0'
  ui.best.textContent = best
  ui.menuBest.textContent = best
}

function setHint(text) {
  ui.hint.textContent = text
  ui.hint.classList.add('show')
  hintUntil = performance.now() + 3400
}

function queueLane(dir) {
  if (state !== 'play') return
  const current = laneQueue.length ? laneQueue[laneQueue.length - 1] : laneTarget
  const next = Math.max(-1, Math.min(1, current + dir))
  if (next !== current) laneQueue.push(next)
}

function tryJump() {
  if (state !== 'play') return
  if (y <= 0.06) {
    y = 0.06
    vy = JUMP_V
    sfx.jump()
  }
}

function burst(pos, kind) {
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(bitGeo, kind === 'gem' ? gemBit : coinBit)
    m.position.copy(pos)
    m.userData.v = new THREE.Vector3(rand(-2.2, 2.2), rand(2.2, 4.6), rand(-0.6, 0.6))
    m.userData.life = rand(0.28, 0.48)
    scene.add(m)
    bits.push(m)
  }
}

function glowLamp(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    mats.forEach((m) => {
      if (m.name !== 'Bulb' || !m.emissive) return
      m.emissive.set(0xffd36a)
      m.emissiveIntensity = 1.6
      if (m.color) m.color.set(0xffe7a8)
    })
  })
}

function flatten(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    mats.forEach((m) => {
      m.flatShading = true
      m.needsUpdate = true
    })
    o.castShadow = false
    o.receiveShadow = true
  })
}

function bindInput() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    const k = e.key.toLowerCase()
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
    sfx.unlock()
    if (state === 'menu' && (k === 'enter' || k === ' ')) { startRun(); return }
    if (state === 'dead' && (k === 'enter' || k === 'r' || k === ' ')) { startRun(); return }
    if (state !== 'play') return
    if (k === 'arrowleft' || k === 'a') queueLane(-1)
    else if (k === 'arrowright' || k === 'd') queueLane(1)
    else if (k === 'arrowup' || k === 'w' || k === ' ') tryJump()
    else if (k === 'arrowdown' || k === 's') {
      duckKey = true
      duckTimer = Math.max(duckTimer, 0.42)
    }
  })
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase()
    if (k === 'arrowdown' || k === 's') duckKey = false
  })

  $('start').addEventListener('click', startRun)
  $('restart').addEventListener('click', startRun)
  $('btn-left').addEventListener('pointerdown', (e) => { e.preventDefault(); queueLane(-1) })
  $('btn-right').addEventListener('pointerdown', (e) => { e.preventDefault(); queueLane(1) })
  $('btn-jump').addEventListener('pointerdown', (e) => { e.preventDefault(); tryJump() })
  const duckBtn = $('btn-duck')
  duckBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    duckButton = true
    duckTimer = Math.max(duckTimer, 0.42)
  })
  duckBtn.addEventListener('pointerup', () => { duckButton = false })
  duckBtn.addEventListener('pointerleave', () => { duckButton = false })
  duckBtn.addEventListener('pointercancel', () => { duckButton = false })

  let swipe = null
  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return
    swipe = { x: e.clientX, y: e.clientY, t: performance.now() }
  })
  window.addEventListener('pointerup', (e) => {
    if (!swipe) return
    const dx = e.clientX - swipe.x
    const dy = e.clientY - swipe.y
    swipe = null
    if (Math.hypot(dx, dy) < 36) return
    sfx.unlock()
    if (state === 'menu') { startRun(); return }
    if (state !== 'play') return
    if (Math.abs(dx) > Math.abs(dy)) queueLane(dx > 0 ? 1 : -1)
    else if (dy < 0) tryJump()
    else {
      duckTimer = Math.max(duckTimer, 0.55)
    }
  })

  ui.mute.addEventListener('click', () => {
    muted = !muted
    localStorage.setItem('redline-run-mute', muted ? '1' : '0')
    ui.mute.textContent = muted ? 'Sound off' : 'Sound on'
    sfx.unlock()
    sfx.setSpeed(speed, state !== 'dead')
  })
  ui.mute.textContent = muted ? 'Sound off' : 'Sound on'

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })
}

function makeSky() {
  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 256
  const g = canvas.getContext('2d')
  const grd = g.createLinearGradient(0, 0, 0, 256)
  grd.addColorStop(0, '#3d9aee')
  grd.addColorStop(0.38, '#8fd4ff')
  grd.addColorStop(0.68, '#fff3d2')
  grd.addColorStop(1, '#ffe7b0')
  g.fillStyle = grd
  g.fillRect(0, 0, 16, 256)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeBlob() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const g = canvas.getContext('2d')
  const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64)
  grd.addColorStop(0, 'rgba(0,0,0,0.55)')
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeAudio() {
  let ctx = null
  let engine = null
  const unlock = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      ctx = new AC()
      const osc = ctx.createOscillator()
      const filter = ctx.createBiquadFilter()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.value = 52
      filter.type = 'lowpass'
      filter.frequency.value = 220
      gain.gain.value = 0
      osc.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      engine = { osc, filter, gain }
    }
    if (ctx.state === 'suspended') ctx.resume()
  }
  const tone = (freq, dur, type, gainValue, slide = 0) => {
    if (!ctx || muted) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    osc.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), ctx.currentTime + dur)
    gain.gain.value = gainValue
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + dur + 0.02)
  }
  return {
    unlock,
    setSpeed(v, running) {
      if (!engine) return
      const t = ctx.currentTime
      engine.osc.frequency.setTargetAtTime(46 + v * 1.35, t, 0.08)
      engine.filter.frequency.setTargetAtTime(180 + v * 8, t, 0.08)
      const vol = muted || !running ? 0 : 0.018 + Math.min(0.02, v * 0.0006)
      engine.gain.gain.setTargetAtTime(vol, t, 0.1)
    },
    jump() { tone(220, 0.16, 'square', 0.05, 180) },
    coin(big) { tone(big ? 660 : 520, 0.09, 'sine', 0.06, big ? 220 : 140) },
    crash() {
      if (!ctx || muted) return
      const frames = Math.floor(ctx.sampleRate * 0.35)
      const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
      const src = ctx.createBufferSource()
      const gain = ctx.createGain()
      const filter = ctx.createBiquadFilter()
      src.buffer = buffer
      filter.type = 'lowpass'
      filter.frequency.value = 700
      gain.gain.value = 0.22
      src.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      src.start()
    },
  }
}
