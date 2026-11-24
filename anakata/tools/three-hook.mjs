// tools/three-hook.mjs — lets Node import the game's modules: the bare specifier 'three' resolves to the
// vendored copy, as the page's import map does in the browser.
export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../js/vendor/three.module.min.js', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
