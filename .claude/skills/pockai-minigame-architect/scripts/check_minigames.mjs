#!/usr/bin/env node
// Comprueba reglas de diseño de los minijuegos que no cubren scripts/validate-game-data.js ni los
// tests del paquete: que cada juego tenga lógica, vista, registro, datos y variante accesible, que sus
// números entren en banda, y que tenga brief, arte propio y ningún emoji en la vista. Da también el
// inventario y los huecos.
// Uso: node .claude/skills/pockai-minigame-architect/scripts/check_minigames.mjs [gameId]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const at = (...p) => path.join(root, ...p);
const readJson = (f) => JSON.parse(fs.readFileSync(at('shared/game-data', f), 'utf8'));
const readText = (f) => (fs.existsSync(at(f)) ? fs.readFileSync(at(f), 'utf8') : '');

const balance = readJson('balance.json');
const access = readJson('accessibility.json').minigames ?? {};
const foods = readJson('foods.json');
const mg = balance.minigames ?? {};
const games = mg.games ?? {};

const ELEMENTS = ['fire', 'water', 'plant', 'electric', 'shadow', 'light'];
const ID = /^[a-z][a-z0-9_]*$/;
// Bandas orientativas (references/balance.md).
const DURATION = [30, 90];
const CEILING = [1, 4];
const COINS = [36, 40];
const XP = [50, 60];
const HAPPINESS = [12, 15];
const MAX_DROP_PRICE = 25;
// Emoji y pictogramas: lo que no puede quedar en una vista. Se permiten las flechas y símbolos de
// texto que se usan en pistas y HUD (← → ↑ ↓ ★ ⏱ ▶ − × ·).
const EMOJI = /(\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}])/gu;
const ALLOWED = new Set(['★', '⏱', '▶', '↑', '↓', '←', '→', '↔', '↕', '©', '®', '™']);

const only = process.argv[2];
const errors = [];
const warnings = [];
if (only && !games[only]) errors.push(`No existe el minijuego '${only}' en balance.json (minigames.games)`);

const logicSrc = readText('shared/minigames/src/logic.ts');
const registrySrc = readText('shared/minigames/src/registry.ts');
const specSrc = readText('shared/minigames/src/games.spec.ts');
const gameFiles = fs.existsSync(at('shared/minigames/src/games')) ? fs.readdirSync(at('shared/minigames/src/games')).filter((f) => f.endsWith('.ts')) : [];
const viewFiles = fs.existsSync(at('shared/minigames/src/views')) ? fs.readdirSync(at('shared/minigames/src/views')).filter((f) => f.endsWith('View.ts')) : [];

/** Archivo de lógica de un juego: el que declara `id: '<id>'`. */
const logicFile = (id) => gameFiles.find((f) => new RegExp(`id:\\s*'${id}'`).test(readText(`shared/minigames/src/games/${f}`)));
/** Archivo de vista: el `create…View` que el registro asocia al id. */
function viewFile(id) {
  const m = registrySrc.match(new RegExp(`${id}:\\s*\\{[^}]*createView:\\s*(create\\w+)`));
  if (!m) return null;
  return viewFiles.find((f) => readText(`shared/minigames/src/views/${f}`).includes(`function ${m[1]}`)) ?? null;
}
const emojiIn = (src) => [...new Set((src.match(EMOJI) ?? []).filter((c) => !ALLOWED.has(c)))];
const artDir = (id) => at('shared/assets/minigames', id);
const artOf = (id) => (fs.existsSync(artDir(id)) ? fs.readdirSync(artDir(id)) : []);
const inBand = (v, [lo, hi]) => v >= lo && v <= hi;

