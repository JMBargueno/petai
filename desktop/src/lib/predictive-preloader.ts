/**
 * PredictivePreloader del desktop (feature 009-edge-cdn, T015/T016).
 *
 * Pre-carga en background (prioridad `low`, concurrencia limitada, sin bloquear la UI) los assets:
 *   - de la PRÓXIMA etapa de evolución del pet (umbrales data-driven de `balance.leveling.stages`,
 *     p. ej. 1/10/25/50; nunca hard-coded — FR-008), y
 *   - de un evento próximo (solo si `startsAt < 2h` y `assetPrefix` no es `null` — AC5).
 *
 * Solo pre-carga la especie actual + la próxima etapa (no todas las especies — SC-007). Se activa
 * por **eventos locales** del cliente (cambio de nivel, evento próximo); **sin** WS nuevos (T016).
 * Deduplica usando `AssetLoader.isCached(key)` para no re-descargar.
 */
import { AssetLoader } from './asset-loader';
import type { LevelingStages } from './game-data.client';

export type StageName = 'juvenile' | 'adult' | 'final';

export interface PreloadDecision {
  /** Etapa de evolución a pre-cargar (p. ej. `juvenile`). */
  stage?: StageName;
  /** Prefijo de assets de un evento próximo (p. ej. `event/winter2026/`). */
  eventPrefix?: string;
  /** `key`s del manifest a pre-cargar. */
  keys: string[];
  /** Prioridad de pre-carga (siempre `low`). */
  priority: 'low';
}

export interface PetState {
  speciesId: string;
  stage: string;
  level: number;
}

export interface UpcomingEvent {
  startsAt: string;
  assetPrefix?: string | null;
}

export interface PredictivePreloaderOptions {
  /** Mapea `(speciesId, stage)` → `key`s a pre-cargar para esa etapa (data-driven). */
  spriteKeysFor?: (speciesId: string, stage: string) => string[];
  /** Ventana de pre-carga de eventos (ms). Por defecto 2 h. */
  eventWindowMs?: number;
  /** Máximo de descargas concurrentes (low). Por defecto 3. */
  concurrency?: number;
  /** Reloj (para tests). Por defecto `Date.now`. */
  now?: () => number;
}

/** Orden canónico de etapas (de menor a mayor). */
const STAGE_ORDER = ['baby', 'juvenile', 'adult', 'final'] as const;
const DEFAULT_EVENT_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 h

export class PredictivePreloader {
  private readonly eventWindowMs: number;
  private readonly concurrency: number;
  private readonly now: () => number;
  private readonly spriteKeysFor: (speciesId: string, stage: string) => string[];

  constructor(
    private readonly loader: AssetLoader,
    private readonly stages: LevelingStages,
    opts: PredictivePreloaderOptions = {},
  ) {
    this.eventWindowMs = opts.eventWindowMs ?? DEFAULT_EVENT_WINDOW_MS;
    this.concurrency = Math.max(1, opts.concurrency ?? 3);
    this.now = opts.now ?? (() => Date.now());
    // Por defecto: las `key`s de los sprites de la especie para cada animación. La app puede
    // sobreescribir con el mapeo real de `shared/game-data` (etapa → sprites).
    this.spriteKeysFor =
      opts.spriteKeysFor ??
      ((speciesId, _stage) =>
        ['idle', 'eat', 'happy', 'sleep'].map((anim) => `sprites/${speciesId}_${anim}`));
  }

  /**
   * Evalúa el estado del pet y devuelve la decisión de pre-carga de la PRÓXIMA etapa (una sola, la
   * inmediata: no pre-carga más allá de la próxima — SC-007). `[]` si ya está en la etapa final.
   */
  evaluate(pet: PetState): PreloadDecision[] {
    const next = this.nextStageForLevel(pet.level);
    if (!next) return [];
    const keys = this.spriteKeysFor(pet.speciesId, next);
    return [{ stage: next, keys, priority: 'low' }];
  }

  /**
   * Pre-carga los assets de un evento próximo si `startsAt < eventWindowMs` (2h) y `assetPrefix` no
   * es `null` (AC5). Devuelve `null` si no toca pre-cargar.
   */
  async enqueueEvent(evt: UpcomingEvent): Promise<PreloadDecision | null> {
    if (!evt.assetPrefix) return null;
    const starts = Date.parse(evt.startsAt);
    if (Number.isNaN(starts)) return null;
    const now = this.now();
    if (starts > now + this.eventWindowMs) return null; // aún no entra en la ventana
    if (starts < now - this.eventWindowMs) return null; // ya fuera de la ventana

    const keys = this.keysUnderPrefix(evt.assetPrefix);
    if (keys.length === 0) return null;
    return { eventPrefix: evt.assetPrefix, keys, priority: 'low' };
  }

  /**
   * Ejecuta las decisiones: descarga las `key`s con prioridad `low` y concurrencia limitada,
   * saltando las que ya están en caché (dedup). No bloquea el hilo principal.
   */
  async execute(
    decisions: PreloadDecision[],
  ): Promise<{ loaded: number; skipped: number; failed: number }> {
    const all = new Set<string>();
    for (const d of decisions) for (const k of d.keys) all.add(k);

    // Dedup: solo las que no están en caché local.
    const toLoad: string[] = [];
    for (const k of all) if (!(await this.loader.isCached(k))) toLoad.push(k);
    const skipped = all.size - toLoad.length;

    let loaded = 0;
    let failed = 0;
    await this.runWithConcurrency(toLoad, this.concurrency, async (key) => {
      try {
        await this.loader.loadAsset(key, { priority: 'low' });
        loaded++;
      } catch {
        failed++;
      }
    });

    return { loaded, skipped, failed };
  }

  /**
   * Integración con el estado local del pet (T016): al cambiar el nivel, re-evalúa y pre-carga la
   * próxima etapa. Se llama desde el store/reactive del pet (eventos **locales**, sin WS).
   */
  async onLevelChanged(pet: PetState): Promise<{ loaded: number; skipped: number; failed: number }> {
    return this.execute(this.evaluate(pet));
  }

  /** `true` si el pet aún no está en la etapa final (queda una evolución por pre-cargar). */
  isEvolvingSoon(pet: PetState): boolean {
    return this.nextStageForLevel(pet.level) !== null;
  }

  // --- helpers ---

  /** La etapa más cercana que el pet aún NO ha alcanzado (la "próxima"). `null` si es final. */
  private nextStageForLevel(level: number): StageName | null {
    for (const name of STAGE_ORDER) {
      const threshold = this.stages[name];
      if (threshold !== undefined && level < threshold) return name as StageName;
    }
    return null;
  }

  /** `key`s del manifest que empiezan por `prefix` (los assets del evento). */
  private keysUnderPrefix(prefix: string): string[] {
    const p = prefix.replace(/\/?$/, '');
    return this.loader.listKeys().filter((k) => k.startsWith(p));
  }

  /** Ejecuta `task` sobre cada elemento con un máximo de `limit` en paralelo. */
  private async runWithConcurrency<T>(
    items: T[],
    limit: number,
    task: (item: T) => Promise<void>,
  ): Promise<void> {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        await task(items[i]);
      }
    });
    await Promise.all(workers);
  }
}