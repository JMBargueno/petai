/**
 * Objetos del Éter en el escritorio: estado que pinta `EtherObjectLayer`, los efectos ligados a cada
 * objeto (grieta, hebra, parpadeo) y la coreografía común que usan el Pockai y el objeto solo.
 *
 * Para añadir un objeto nuevo: un tipo en `kinds.ts` (componente y tamaño) y un adaptador que llame
 * a `registerEtherObject(id, kind, deseo$)` con un store de lo que debe verse. Ver
 * `.claude/skills/pockai-effect-architect/references/ether-objects.md`.
 */
import { get, writable, type Readable } from 'svelte/store';
import { EFFECTS, EffectPlayer, flowPalette, phasesOf, type EffectDef, type FxPalette } from '@pockai/scene/effects';
import { EtherDirector, type Errand, type EtherWant } from './director';

/** Cómo se ve el objeto ahora mismo (lo anima la capa con CSS). */
export type EtherLook = 'hidden' | 'emerging' | 'present' | 'sinking' | 'vanishing';

export interface EtherObjectView {
  id: string;
  kind: string;
  /** Centro del objeto en px de pantalla. */
  x: number;
  y: number;
  /** Ya tiene sitio (guardado o elegido por el Pockai al sacarlo). */
  placed: boolean;
  /** Modo que se ve (`null` = en el Éter). */
  shown: EtherWant;
  look: EtherLook;
  /** Sube cada vez que algo lo toca (la capa hace un destello). */
  flash: number;
  /** Tamaño en px (de `kinds.ts`), para colocarlo y para que la hebra apunte bien. */
  w: number;
  h: number;
}

export interface EtherFx {
  key: number;
  objectId: string;
  def: EffectDef;
  player: EffectPlayer;
  params: Record<string, string | number>;
  /** Hebra: de dónde sale (px de pantalla). Su punta sigue al objeto en vivo. */
  from?: { x: number; y: number };
}

export const etherObjects = writable<Record<string, EtherObjectView>>({});
export const etherFx = writable<EtherFx[]>([]);
/** Rampa y semilla del Pockai (las pone PetView); sin Pockai, la neutra. */
export const etherPalette = writable<FxPalette>(flowPalette(null));
export const etherSeed = writable(7);

const reducedMotion =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
export const etherReduced = reducedMotion;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Lo que tarda el objeto en salir o hundirse por la grieta (CSS de la capa). */
export const EMERGE_MS = reducedMotion ? 160 : 420;
export const VANISH_MS = 160;

// ---------- Estado de cada objeto ----------

function patch(id: string, p: Partial<EtherObjectView>) {
  etherObjects.update((all) => (all[id] ? { ...all, [id]: { ...all[id], ...p } } : all));
}

export function getEtherObject(id: string): EtherObjectView | undefined {
  return get(etherObjects)[id];
}

const posKey = (kind: string) => `petai:ether_pos:${kind}`;

function loadPos(kind: string): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(posKey(kind));
    if (!raw) return null;
    const p = JSON.parse(raw);
    return typeof p?.x === 'number' && typeof p?.y === 'number' ? p : null;
  } catch {
    return null;
  }
}

/** Mantiene el objeto entero dentro de la pantalla. */
export function clampToScreen(o: { w: number; h: number }, x: number, y: number) {
  const W = window.innerWidth || 800;
  const H = window.innerHeight || 600;
  return {
    x: Math.min(Math.max(o.w / 2 + 4, x), W - o.w / 2 - 4),
    y: Math.min(Math.max(o.h / 2 + 4, y), H - o.h / 2 - 4),
  };
}

/** Mueve el objeto (arrastre). Con `persist`, recuerda el sitio para la próxima vez. */
export function setEtherPosition(id: string, x: number, y: number, persist = false) {
  const o = getEtherObject(id);
  if (!o) return;
  const p = clampToScreen(o, x, y);
  patch(id, { ...p, placed: true });
  if (persist) {
    try {
      localStorage.setItem(posKey(o.kind), JSON.stringify(p));
    } catch {
      /* sin almacenamiento: solo se pierde el sitio */
    }
  }
}

