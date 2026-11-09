// tools/music.mjs — renders 12 bars of every built-in song (the busiest part) with an OfflineAudioContext in
// the browser and checks that each one makes sound, does not clip, and has no NaNs. Then it runs the beat
// detector used for your own music files on each rendering:
//   - the true tempo must be the one found, or one of the alternatives offered in the menu
//   - for the songs with a plain beat, the beat (not the "&") must be found; the funk and breakbeat songs are
//     syncopated on purpose and are only reported
//   node tools/music.mjs
import { browser, serveApp } from './pw.mjs';

const { srv, base } = await serveApp();
const b = await browser();
const page = await b.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base + 'tools/blank.html');
const res = await page.evaluate(async () => {
  const { AudioEngine } = await import('../js/audio.js');
  const { GenPlayer } = await import('../js/player.js');
  const { SONGS } = await import('../js/songs.js');
  const { analyze } = await import('../js/beat.js');
  const out = [];
  for (const song of SONGS) {
    const sr = 22050;
    const probe = new GenPlayer({}, song, {});
    const from = Math.max(0, probe.bars.findIndex((x) => x.e >= 3 || (song.drill && x.e >= 2)));
    const bars = 12, dur = bars * probe.barDur + 1;
    const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
    const store = { data: { vol: { music: 0.85, guide: 0.7, sfx: 0.7 } } };
    const audio = new AudioEngine(store);
    audio._init(ctx);
    const p = new GenPlayer(audio, song, {});
    p.bars = p.bars.slice(from, from + bars);
    p.start(0, 0, 0);
    clearInterval(p.timer);
    p.pump(1e9);
    const buf = await ctx.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0, sum = 0, nan = 0;
    const perBar = [];
    const spb = Math.floor(p.barDur * sr);
    for (let i = 0; i < d.length; i++) { const v = d[i]; if (!Number.isFinite(v)) { nan++; continue; } peak = Math.max(peak, Math.abs(v)); sum += v * v; }
    for (let k = 0; k < bars; k++) { let s = 0; for (let i = k * spb; i < (k + 1) * spb; i++) s += d[i] * d[i]; perBar.push(Math.sqrt(s / spb)); }
    // the beat detector (used for your own music files) should find this song's tempo and its downbeat
    const an = analyze(buf);
    const t0err = Math.min(...[0, 1, 2].map((k) => Math.abs(an.t0 - k * p.barDur)));
    const beat = p.grid.spb, phaseErr = Math.abs(((an.t0 % beat) + beat + beat / 2) % beat - beat / 2);
    out.push({ id: song.id, bpm: song.bpm, found: an.bpm, alts: an.alts, t0: +an.t0.toFixed(3), t0err: +t0err.toFixed(3), phaseErr: +phaseErr.toFixed(3), peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(3), nan, minBarRms: +Math.min(...perBar).toFixed(3) });
  }
  return out;
});
let ok = errors.length === 0;
for (const r of res) {
  const good = r.nan === 0 && r.rms > 0.03 && r.peak <= 1.0 && r.minBarRms > 0.01;
  const plain = !['funk', 'breaks'].includes(r.id);
  const tempoOk = [r.found, ...r.alts].some((b) => Math.abs(b - r.bpm) <= 1);
  const phaseOk = r.phaseErr < 0.03 && Math.abs(r.found - r.bpm) <= 1;
  const tempo = tempoOk && (phaseOk || !plain);
  ok = ok && good && tempo;
  console.log(`${good ? 'ok ' : 'BAD'} ${r.id.padEnd(7)} rms ${r.rms}  peak ${r.peak}  quietest bar ${r.minBarRms}  NaN ${r.nan}   ${tempo ? (phaseOk ? 'ok ' : 'ok*') : 'BAD'} tempo ${r.bpm} → found ${r.found} (alternatives ${r.alts.join(', ')}), first "1" at ${r.t0}s (beat phase off by ${r.phaseErr}s, downbeat off by ${r.t0err}s)`);
}
console.log('ok* = syncopated song: the right tempo is offered, the beat may need the "swap" button');
if (errors.length) console.log(errors.join('\n'));
await b.close();
srv.close();
process.exit(ok ? 0 : 1);
