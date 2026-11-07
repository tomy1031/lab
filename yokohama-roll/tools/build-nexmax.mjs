// Build js/vendor/nexmax.js: the procedural NexMax (ネクマックス) character, bundled into ONE browser
// ES module for the game. Reproducible: the TypeScript sources are read straight from git, not from
// a working copy.
//
//   node tools/build-nexmax.mjs [git-ref]        (default ref: origin/claude/ai-employee-3d-visualization-bgkso0)
//
// What it does
//   1. `git show <ref>:<file>` for ai-company/client/src/world/nexmax/*.ts (+ characters.ts, type-only)
//      into a fresh temp dir, keeping the relative layout so the imports resolve.
//   2. Applies the small, commented PATCHES below (string replacements; each must match exactly once,
//      or the build fails, so a changed upstream file is noticed instead of silently mis-patched).
//   3. Bundles with esbuild into js/vendor/nexmax.js. Only the bare `three` import stays external
//      (the page maps it to three@0.170.0); three/examples BufferGeometryUtils is bundled in.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const REF = process.argv[2] || 'origin/claude/ai-employee-3d-visualization-bgkso0';
const SRC = 'ai-company/client/src/world';
const FILES = [
  'characters.ts',
  'nexmax/anim.ts',
  'nexmax/body.ts',
  'nexmax/geom.ts',
  'nexmax/head.ts',
  'nexmax/materials.ts',
  'nexmax/nexmaxModel.ts',
  'nexmax/production.ts',
];
const OUT = path.join(projectRoot, 'js/vendor/nexmax.js');

const git = (...args) => execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', maxBuffer: 64 << 20 });
const commit = git('rev-parse', REF).trim();
const commitDate = git('show', '-s', '--format=%cI', commit).trim();

// ------------------------------------------------------------------ patches
// The sources were written against three 0.187; the game ships three 0.170.0. Everything they use
// (MeshPhysicalMaterial sheen/clearcoat, InstancedMesh, the shader chunks hooked in onBeforeCompile:
// <common>, <project_vertex>, <emissivemap_fragment>, `void main() {`, objectNormal,
// totalEmissiveRadiance, the gl_FragColor alias, and BufferGeometryUtils.mergeGeometries/mergeVertices)
// exists unchanged in 0.170, so no API patch is needed. The patches below only make failures loud
// and keep the bundle self-describing.
const PATCHES = [
  {
    file: 'nexmax/materials.ts',
    why: 'three 0.170 compat guard: if a hooked shader chunk is ever missing (e.g. a different three '
      + 'version), String.replace silently does nothing and the outline hull renders as a fat blue '
      + 'shell. Warn once instead of failing silently.',
    find: "    shader.fragmentShader = shader.fragmentShader\n      .replace('#include <common>', '#include <common>\\nvarying float vOutline;",
    replace: "    if (!shader.vertexShader.includes('#include <project_vertex>') || !shader.fragmentShader.includes('#include <emissivemap_fragment>'))\n      console.warn('[nexmax] outline shader hooks not found in this three.js build (' + THREE.REVISION + ')')\n    shader.fragmentShader = shader.fragmentShader\n      .replace('#include <common>', '#include <common>\\nvarying float vOutline;",
  },
];

function applyPatches(dir) {
  for (const p of PATCHES) {
    const f = path.join(dir, p.file);
    const src = fs.readFileSync(f, 'utf8');
    const n = src.split(p.find).length - 1;
    if (n !== 1) throw new Error(`patch for ${p.file} matched ${n} times (expected 1): ${p.why}`);
    fs.writeFileSync(f, src.replace(p.find, () => p.replace));
  }
}

// ------------------------------------------------------------------ extract
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexmax-src-'));
try {
  for (const f of FILES) {
    const dst = path.join(tmp, f);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, git('show', `${commit}:${SRC}/${f}`));
  }
  applyPatches(tmp);
  // Public surface for the game: the factory plus the bits a host needs (outline viewport, joint sizes).
  fs.writeFileSync(path.join(tmp, 'entry.ts'), [
    "export { createNexmax, NEXMAX_POSES } from './nexmax/nexmaxModel'",
    "export type { NexmaxCharacter, NexmaxPose, NexmaxExpression, NexmaxOptions } from './nexmax/nexmaxModel'",
    "export { setOutlineViewport, OUTLINE, SELF_LIGHT, NX_COLORS } from './nexmax/materials'",
    "export { J as NEXMAX_JOINTS } from './nexmax/body'",
    '',
  ].join('\n'));

  const threeDir = path.join(projectRoot, 'node_modules/three');
  const threeVersion = JSON.parse(fs.readFileSync(path.join(threeDir, 'package.json'), 'utf8')).version;
  const header = [
    '// NexMax (ネクマックス) procedural character, bundled for ハマころ！ — DO NOT EDIT;',
    '// regenerate with tools/build-nexmax.mjs (npm run build:nexmax).',
    `// Source: ${REF} @ ${commit} (${commitDate})`,
    `//         ${SRC}/{${FILES.join(',')}}`,
    '//         (ported from tomy1031/nexmax_chronicle). Patches applied: ' + (PATCHES.length ? PATCHES.map((p) => p.file).join(', ') : 'none'),
    `// Bundled with esbuild; external: "three" only (built and checked against three ${threeVersion}).`,
    '',
  ].join('\n');

  const result = await build({
    entryPoints: [path.join(tmp, 'entry.ts')],
    absWorkingDir: tmp,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    minify: false,
    legalComments: 'none',
    charset: 'utf8',
    write: false,
    banner: { js: header },
    logLevel: 'warning',
    plugins: [{
      name: 'three-external',
      setup(b) {
        // keep exactly `three` external; resolve three/examples/* from the game's node_modules and bundle it
        b.onResolve({ filter: /^three$/ }, () => ({ path: 'three', external: true }));
        b.onResolve({ filter: /^three\// }, (a) => ({ path: path.join(threeDir, a.path.slice('three/'.length)) }));
      },
    }],
  });
  let code = result.outputFiles[0].text;
  // esbuild's `// <path>` comments are relative to absWorkingDir (the temp dir); make them stable
  code = code.split(path.relative(tmp, threeDir).split(path.sep).join('/')).join('node_modules/three');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, code);
  const imports = [...new Set([...code.matchAll(/^import .* from ["']([^"']+)["']/gm)].map((m) => m[1]))];
  if (imports.length !== 1 || imports[0] !== 'three') throw new Error('unexpected imports in bundle: ' + imports.join(', '));
  console.log(`wrote ${path.relative(projectRoot, OUT)} (${(code.length / 1024).toFixed(1)} KiB) from ${commit.slice(0, 10)}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
