// Scene registry: id → lazy module. Each module default-exports build({ setup }) and exports meta.
export const SCENE_MODULES = {
  office: () => import('./office.js'),
  classroom: () => import('./classroom.js'),
  apartment: () => import('./apartment.js'),
  depato: () => import('./depato.js'),
  museum: () => import('./museum.js'),
  station: () => import('./station.js'),
  cafe: () => import('./cafe.js'),
  park: () => import('./park.js'),
  home: () => import('./home.js'),
  konbini: () => import('./konbini.js'),
  hub: () => import('./hub.js'),
};

export async function loadScene(id) {
  const load = SCENE_MODULES[id];
  if (!load) throw new Error(`unknown scene ${id}`);
  return load();
}
