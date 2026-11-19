#!/usr/bin/env tsx
/**
 * Página local para escuchar las tomas candidatas y elegir cuáles se quedan (spec 40).
 *
 *   pnpm sfx:review            # abre http://127.0.0.1:5199
 *   pnpm sfx:review --only pet
 *
 * Cada sonido muestra sus tomas; marca tantas como `variants` del manifiesto. Los sonidos del
 * Pockai se pueden oír como baby/juvenile/adult/final (cambia la velocidad como hará el juego).
 * «Guardar selección» escribe scripts/sfx/.candidates/selection.json; luego `pnpm sfx:import`.
 * Solo escucha en 127.0.0.1.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, normalize } from 'node:path';
import { STAGE_RATE } from '../../shared/audio/src/profiles';
import { argValue, CANDIDATES_DIR, loadManifest, matchesOnly, readSelection, SELECTION_PATH } from './common';

const PORT = Number(argValue('--port') ?? 5199);
const only = (argValue('--only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function listCandidates() {
  const sounds = loadManifest();
  const out: { id: string; bus: string; variants: number; profile: string; prompt: string; note?: string; loop: boolean; files: string[] }[] = [];
  for (const def of sounds.values()) {
    if (def.source !== 'elevenlabs' || !matchesOnly(def.id, only)) continue;
    const dir = join(CANDIDATES_DIR, def.id);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort((a, b) => parseInt(a) - parseInt(b));
    if (files.length) out.push({ id: def.id, bus: def.bus, variants: def.variants, profile: def.profile, prompt: def.prompt, note: def.note, loop: def.loop, files });
  }
  return out;
}

function page(): string {
  const data = { sounds: listCandidates(), selection: readSelection(), stageRate: STAGE_RATE };
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Revisión de sonidos</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;--bg:#f6f4ef;--card:#fff;--ink:#222;--muted:#777;--accent:#7b5cff}
@media (prefers-color-scheme:dark){:root{--bg:#17161c;--card:#22212a;--ink:#eee;--muted:#999}}
body{margin:0;font:14px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--ink)}
header{position:sticky;top:0;background:var(--bg);padding:12px 16px;border-bottom:1px solid #8883;display:flex;gap:12px;align-items:center;flex-wrap:wrap;z-index:1}
main{padding:16px;display:grid;gap:12px;max-width:960px;margin:auto}
.card{background:var(--card);border-radius:12px;padding:12px 14px}
.id{font-weight:600}.bus{color:var(--muted);font-size:12px;margin-left:6px}
.prompt{color:var(--muted);font-size:12px;margin:4px 0 8px}
.takes{display:flex;flex-wrap:wrap;gap:8px}
.take{display:flex;align-items:center;gap:6px;border:1px solid #8884;border-radius:8px;padding:4px 8px}
.take.sel{border-color:var(--accent);outline:2px solid var(--accent)}
button{font:inherit;cursor:pointer;border-radius:8px;border:1px solid #8886;background:var(--card);color:var(--ink);padding:4px 10px}
button.primary{background:var(--accent);color:#fff;border:0}
.count{font-size:12px;color:var(--muted)}
</style></head><body>
<header><strong>Revisión de sonidos</strong>
<label>Etapa (sonidos del Pockai): <select id="stage"><option>baby</option><option>juvenile</option><option selected>adult</option><option>final</option></select></label>
<span class="count" id="progress"></span>
<button class="primary" id="save">Guardar selección</button><span id="saved" class="count"></span></header>
<main id="list"></main>
<script>
const DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')};
const sel = DATA.selection;
const list = document.getElementById('list');
let current = null;
function rateFor(s){ return s.profile.startsWith('creature') ? DATA.stageRate[document.getElementById('stage').value] : 1; }
function play(s, f){
  if (current) { current.pause(); }
  const a = new Audio('/c/' + encodeURIComponent(s.id) + '/' + f);
  a.preservesPitch = false; a.playbackRate = rateFor(s); a.loop = s.loop;
  a.play(); current = a;
}
function render(){
  list.innerHTML = '';
  for (const s of DATA.sounds) {
    const card = document.createElement('div'); card.className = 'card';
    const chosen = sel[s.id] || [];
    card.innerHTML = '<span class="id"></span><span class="bus"></span><div class="prompt"></div><div class="takes"></div>';
    card.querySelector('.id').textContent = s.id;
    card.querySelector('.bus').textContent = s.bus + ' · elige ' + s.variants + (s.loop ? ' · loop' : '') + ' · ' + chosen.length + '/' + s.variants;
    card.querySelector('.prompt').textContent = s.prompt + (s.note ? ' — ' + s.note : '');
    const takes = card.querySelector('.takes');
    s.files.forEach((f, i) => {
      const t = document.createElement('div'); t.className = 'take' + (chosen.includes(i) ? ' sel' : '');
      const p = document.createElement('button'); p.textContent = '▶ ' + (i + 1); p.onclick = () => play(s, f);
      const k = document.createElement('button'); k.textContent = chosen.includes(i) ? 'Quitar' : 'Elegir';
      k.onclick = () => {
        const cur = sel[s.id] || [];
        if (cur.includes(i)) sel[s.id] = cur.filter((x) => x !== i);
        else sel[s.id] = [...cur, i].slice(-s.variants);
        render();
      };
      t.append(p, k); takes.append(t);
    });
    list.append(card);
  }
  const done = DATA.sounds.filter((s) => (sel[s.id] || []).length >= 1).length;
  document.getElementById('progress').textContent = done + '/' + DATA.sounds.length + ' con selección';
}
document.getElementById('save').onclick = async () => {
  const r = await fetch('/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sel) });
  document.getElementById('saved').textContent = r.ok ? 'Guardado ✓ — ahora: pnpm sfx:import' : 'Error al guardar';
};
render();
</script></body></html>`;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page());
    return;
  }
  if (req.method === 'GET' && url.pathname.startsWith('/c/')) {
    const rel = decodeURIComponent(url.pathname.slice(3));
    const file = normalize(join(CANDIDATES_DIR, rel));
    if (!file.startsWith(CANDIDATES_DIR) || !file.endsWith('.mp3') || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' }).end(readFileSync(file));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/save') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        const clean: Record<string, number[]> = {};
        for (const [id, v] of Object.entries(parsed)) {
          if (Array.isArray(v)) clean[id] = v.filter((n): n is number => Number.isInteger(n) && n >= 0).sort((a, b) => a - b);
        }
        writeFileSync(SELECTION_PATH, JSON.stringify(clean, null, 2) + '\n');
        res.writeHead(204).end();
      } catch {
        res.writeHead(400).end();
      }
    });
    return;
  }
  res.writeHead(404).end();
});

server.listen(PORT, '127.0.0.1', () => {
  const n = listCandidates().length;
  console.log(n ? `Revisión de ${n} sonidos en http://127.0.0.1:${PORT}` : 'No hay candidatos todavía: pnpm sfx:generate');
});
