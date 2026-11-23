# コンパニオン VRM モデルのライセンス / Companion VRM model licenses

両モデルとも VRM Public License 1.0 (https://vrm.dev/licenses/1.0/) で、再配布・改変・商用利用(法人を含む)が許可されています。
Both models are under the VRM Public License 1.0; redistribution, modification and commercial use (including by corporations) are allowed.

## seed-san.vrm

- モデル名 / Model: 「Seed-san」 by VirtualCast, Inc.
- ライセンス / License: VRM Public License 1.0 (https://vrm.dev/licenses/1.0/)
- クレジット表記 **必須** / Credit **REQUIRED**: `Seed-san model by VirtualCast, Inc.`
- 再配布: 可 / 改変: 可 / 商用利用: 可(法人)
  Redistribution: allowed / Modification: allowed / Commercial use: allowed (corporation)
- 入手元 / Source: https://github.com/vrm-c/vrm-specification/tree/master/samples/Seed-san

## hana.vrm

- モデル名 / Model: 「VRM1_Constraint_Twist_Sample」 (c) 2022 pixiv Inc.
- ライセンス / License: VRM Public License 1.0 (https://vrm.dev/licenses/1.0/)
- クレジット表記 不要 / Credit not required
- 再配布: 可 / 改変: 可
  Redistribution: allowed / Modification: allowed
- 入手元 / Source: https://github.com/pixiv/three-vrm (packages/three-vrm/examples/models), vrm-c/vrm-specification の samples にも同梱
  Also in the vrm-c/vrm-specification samples.

## 改変内容 / Modifications

行った改変は、テクスチャの縮小(最大辺 768px、`tools/shrink_vrm.py` を使用)のみです。メッシュ・ボーン・表情・メタ情報は変更していません。
The only modification is texture downscaling (longest side <= 768 px) with `tools/shrink_vrm.py`. Meshes, bones, expressions and meta are unchanged.
