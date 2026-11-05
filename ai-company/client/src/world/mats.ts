// マテリアルの共有（同じ色は 1 つだけ作る）。トゥーン（陰が 3 段）でおもちゃっぽく。
import * as THREE from 'three'
import { toonGradient } from './textures'

const toon = new Map<string, THREE.MeshToonMaterial>()
const basic = new Map<string, THREE.MeshBasicMaterial>()
const ghosts = new Map<string, THREE.Material>()

export function toonMat(color: string): THREE.MeshToonMaterial {
  let m = toon.get(color)
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() })
    toon.set(color, m)
  }
  return m
}

/**
 * 光る色の明るさの倍率。1 を超える（HDR の）明るさにして、ブルーム（やわらかい光のにじみ）が
 * 光る部分だけに掛かるようにする（照らされた白い床は 2 を超えない）
 */
export const GLOW_BOOST = 2.6

export function hdr(color: string, k = GLOW_BOOST): THREE.Color {
  return new THREE.Color(color).multiplyScalar(k)
}

/** 光る部分（目・アンテナ・画面）：ライトの影響を受けない */
export function glowMat(color: string, opacity = 1): THREE.MeshBasicMaterial {
  const key = `${color}|${opacity}`
  let m = basic.get(key)
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: hdr(color), transparent: opacity < 1, opacity, depthWrite: opacity >= 1 })
    basic.set(key, m)
  }
  return m
}

/** オフライン・離席のときの半透明版（元のマテリアルごとに 1 つ） */
export function ghostOf(m: THREE.Material): THREE.Material {
  let g = ghosts.get(m.uuid)
  if (!g) {
    g = m.clone()
    g.transparent = true
    g.opacity = 0.38
    g.depthWrite = false
    if ((g as THREE.MeshToonMaterial).color) (g as THREE.MeshToonMaterial).color.lerp(new THREE.Color('#b8c2d6'), 0.55)
    ghosts.set(m.uuid, g)
  }
  return g
}

/** 色を明るく・暗く（-1..1） */
export function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex)
  if (k >= 0) c.lerp(new THREE.Color('#ffffff'), k)
  else c.lerp(new THREE.Color('#000000'), -k)
  return `#${c.getHexString()}`
}

export function disposeAllMats(): void {
  for (const m of toon.values()) m.dispose()
  for (const m of basic.values()) m.dispose()
  for (const m of ghosts.values()) m.dispose()
  toon.clear()
  basic.clear()
  ghosts.clear()
}
