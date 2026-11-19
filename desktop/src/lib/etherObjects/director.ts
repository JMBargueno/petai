/**
 * Objetos del Éter: cosas interactivas que el Pockai saca del Éter, maneja con su hebra y devuelve
 * (el reloj del pomodoro es el primero). Este módulo es el director, puro y sin Svelte.
 *
 * Manda el ESTADO, no los eventos: quien usa el objeto dice qué quiere ver (`desired`: un modo,
 * p. ej. `'running'` / `'paused'`, o `null` = no está). El director compara con lo que se ve
 * (`displayed`) y lanza UN recado para igualarlos:
 * - `summon`: no estaba y ahora sí → el Pockai lo saca del Éter.
 * - `tap`: estaba y cambia de modo → el Pockai va y lo toca con su hebra.
 * - `banish`: estaba y ya no → el Pockai va y lo devuelve.
 *
 * Si `desired` cambia mientras un recado está en marcha (el usuario va más rápido que el Pockai),
 * el recado se aborta y se salta de golpe al estado pedido con el parpadeo rápido (`rush`). Durante
 * un rato después (`rushWindowMs`) cualquier otro cambio también va de golpe: no se encolan.
 */

/** Modo visible del objeto, o `null` si no está fuera del Éter. */
export type EtherWant = string | null;
export type ErrandKind = 'summon' | 'tap' | 'banish';

export interface Errand {
  seq: number;
  objectId: string;
  kind: ErrandKind;
  from: EtherWant;
  to: EtherWant;
  /** Se pone a `true` si el recado se abandona: quien lo ejecuta debe mirarlo tras cada espera. */
  aborted: boolean;
}

export interface DirectorHooks {
  /** Ejecuta el recado (con el Pockai o el objeto solo). Resuelve al terminar. */
  run(errand: Errand): Promise<void>;
  /** Salto de golpe: `from` es lo que se veía (o `null`), `to` lo pedido. Debe ser instantáneo. */
  rush(objectId: string, from: EtherWant, to: EtherWant): void;
  /** Lo que se ve del objeto ha cambiado (para pintarlo). */
  shown(objectId: string, want: EtherWant): void;
  now?(): number;
}

/** Qué recado hace falta para pasar de lo que se ve a lo que se pide. */
export function errandFor(displayed: EtherWant, desired: EtherWant): ErrandKind | null {
  if (displayed === desired) return null;
  if (displayed === null) return 'summon';
  if (desired === null) return 'banish';
  return 'tap';
}

interface ObjState {
  desired: EtherWant;
  displayed: EtherWant;
  inFlight: Errand | null;
  rushUntil: number;
}

export class EtherDirector {
  private readonly objects = new Map<string, ObjState>();
  private seq = 0;

  constructor(
    private readonly hooks: DirectorHooks,
    private readonly rushWindowMs = 900,
  ) {}

  private now(): number {
    return this.hooks.now ? this.hooks.now() : Date.now();
  }

  private obj(id: string): ObjState {
    let o = this.objects.get(id);
    if (!o) {
      o = { desired: null, displayed: null, inFlight: null, rushUntil: 0 };
      this.objects.set(id, o);
    }
    return o;
  }

  displayed(id: string): EtherWant {
    return this.obj(id).displayed;
  }

  desired(id: string): EtherWant {
    return this.obj(id).desired;
  }

  inFlight(id: string): Errand | null {
    return this.obj(id).inFlight;
  }

  setDesired(id: string, want: EtherWant): void {
    const o = this.obj(id);
    if (o.desired === want) return;
    o.desired = want;

    if (o.inFlight) {
      const e = o.inFlight;
      e.aborted = true;
      o.inFlight = null;
      // Si estaba saliendo del Éter ya se ve (a medias): cuenta como presente
      const visible = o.displayed !== null || e.kind === 'summon';
      // Siempre hay parpadeo: aunque lo pedido coincida con lo de antes, el objeto estaba a medias
      // (hundiéndose, saliendo) y hay que dejarlo en su sitio.
      this.jump(id, o, visible ? (o.displayed ?? e.to) : null, true);
      return;
    }
    if (this.now() < o.rushUntil) {
      this.jump(id, o, o.displayed, false);
      return;
    }
    this.pump(id);
  }

  /** El ejecutor avisa de que el cambio ya se ve (la hebra tocó el reloj) antes de terminar. */
  markShown(e: Errand): void {
    if (e.aborted) return;
    const o = this.obj(e.objectId);
    if (o.inFlight !== e || o.displayed === e.to) return;
    o.displayed = e.to;
    this.hooks.shown(e.objectId, e.to);
  }

  private jump(id: string, o: ObjState, from: EtherWant, force: boolean): void {
    o.rushUntil = this.now() + this.rushWindowMs;
    if (!force && from === o.desired) return;
    o.displayed = o.desired;
    this.hooks.rush(id, from, o.desired);
    this.hooks.shown(id, o.desired);
  }

  private pump(id: string): void {
    const o = this.obj(id);
    if (o.inFlight) return;
    const kind = errandFor(o.displayed, o.desired);
    if (!kind) return;
    const e: Errand = { seq: ++this.seq, objectId: id, kind, from: o.displayed, to: o.desired, aborted: false };
    o.inFlight = e;
    const finish = () => {
      if (e.aborted || o.inFlight !== e) return;
      o.inFlight = null;
      if (o.displayed !== e.to) {
        o.displayed = e.to;
        this.hooks.shown(id, e.to);
      }
      this.pump(id);
    };
    let p: Promise<void>;
    try {
      p = this.hooks.run(e);
    } catch {
      p = Promise.resolve();
    }
    p.then(finish, finish);
  }
}