/** Si el objeto aún no tiene sitio, se lo da quien lo saca (junto al Pockai). */
export function placeIfUnplaced(id: string, x: number, y: number) {
  const o = getEtherObject(id);
  if (o && !o.placed) setEtherPosition(id, x, y);
}

// ---------- Efectos ligados a un objeto ----------

let fxSeq = 0;
/** Quién espera cada efecto en curso (para despertarlo si se retira antes de tiempo). */
const removers = new Map<number, () => void>();

/**
 * Lanza un efecto sobre un objeto. `onHold` recibe al reproductor y debe soltarlo; la promesa
 * termina al acabar el efecto o si se retira (parpadeo de un recado abortado).
 */
export function playObjectFx(
  objectId: string,
  effectId: string,
  params: Record<string, string | number> = {},
  opts: { onHold?: (p: EffectPlayer) => void; from?: { x: number; y: number } } = {},
): Promise<void> {
  const def = EFFECTS[effectId];
  if (!def) return Promise.resolve();
  const key = ++fxSeq;
  return new Promise<void>((resolve) => {
    const player = new EffectPlayer(phasesOf(def, params, reducedMotion), (phase) => {
      if (phase === 'hold') (opts.onHold ? opts.onHold(player) : player.release(performance.now()));
      if (phase === 'done') {
        etherFx.update((all) => all.filter((f) => f.key !== key));
        removers.delete(key);
        resolve();
      }
    });
    player.start(performance.now());
    etherFx.update((all) => [...all, { key, objectId, def, player, params, from: opts.from }]);
    removers.set(key, resolve);
  });
}

/** Quita de golpe los efectos de un objeto (y despierta a quien los esperaba). */
export function clearObjectFx(objectId: string) {
  const gone = get(etherFx).filter((f) => f.objectId === objectId);
  if (!gone.length) return;
  etherFx.update((all) => all.filter((f) => f.objectId !== objectId));
  for (const f of gone) {
    removers.get(f.key)?.();
    removers.delete(f.key);
  }
}

// ---------- Coreografía común (la usan el Pockai y el objeto solo) ----------

/** El objeto sale por una grieta del Éter. */
export function riftOut(e: Errand): Promise<void> {
  return playObjectFx(e.objectId, 'grieta-objeto', { dir: 'out' }, {
    onHold: async (player) => {
      if (!e.aborted) {
        patch(e.objectId, { look: 'emerging', shown: e.to });
        director.markShown(e);
        await wait(EMERGE_MS);
        if (!e.aborted) patch(e.objectId, { look: 'present' });
      }
      player.release(performance.now());
    },
  });
}

/** El objeto se hunde en una grieta del Éter. */
export function riftIn(e: Errand): Promise<void> {
  return playObjectFx(e.objectId, 'grieta-objeto', { dir: 'in' }, {
    onHold: async (player) => {
      if (!e.aborted) {
        patch(e.objectId, { look: 'sinking' });
        await wait(EMERGE_MS);
        if (!e.aborted) {
          patch(e.objectId, { look: 'hidden', shown: null });
          director.markShown(e);
        }
      }
      player.release(performance.now());
    },
  });
}

/**
 * Hebra desde `from` (la patita del Pockai) hasta el objeto. `touched` se cumple cuando la punta
 * llega; la hebra se queda tocando `holdMs` y se recoge sola.
 */
export function castThread(e: Errand, from: { x: number; y: number }, holdMs = 260): { touched: Promise<void>; done: Promise<void> } {
  let touch: () => void = () => {};
  const touched = new Promise<void>((r) => (touch = r));
  const done = playObjectFx(e.objectId, 'hebra-toque', {}, {
    from,
    onHold: async (player) => {
      touch();
      await wait(holdMs);
      player.release(performance.now());
    },
  });
  // Si la retiran antes de tocar, que nadie se quede esperando
  void done.then(() => touch());
  return { touched, done };
}

