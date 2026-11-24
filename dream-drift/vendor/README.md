# vendor — libraries bundled with the game (so it also runs offline as a PWA)

| Folder | Library | Version | License |
|---|---|---|---|
| `three/` | three.js (`build/three.module.js`, `three.core.js`, and the addons the game uses with what they import: RoomEnvironment, EffectComposer / RenderPass / UnrealBloomPass / OutputPass, BufferGeometryUtils, XRControllerModelFactory, XRHandModelFactory) | 0.186.1 | MIT (`three/LICENSE`) |
| `mediapipe/` | @mediapipe/tasks-vision (`vision_bundle.mjs`, `wasm/vision_wasm_internal.*`) and the hand landmarker model (`hand_landmarker.task`, float16 v1) | 0.10.35 | Apache-2.0 |

Copied unchanged from the npm packages (and the model from Google's MediaPipe model storage); the same files as
`island-survival/vendor/`. The VR controller models still come from the WebXR Input Profiles on jsDelivr (the
published game's service worker keeps the Quest ones for offline play).
