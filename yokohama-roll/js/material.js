// Shared toy-like material: vertex colours + a `glow` attribute that lights up as uNight rises.
import * as THREE from 'three';

export const nightUniform = { value: 0 };

export function makeToyMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = nightUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vGlow * (0.18 + 1.6 * uNight);'
      );
  };
  m.customProgramCacheKey = () => 'toy-glow';
  return m;
}