/** El toque se nota en el objeto: destello y nuevo modo visible. */
export function touchObject(e: Errand) {
  if (e.aborted) return;
  const o = getEtherObject(e.objectId);
  patch(e.objectId, { shown: e.to, flash: (o?.flash ?? 0) + 1 });
  director.markShown(e);
}

/** Recado sin Pockai: el objeto sale, cambia o se va él solo. */
async function runSolo(e: Errand): Promise<void> {
  if (e.kind === 'summon') {
    const o = getEtherObject(e.objectId);
    if (o && !o.placed) {
      setEtherPosition(e.objectId, (window.innerWidth || 800) - o.w / 2 - 48, (window.innerHeight || 600) * 0.35);
    }
    await riftOut(e);
  } else if (e.kind === 'tap') {
    void playObjectFx(e.objectId, 'parpadeo-eter', { dir: 'out' });
    touchObject(e);
  } else {
    await riftIn(e);
  }
}

// ---------- Ejecutor: el Pockai si puede, si no el objeto solo ----------

/** Lo registra PetView. Devuelve `null` si ahora el Pockai no puede ir (lo hace el objeto solo). */
export type PetErrandRunner = (e: Errand) => Promise<void> | null;
let petRunner: PetErrandRunner | null = null;

export function setPetErrandRunner(fn: PetErrandRunner | null): () => void {
  petRunner = fn;
  return () => {
    if (petRunner === fn) petRunner = null;
  };
}

const vanishTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const director = new EtherDirector({
  run(e) {
    return petRunner?.(e) ?? runSolo(e);
  },
  rush(id, from, to) {
    clearObjectFx(id);
    const prev = vanishTimers.get(id);
    if (prev) clearTimeout(prev);
    const o = getEtherObject(id);
    if (to === null) {
      if (from !== null) {
        void playObjectFx(id, 'parpadeo-eter', { dir: 'in' });
        patch(id, { look: 'vanishing', shown: null });
        vanishTimers.set(
          id,
          setTimeout(() => patch(id, { look: 'hidden' }), VANISH_MS),
        );
      } else {
        patch(id, { look: 'hidden', shown: null });
      }
    } else {
      if (o && !o.placed) setEtherPosition(id, (window.innerWidth || 800) - o.w / 2 - 48, (window.innerHeight || 600) * 0.35);
      void playObjectFx(id, 'parpadeo-eter', { dir: 'out' });
      patch(id, { look: 'present', shown: to, flash: (o?.flash ?? 0) + 1 });
    }
  },
  shown(id, want) {
    // Lo visible ya lo ponen la coreografía o el salto; aquí solo se asegura el final
    const o = getEtherObject(id);
    if (!o) return;
    if (want === null && o.look === 'present') patch(id, { look: 'hidden', shown: null });
    else if (want !== null) patch(id, { shown: want, ...(o.look === 'hidden' ? { look: 'present' as const } : {}) });
  },
  now: () => performance.now(),
});

/**
 * Da de alta un objeto del Éter y lo ata a su deseo: cada valor del store se pasa al director.
 * Devuelve la baja.
 */
export function registerEtherObject(id: string, kind: string, size: { w: number; h: number }, desired: Readable<EtherWant>): () => void {
  const saved = loadPos(kind);
  etherObjects.update((all) => ({
    ...all,
    [id]: {
      id,
      kind,
      x: saved?.x ?? 0,
      y: saved?.y ?? 0,
      placed: !!saved,
      shown: null,
      look: 'hidden',
      flash: 0,
      ...size,
    },
  }));
  if (saved) setEtherPosition(id, saved.x, saved.y);
  const unsub = desired.subscribe((want) => director.setDesired(id, want));
  return () => {
    unsub();
    director.setDesired(id, null);
    etherObjects.update((all) => {
      const { [id]: _gone, ...rest } = all;
      return rest;
    });
  };
}
