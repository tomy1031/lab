// 出典：tomy1031/nexmax_chronicle（web/src/world/nexmax/materials.ts）から流用。ネクマックスの 3D モデル（コードで組んだ部品＋手続きアニメーション）。
// ネクマックスのマテリアル。やわらかいマットなソフビ（光沢は控えめ）。
// 本体の青は 1 つのシェーダを共有し、反転ハル輪郭線（aOutline=1 の頂点）を同じドローコールで描く。
import * as THREE from 'three'

/** 見本（nexmax_game_turnaround.png）から取った色 */
export const NX_COLORS = {
  body: '#66b2f0',
  plate: '#f6f6f4',
  eye: '#141416',
  brow: '#202228',
  mouth: '#fb7a52',
  mouthDark: '#c2412b',
  mouthLine: '#3a1c16',
  plateLine: '#4f6f98',
  logoDark: '#045ea1',
  logoLight: '#1496d6',
  logoRight: '#0361a4',
  outline: '#16223a',
  claw: '#dfeaf2',
}

/**
 * 輪郭線の太さと色。全マテリアルで共有。
 * width: 画面の高さに対する割合（解像度・画角によらず同じ見た目）。minWorld: 近寄ったときの最小の太さ（m）
 * minPx: 描画の画素での最小の太さ。スマホで描画解像度が下がると width だけでは 1 画素を切り、
 *   輪郭が点線のように途切れて「ギザギザ」に見えるため、どの解像度でも途切れない太さを保つ。
 * viewportH: 描画の高さ（画素）。シェル（game.ts）が resize のたびに入れる
 */
export const OUTLINE = {
  width: { value: 0.0021 },
  minWorld: { value: 0.0026 },
  minPx: { value: 1.6 },
  viewportH: { value: 720 },
  color: { value: new THREE.Color(NX_COLORS.outline) },
}

/** 描画の高さ（画素）を輪郭線のシェーダへ渡す（renderer.getDrawingBufferSize の y） */
export function setOutlineViewport(heightPx: number): void {
  OUTLINE.viewportH.value = Math.max(1, heightPx)
}

/**
 * 輪郭線の押し出し量（ビュー空間の長さ）を計算する GLSL。
 * 画面の高さに対する割合 uOutlineWidth と、最小の画素数 uOutlineMinPx の大きい方。
 * 使う側で uOutlineWidth・uOutlineMinPx・uOutlineViewH・uOutlineMin を宣言する
 */
export const OUTLINE_WIDTH_GLSL = /* glsl */ `
float nxOutlineWidth(float viewZ, float minWorld) {
  float frac = max(uOutlineWidth, uOutlineMinPx / max(uOutlineViewH, 1.0));
  return max(minWorld, frac * 2.0 * viewZ / projectionMatrix[1][1]);
}
`

/** ソフビらしい「やわらかい自己照明」：影でも本体色（彩度）を保つ。拡散色 × この値を発光に足す */
export const SELF_LIGHT = { value: 0.2 }

