// data/climate.js — weather types and transitions (DESIGN.md §5.1–5.3).
// Weather is decided per 6-hour block (00–06 / 06–12 / 12–18 / 18–24) and blends over 15 game minutes.
// Visual parameters (cloud / rain / fog / wind 0…1 / storm) drive the sky, sea and rain particles.
export const WEATHER = {
  clear:   { name: '晴れ',   tmean: 27, wind: [1, 4],   wetPerH: 0,  humidity: 0.55, sun: 1.0, vis: 400, cloud: 0.12, rain: 0,    fog: 0,    storm: 0 },
  cloudy:  { name: 'くもり', tmean: 25, wind: [2, 5],   wetPerH: 0,  humidity: 0.65, sun: 0.3, vis: 350, cloud: 0.65, rain: 0,    fog: 0.05, storm: 0 },
  drizzle: { name: '小雨',   tmean: 23, wind: [2, 6],   wetPerH: 25, humidity: 0.85, sun: 0.1, vis: 220, cloud: 0.8,  rain: 0.35, fog: 0.15, storm: 0 },
  rain:    { name: '大雨',   tmean: 21, wind: [4, 9],   wetPerH: 60, humidity: 0.95, sun: 0,   vis: 120, cloud: 0.95, rain: 0.75, fog: 0.3,  storm: 0.2 },
  storm:   { name: '嵐',     tmean: 19, wind: [12, 22], wetPerH: 90, humidity: 1.0,  sun: 0,   vis: 60,  cloud: 1.0,  rain: 1.0,  fog: 0.35, storm: 1 },
  fog:     { name: '霧',     tmean: 22, wind: [0, 2],   wetPerH: 5,  humidity: 0.98, sun: 0.2, vis: 40,  cloud: 0.5,  rain: 0,    fog: 1.0,  storm: 0 },
  heat:    { name: '猛暑',   tmean: 32, wind: [0, 3],   wetPerH: 0,  humidity: 0.45, sun: 1.3, vis: 400, cloud: 0.02, rain: 0,    fog: 0,    storm: 0 },
  typhoon: { name: '大嵐',   tmean: 18, wind: [20, 30], wetPerH: 95, humidity: 1.0,  sun: 0,   vis: 40,  cloud: 1.0,  rain: 1.0,  fog: 0.4,  storm: 1 },
};

const ORDER = ['clear', 'cloudy', 'drizzle', 'rain', 'storm'];
const DRY = [
  [0.70, 0.22, 0.06, 0.02, 0.00],
  [0.40, 0.35, 0.17, 0.07, 0.01],
  [0.25, 0.35, 0.25, 0.13, 0.02],
  [0.10, 0.30, 0.30, 0.25, 0.05],
  [0.05, 0.25, 0.30, 0.30, 0.10],
];
const WET = [
  [0.40, 0.30, 0.18, 0.10, 0.02],
  [0.20, 0.30, 0.27, 0.18, 0.05],
  [0.12, 0.25, 0.30, 0.25, 0.08],
  [0.05, 0.18, 0.30, 0.35, 0.12],
  [0.03, 0.15, 0.27, 0.35, 0.20],
];
/** next-block probabilities: [[type, p], …] for the current type and season ('dry' | 'wet') */
export function transitions(type, season) {
  const base = type === 'fog' ? 'cloudy' : type === 'heat' ? 'clear' : type === 'typhoon' ? 'storm' : type;
  const row = (season === 'wet' ? WET : DRY)[Math.max(0, ORDER.indexOf(base))];
  return ORDER.map((t, i) => [t, row[i]]);
}

export const CLIMATE = {
  seasonDays: { dry: 20, wet: 15 },  // repeating cycle (35 days)
  seasonTemp: { dry: +1, wet: -1 },
  swing: 5.0,                         // ± daily swing (°C), ×0.6 on cloudy / rainy days
  lapse: 0.06,                        // −0.6 °C per 10 m
  zone: { jungle: -1.0, beach: +0.5, rocks: +0.5 },
  caveTemp: 21,
  sunrise: 5.5, sunset: 19,
};