const rows = [];
for (const [id, g] of Object.entries(games)) {
  const mine = !only || id === only;
  const err = (m) => mine && errors.push(`[${id}] ${m}`);
  const warn = (m) => mine && warnings.push(`[${id}] ${m}`);

  if (!ID.test(id)) err('id inválido (snake_case, sin tildes)');
  const words = String(g.name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) err('falta name');
  else if (words.length > 5) warn(`nombre largo («${g.name}»): mejor de 2 a 4 palabras`);

  // Las tres piezas
  const lf = logicFile(id);
  if (!lf) err('sin lógica: ningún archivo de shared/minigames/src/games declara este id');
  else if (!new RegExp(`\\b${id}\\b|${lf.replace('.ts', '')}`).test(logicSrc)) err(`la lógica (${lf}) no está en GAME_DEFINITIONS de logic.ts`);
  const vf = viewFile(id);
  if (!new RegExp(`\\b${id}:\\s*\\{`).test(registrySrc)) err('no está en registry.ts: ningún cliente sabrá jugarlo');
  else if (!vf) err('registry.ts no le asocia una vista que exista en src/views');
  if (!/howTo:/.test(registrySrc.match(new RegExp(`${id}:\\s*\\{[^}]*\\}`))?.[0] ?? '')) warn('sin howTo en registry.ts');
  if (lf) {
    const src = readText(`shared/minigames/src/games/${lf}`);
    if (/Math\.random|Date\.now|performance\.now|setTimeout|setInterval/.test(src)) err(`${lf} usa reloj o azar que no sale de la semilla: la partida no se podría repetir`);
    if (/Math\.(sin|cos|tan|pow|exp|log|sqrt)\b/.test(src)) warn(`${lf} usa funciones de Math que no son iguales bit a bit en todos los motores`);
    if (/from '\.\.\/(views|assets|pet|host|styles)/.test(src)) err(`${lf} importa código de la vista: el backend no compilará`);
    if (!/variant/.test(src)) warn(`${lf} no lee la variante: ¿la versión accesible es igual que la normal?`);
    const constName = (src.match(/export const (\w+)\s*[:=]\s*(GameDefinition|{)/) ?? [])[1];
    const exported = (src.match(/export const (\w+): GameDefinition/) ?? [])[1];
    if (exported && !specSrc.includes(exported) && !specSrc.includes(`'${id}'`)) warn('sin bot perfecto en games.spec.ts: el techo no está demostrado');
    void constName;
  }

  // Datos
  for (const k of ['durationSeconds', 'minDurationSeconds', 'maxScorePerSecond', 'coinsPerPoint', 'maxCoins', 'xpPerPoint', 'maxXp', 'happiness']) {
    if (typeof g[k] !== 'number' || g[k] < 0) err(`${k} debe ser un número mayor o igual que 0`);
  }
  if (g.element !== undefined && !ELEMENTS.includes(g.element)) err(`element '${g.element}' no es un Flujo`);
  if (!inBand(g.durationSeconds, DURATION)) warn(`durationSeconds ${g.durationSeconds} fuera de banda (${DURATION.join('–')} s)`);
  if (g.minDurationSeconds > g.durationSeconds) err('minDurationSeconds supera durationSeconds');
  else if (g.minDurationSeconds > g.durationSeconds / 2) warn(`minDurationSeconds ${g.minDurationSeconds} pasa de la mitad de la duración: una partida abandonada pronto no cobra`);
  if (!inBand(g.maxScorePerSecond, CEILING)) warn(`maxScorePerSecond ${g.maxScorePerSecond} fuera de banda (${CEILING.join('–')})`);
  if (!inBand(g.maxCoins, COINS)) warn(`maxCoins ${g.maxCoins} fuera de banda (${COINS.join('–')}): todos los juegos pagan parecido`);
  if (!inBand(g.maxXp, XP)) warn(`maxXp ${g.maxXp} fuera de banda (${XP.join('–')})`);
  if (!inBand(g.happiness, HAPPINESS)) warn(`happiness ${g.happiness} fuera de banda (${HAPPINESS.join('–')})`);
  // Puntos que hacen falta para tocar el máximo de monedas, frente a lo que el techo deja hacer.
  const toMaxCoins = g.coinsPerPoint > 0 ? g.maxCoins / g.coinsPerPoint : Infinity;
  const ceilingTotal = g.maxScorePerSecond * g.durationSeconds;
  if (toMaxCoins > ceilingTotal) warn(`hacen falta ${Math.ceil(toMaxCoins)} puntos para el máximo de monedas y el techo solo deja ${Math.floor(ceilingTotal)}`);
  if (g.itemDrop) {
    const item = foods.find((f) => f.id === g.itemDrop.itemId);
    if (!item) err(`itemDrop '${g.itemDrop.itemId}' no existe en foods.json`);
    else {
      if (item.kind !== 'food') warn(`itemDrop '${item.id}' es de tipo ${item.kind}: un minijuego solo debería soltar comida`);
      if (item.priceCoins > MAX_DROP_PRICE) warn(`itemDrop '${item.id}' vale ${item.priceCoins} monedas (máximo recomendado ${MAX_DROP_PRICE})`);
    }
    if (!(g.itemDrop.chance > 0 && g.itemDrop.chance <= 0.5)) warn(`itemDrop.chance ${g.itemDrop.chance} fuera de 0–0,5`);
    if (g.itemDrop.minScore > ceilingTotal) err(`itemDrop.minScore ${g.itemDrop.minScore} es inalcanzable (techo ${Math.floor(ceilingTotal)})`);
  }
  const a = access[id];
  if (!a) err('sin variante accesible en accessibility.json');
  else if (a.variant !== `${id}_easy`) warn(`accessibility.json: variant debería ser '${id}_easy'`);

  // Brief y arte
  const brief = fs.existsSync(at('docs/minijuegos', `${id}.md`));
  const art = artOf(id);
  const pieces = art.filter((f) => f.endsWith('.png'));
  const backdrop = art.includes('backdrop.webp');
  const viewSrc = vf ? readText(`shared/minigames/src/views/${vf}`) : '';
  const emoji = emojiIn(viewSrc);
  const usesPet = /ctx\.pet|\.pet\b/.test(viewSrc);
  if (!brief) warn(`sin brief en docs/minijuegos/${id}.md`);
  if (emoji.length) warn(`la vista (${vf}) todavía pinta emoji: ${emoji.join(' ')}`);
  if (vf && !usesPet) warn(`la vista (${vf}) no usa ctx.pet: el Pockai no sale en el juego`);
  if (!backdrop) warn(`sin fondo de arena (shared/assets/minigames/${id}/backdrop.webp)`);
  if (vf) {
    // Piezas que la vista pide por nombre y todavía no tienen arte: `pieceUrl(GAME, 'x')` es del propio
    // juego; `pieceUrl('otro', 'x')` reutiliza la de otro. Sin arte la vista pinta un recuadro: es un aviso.
    for (const m of viewSrc.matchAll(/pieceUrl\(\s*(GAME|['"][\w-]+['"])\s*,\s*['"]([\w-]+)['"]/g)) {
      const from = m[1] === 'GAME' ? id : m[1].slice(1, -1);
      if (!artOf(from).includes(`${m[2]}.png`)) warn(`la vista pide la pieza '${m[2]}' y no existe shared/assets/minigames/${from}/${m[2]}.png`);
    }
  }
  rows.push({ id, g, a, brief, pieces, backdrop, emoji, usesPet });
}

// Juegos con código y sin datos
for (const f of gameFiles) {
  const id = (readText(`shared/minigames/src/games/${f}`).match(/\bid:\s*'([a-z0-9_]+)'/) ?? [])[1];
  if (id && !games[id]) errors.push(`[${id}] tiene lógica (${f}) y no está en balance.json`);
}

// --- Inventario ---
const line = ({ id, g, a, brief, pieces, backdrop, emoji, usesPet }) => {
  const flow = g.element ?? 'Santuario';
  const pay = `${g.maxCoins} mon. / ${g.maxXp} xp / +${g.happiness}`;
  const marks = [
    a ? 'accesible ✓' : 'accesible —',
    usesPet ? 'Pockai ✓' : 'Pockai —',
    backdrop ? 'fondo ✓' : 'fondo —',
    `piezas ${pieces.length}`,
    emoji.length ? `emoji ${emoji.length}` : 'sin emoji',
    brief ? 'brief ✓' : 'brief —',
  ].join(' · ');
  const drop = g.itemDrop ? ` · suelta ${g.itemDrop.itemId}` : '';
  return `  ${id} «${g.name}» · ${flow} · ${g.durationSeconds} s (mín. ${g.minDurationSeconds}) · techo ${g.maxScorePerSecond} pt/s · ${pay}${drop}\n      ${marks}`;
};
console.log(`Minijuegos: ${rows.length}`);
const sanctuary = rows.filter((r) => !r.g.element);
const trials = rows.filter((r) => r.g.element);
console.log(`Juegos del Santuario (${sanctuary.length})`);
for (const r of sanctuary) if (!only || r.id === only) console.log(line(r));
console.log(`Pruebas de los Seis Flujos (${trials.length})`);
for (const r of trials) if (!only || r.id === only) console.log(line(r));

if (!only) {
  const gaps = [];
  for (const el of ELEMENTS) {
    const n = trials.filter((r) => r.g.element === el).length;
    if (n === 0) gaps.push(`El Flujo ${el} no tiene Prueba`);
  }
  const count = (fn) => rows.filter(fn).length;
  const noPet = count((r) => !r.usesPet);
  const withEmoji = count((r) => r.emoji.length);
  const noBackdrop = count((r) => !r.backdrop);
  const noBrief = count((r) => !r.brief);
  if (withEmoji) gaps.push(`${withEmoji} de ${rows.length} juegos todavía pintan emoji`);
  if (noPet) gaps.push(`${noPet} de ${rows.length} juegos no sacan al Pockai`);
  if (noBackdrop) gaps.push(`${noBackdrop} de ${rows.length} juegos sin fondo de arena`);
  if (noBrief) gaps.push(`${noBrief} de ${rows.length} juegos sin brief en docs/minijuegos/`);
  if (!rows.some((r) => !r.g.element && r.g.itemDrop)) gaps.push('Ningún juego del Santuario suelta un objeto');
  if (mg.requireReplay === false) gaps.push('requireReplay está en false: en los juegos sin Flujo la repetición no frena las trampas');
  if (gaps.length) {
    console.log(`\nHuecos (${gaps.length}):`);
    for (const g of gaps) console.log(`  · ${g}`);
  }
}
if (warnings.length) {
  console.log(`\nAvisos (${warnings.length}):`);
  for (const w of warnings) console.log(`  ! ${w}`);
}
if (errors.length) {
  console.error(`\nErrores (${errors.length}):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`\n✓ ${only ? `Minijuego ${only}` : 'Catálogo'} sin errores`);