/** 反転ハル輪郭線を仕込む（aOutline=1 の頂点だけ外へ押し出し、輪郭色で塗る） */
export function withOutlineShader<T extends THREE.Material>(mat: T, key: string): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineWidth = OUTLINE.width
    shader.uniforms.uOutlineMin = OUTLINE.minWorld
    shader.uniforms.uOutlineMinPx = OUTLINE.minPx
    shader.uniforms.uOutlineViewH = OUTLINE.viewportH
    shader.uniforms.uOutlineColor = OUTLINE.color
    shader.uniforms.uSelfLight = SELF_LIGHT
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aOutline;\nvarying float vOutline;\nuniform float uOutlineWidth;\nuniform float uOutlineMin;\nuniform float uOutlineMinPx;\nuniform float uOutlineViewH;\n' + OUTLINE_WIDTH_GLSL,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  vOutline = aOutline;
  if (aOutline > 0.5) {
    vec3 nV = normalize(normalMatrix * objectNormal);
    // 画面上でほぼ一定の太さ（距離 × 画角で換算）。近いときは最小の太さ、低い解像度でも最小の画素数を保つ
    float wv = nxOutlineWidth(-mvPosition.z, uOutlineMin);
    mvPosition.xyz += nV * wv;
    gl_Position = projectionMatrix * mvPosition;
  }`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vOutline;\nuniform vec3 uOutlineColor;\nuniform float uSelfLight;')
      .replace('void main() {', 'void main() {\n  if (vOutline > 0.5) { gl_FragColor = vec4(uOutlineColor, 1.0); return; }')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uSelfLight;')
  }
  mat.customProgramCacheKey = () => 'nxOutline-' + key
  return mat
}

/** 影用：ハルの頂点は描かない（クリップ外へ） */
export function createHullDepthMaterial(): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial()
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aOutline;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  if (aOutline > 0.5) gl_Position = vec4(0.0, 0.0, -10.0, 1.0);')
  }
  m.customProgramCacheKey = () => 'nxHullDepth'
  return m
}

export type NexmaxMaterials = {
  body: THREE.MeshPhysicalMaterial
  torso: THREE.MeshPhysicalMaterial
  plate: THREE.MeshPhysicalMaterial
  eyes: THREE.MeshPhysicalMaterial
  features: THREE.MeshStandardMaterial
  ore: THREE.MeshBasicMaterial
  ring: THREE.MeshBasicMaterial
  claw: THREE.MeshStandardMaterial
  hullDepth: THREE.MeshDepthMaterial
  dispose(): void
}

function vinyl(color: THREE.ColorRepresentation, map: THREE.Texture | null = null): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    map,
    roughness: 0.62,
    metalness: 0,
    sheen: 0.25,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color('#cfeaff'),
    clearcoat: 0.08,
    clearcoatRoughness: 0.6,
    vertexColors: true,
  })
}

export type TorsoTexSpec = {
  /** 胴の uv の v（0..1）でのロゴ中心 */
  logoV: number
  /** 胴の uv の u でのロゴ中心（正面） */
  logoU: number
  /** ロゴの大きさ（uv 単位） */
  logoW: number
  logoH: number
}

/** 胴のテクスチャ：無地の青＋胸の山形ロゴ（2 色の三角形） */
export function makeTorsoTexture(spec: TorsoTexSpec): THREE.CanvasTexture {
  const W = 1024
  const H = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  // 胴の頂点色は白にして、地の青はテクスチャ側に持つ（ロゴの色が濁らないように）
  ctx.fillStyle = NX_COLORS.body
  ctx.fillRect(0, 0, W, H)
  const x0 = (spec.logoU - spec.logoW / 2) * W
  const y0 = (1 - spec.logoV - spec.logoH / 2) * H
  const w = spec.logoW * W
  const h = spec.logoH * H
  const poly = (pts: number[][], col: string) => {
    ctx.beginPath()
    pts.forEach(([u, v], i) => {
      const x = x0 + u * w
      const y = y0 + v * h
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.fillStyle = col
    ctx.fill()
  }
  // 見本の拡大図から測った形（左の三角・中央の明るい帯・右の三角）
  poly(
    [
      [0, 0.4108],
      [0, 1],
      [0.525, 1],
    ],
    NX_COLORS.logoDark,
  )
  poly(
    [
      [1, 0],
      [1, 1],
      [0.95, 1],
      [0.5375, 0.5212],
    ],
    NX_COLORS.logoRight,
  )
  poly(
    [
      [0.1825, 0.1218],
      [0.95, 1],
      [0.525, 1],
      [0.1825, 0.6147],
    ],
    NX_COLORS.logoLight,
  )
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.wrapS = THREE.RepeatWrapping
  return t
}

export function createNexmaxMaterials(torsoTex: THREE.Texture): NexmaxMaterials {
  // 本体の色は頂点色側に持たせる（color は白）。胴だけ頂点色を白にしてテクスチャ（青地＋ロゴ）を掛ける。
  const body = withOutlineShader(vinyl('#ffffff'), 'body')
  const torso = withOutlineShader(vinyl('#ffffff', torsoTex), 'torso')
  const plate = new THREE.MeshPhysicalMaterial({
    color: NX_COLORS.plate,
    // 見本の顔プレートは日陰でも白く見える：ほんの少しだけ自己発光
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.2,
    roughness: 0.5,
    sheen: 0.2,
    sheenColor: new THREE.Color('#ffffff'),
    clearcoat: 0.2,
    clearcoatRoughness: 0.4,
  })
  const eyes = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  })
  const features = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })
  const ore = new THREE.MeshBasicMaterial({ vertexColors: true })
  const ring = new THREE.MeshBasicMaterial({ vertexColors: true })
  const claw = new THREE.MeshStandardMaterial({ color: NX_COLORS.claw, roughness: 0.32, metalness: 0.55 })
  const hullDepth = createHullDepthMaterial()
  return {
    body,
    torso,
    plate,
    eyes,
    features,
    ore,
    ring,
    claw,
    hullDepth,
    dispose() {
      for (const m of [body, torso, plate, eyes, features, ore, ring, claw, hullDepth]) m.dispose()
      torsoTex.dispose()
    },
  }
}
