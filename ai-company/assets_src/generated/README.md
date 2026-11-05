# 生成した絵の元データ

codex（OpenAI の画像生成。ChatGPT アカウントでログインした codex CLI の built-in `image_gen`）で、
`docs/img/design_reference.jpg` の画風に合わせて生成したもの。画面で使う形への切り出しはスクリプトで行う。

| ファイル | 使い道 | 切り出し |
|---|---|---|
| `backdrop_{tokyo,osaka,phnompenh}.webp` | 3D の背景（透明な空）→ `client/public/backdrops/*.webp` | そのまま |
| `chars_{jp,kh,robot}.webp` | キャラクター（4 行 × 3 列：立ち・歩き・座り）→ `client/public/sprites/` | `python3 scripts/slice_sprites.py assets_src/generated/chars_jp.webp jp` |
| `login_bg.webp` | ログイン画面の背景 → `client/public/brand/login-bg.webp` | そのまま |

画面ごとのデザインの改善案（codex が作ったモックアップと実装メモ）は `docs/design/` にある。
