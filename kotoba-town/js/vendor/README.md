# js/vendor — libraries bundled with the app (so it also runs offline as a PWA)

| Path | Library | Version | License |
|---|---|---|---|
| `three/` | three.js (`build/three.module.js`, `three.core.js`, and the addons the app uses with what they import: RoundedBoxGeometry, BufferGeometryUtils, XRControllerModelFactory) | 0.186.1 | MIT (`three/LICENSE`) |
| `nexmax.js` | the NexMax guide model (the same one as ハマころ！) | — | — |

three.js is copied unchanged from the npm package. The VR controller models still come from the WebXR Input
Profiles on jsDelivr (the published app's service worker keeps the Quest ones for offline use).
`dev/scene.html` (not published) still loads three.js from the CDN.
