# vendor — libraries bundled with the game (so it also runs offline as a PWA)

| Folder | Library | Version | License |
|---|---|---|---|
| `three/` | three.js (`build/three.module.js`, `three.core.js`, and the addons the game uses: GLTFLoader, BufferGeometryUtils, SkeletonUtils, Sky) | 0.186.1 | MIT (`three/LICENSE`) |
| `three-vrm/` | @pixiv/three-vrm (`three-vrm.module.js`) | 3.5.5 | MIT (`three-vrm/LICENSE`) |
| `mediapipe/` | @mediapipe/tasks-vision (`vision_bundle.mjs`, `wasm/vision_wasm_internal.*`) and the hand landmarker model (`hand_landmarker.task`, float16 v1) | 0.10.35 | Apache-2.0 |

Copied unchanged from the npm packages (and the model from Google's MediaPipe model storage).
