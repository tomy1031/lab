// ネクマックスのモデル（nexmax/）が使う型だけを置く小さな互換ファイル。
// 元は tomy1031/nexmax_chronicle の web/src/world/characters.ts（GLB 読み込みなどはここでは使わない）。
import type * as THREE from 'three'

export type CharacterName = 'nexmax'
export type Pose = 'idle' | 'walk' | 'hold' | 'crank' | 'wave' | 'run' | 'jump' | 'fall' | 'land' | 'swing' | 'pulled' | 'fire' | 'dash'

export interface Character {
  name: CharacterName
  root: THREE.Group
  placeholder: boolean
  height: number
  /** ビームの始点（ネクマックスの手元） */
  handAnchor: THREE.Object3D
  setPose(p: Pose): void
  /** 腕を向けるワールド座標（hold 用）。null で解除 */
  setAim(target: THREE.Vector3 | null): void
  update(dt: number, moveSpeed: number): void
}
