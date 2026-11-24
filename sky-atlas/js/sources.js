// js/sources.js — where the map data comes from. Only open data that anyone may download and keep:
// no Google (its terms forbid storing tiles), no Bing / Esri / Mapbox imagery.
//
//   satellite (world)  Sentinel-2 cloudless by EOX — 10 m, cloud-free yearly mosaic (zoom ≤ 14)
//   aerial (regions)   国土地理院 / USGS / IGN / swisstopo orthophotos — 0.3–1 m (zoom ≤ 17)
//   terrain (world)    AWS Terrain Tiles (Terrarium) — SRTM / 3DEP / EU-DEM … (zoom ≤ 15)
//   terrain (Japan)    国土地理院 標高タイル dem_png — 5–10 m (zoom ≤ 14)
//   buildings          OpenStreetMap via the Overpass API (footprints + height / levels)
//   place search       Nominatim (OpenStreetMap)

export const S2_YEARS = [2024, 2022, 2020, 2016];

export function s2Layer(year) {
  return year === 2016 ? 's2cloudless_3857' : `s2cloudless-${year}_3857`;
}

export const SAT = {
  id: 's2',
  name: 'Sentinel-2 cloudless',
  maxZ: 14,
  url: (z, x, y, year = 2024) => `https://tiles.maps.eox.at/wmts/1.0.0/${s2Layer(year)}/default/g/${z}/${y}/${x}.jpg`,
  credit: (year) => `衛星写真：Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH（Contains modified Copernicus Sentinel data ${year === 2016 ? '2016 & 2017' : year}）`,
  license: (year) => (year === 2016 ? 'CC BY 4.0' : 'CC BY-NC-SA 4.0（非商用）'),
};

// a region is a list of [south, west, north, east] boxes
const inBoxes = (boxes, lat, lon) => boxes.some(([s, w, n, e]) => lat >= s && lat <= n && lon >= w && lon <= e);

export const AERIAL = [
  {
    id: 'gsi', name: '国土地理院 全国最新写真（シームレス）', maxZ: 17, conc: 4,
    boxes: [[30.0, 129.3, 34.4, 132.2], [32.5, 129.5, 35.6, 135.5], [33.4, 132.0, 37.9, 141.2], [35.0, 135.4, 41.6, 142.2], [41.3, 139.3, 45.6, 146.0], [24.0, 122.9, 28.6, 131.4], [26.0, 140.8, 27.8, 142.4]],
    url: (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${z}/${x}/${y}.jpg`,
    credit: '航空写真：国土地理院（地理院タイル 全国最新写真（シームレス））',
  },
  {
    id: 'usgs', name: 'USGS Imagery (NAIP)', maxZ: 16, conc: 6,
    boxes: [[24.4, -125.0, 49.4, -66.9], [18.8, -160.5, 22.4, -154.7], [54.0, -170.0, 71.5, -130.0]],
    url: (z, x, y) => `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/${z}/${y}/${x}`,
    credit: 'Aerial imagery: USGS The National Map (public domain)',
  },
  {
    id: 'swiss', name: 'swisstopo SWISSIMAGE', maxZ: 17, conc: 4,
    boxes: [[45.82, 5.96, 47.81, 10.49]],
    url: (z, x, y) => `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/${z}/${x}/${y}.jpeg`,
    credit: 'Aerial imagery: © swisstopo (SWISSIMAGE)',
  },
  {
    id: 'ign', name: 'IGN BD ORTHO', maxZ: 17, conc: 4,
    boxes: [[42.3, -4.8, 51.1, 8.2], [41.3, 8.5, 43.1, 9.6]],
    url: (z, x, y) => `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`,
    credit: 'Prises de vue aériennes : © IGN – BD ORTHO（Licence Ouverte Etalab 2.0）',
  },
];

// the high-resolution aerial source for a place (the first region that contains it), or null
export function aerialFor(lat, lon) {
  return AERIAL.find((a) => inBoxes(a.boxes, lat, lon)) || null;
}

export const DEM = {
  id: 'terrarium', maxZ: 15, conc: 6, decode: 'terrarium',
  url: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
  credit: '地形：Terrain Tiles（Mapzen / AWS Open Data）',
};

export const DEM_JP = {
  id: 'gsidem', maxZ: 14, conc: 4, decode: 'gsi',
  boxes: AERIAL[0].boxes,
  url: (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/dem_png/${z}/${x}/${y}.png`,
  credit: '標高：国土地理院（地理院タイル 標高タイル）',
};
export const demJpFor = (lat, lon) => (inBoxes(DEM_JP.boxes, lat, lon) ? DEM_JP : null);

// the Terrain Tiles attribution list, as their documentation asks
export const TERRAIN_SOURCES = [
  'ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and funded under National Science Foundation awards 1043681, 1559691, and 1542736',
  'Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017',
  'Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich',
  'Canada terrain data contains information licensed under the Open Government Licence – Canada',
  'Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers',
  'Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration',
  'Mexico terrain data source: INEGI, Continental relief, 2016',
  'New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved)',
  'Norway terrain data © Kartverket',
  'United Kingdom terrain data © Environment Agency copyright and/or database right 2015. All rights reserved',
  'United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey',
];

export const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
export const OSM_CREDIT = '建物：© OpenStreetMap contributors（ODbL）';

export const NOMINATIM = (q) => `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=ja&q=${encodeURIComponent(q)}`;
