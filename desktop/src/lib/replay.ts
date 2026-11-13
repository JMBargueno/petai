// Convierte el registro de una pelea (`replay`) en fotogramas para animarlo.
// Es una función pura: el visor solo reproduce lo que el servidor simuló, no recalcula nada.

export type FrameKind = 'start' | 'round' | 'hit' | 'miss' | 'heal' | 'guard' | 'status' | 'dot' | 'faint' | 'end';

export interface Frame {
  kind: FrameKind;
  text: string;
  /** Vida de [atacante, defensor] tras este fotograma. */
  hp: [number, number];
  round: number;
  actor?: 0 | 1;
  target?: 0 | 1;
  damage?: number;
  crit?: boolean;
  mult?: number;
  /** Solo en 'end': 0 atacante, 1 defensor, null empate. */
  winner?: 0 | 1 | null;
}

export interface ReplayLog {
  version: number;
  seed: number;
  participants: [ReplayParticipant, ReplayParticipant];
  events: any[];
}

export interface ReplayParticipant {
  name: string;
  speciesId: string;
  element: string;
  level: number;
  maxHp: number;
  skills: string[];
  strategy: string;
  isBot: boolean;
}

const STATUS_TEXT: Record<string, string> = {
  burn: 'se quema 🔥',
  slow: 'se ralentiza 🐌',
  sap: 'pierde defensa 🍂',
  guard: 'se protege 🛡',
};

export function buildFrames(log: ReplayLog, skillName: (id: string) => string): Frame[] {
  const [p0, p1] = log.participants;
  const name = (i: 0 | 1) => (i === 0 ? p0.name : p1.name);
  let hp: [number, number] = [p0.maxHp, p1.maxHp];
  let round = 0;
  const frames: Frame[] = [
    { kind: 'start', text: `¡${p0.name} contra ${p1.name}!`, hp: [...hp] as [number, number], round },
  ];
  const push = (f: Omit<Frame, 'hp' | 'round'>) => frames.push({ ...f, hp: [...hp] as [number, number], round });

  for (const ev of log.events) {
    switch (ev.t) {
      case 'round':
        round = ev.n;
        push({ kind: 'round', text: `Ronda ${ev.n}` });
        break;
      case 'move': {
        hp = ev.hp;
        const actor = ev.actor as 0 | 1;
        const target = (1 - actor) as 0 | 1;
        const skill = skillName(ev.skill);
        if (!ev.hit) {
          push({ kind: 'miss', actor, target, text: `${name(actor)} usa ${skill}… ¡falla!` });
        } else {
          const extra = [ev.crit ? '¡Golpe crítico!' : '', ev.mult > 1 ? '¡Muy eficaz!' : ev.mult < 1 ? 'Poco eficaz…' : ''].filter(Boolean).join(' ');
          push({
            kind: 'hit', actor, target, damage: ev.damage, crit: !!ev.crit, mult: ev.mult,
            text: `${name(actor)} usa ${skill}: −${ev.damage} ${extra}`.trim(),
          });
        }
        break;
      }
      case 'heal':
        hp = ev.hp;
        push({ kind: 'heal', actor: ev.actor, text: `${name(ev.actor)} usa ${skillName(ev.skill)} y recupera ${ev.amount}`, damage: ev.amount });
        break;
      case 'guard':
        push({ kind: 'guard', actor: ev.actor, text: `${name(ev.actor)} usa ${skillName(ev.skill)}: ${STATUS_TEXT.guard}` });
        break;
      case 'status':
        push({ kind: 'status', target: ev.target, text: `${name(ev.target)} ${STATUS_TEXT[ev.kind] ?? ev.kind}` });
        break;
      case 'dot':
        hp = ev.hp;
        push({ kind: 'dot', target: ev.target, damage: ev.damage, text: `${name(ev.target)} sufre ${ev.damage} de quemadura 🔥` });
        break;
      case 'faint':
        push({ kind: 'faint', target: ev.actor, text: `${name(ev.actor)} cae derrotado` });
        break;
      case 'end': {
        hp = ev.hp;
        const text =
          ev.winner === null
            ? '¡Empate!'
            : ev.reason === 'rounds'
              ? `¡Gana ${name(ev.winner)} por vida restante!`
              : `¡Gana ${name(ev.winner)}!`;
        push({ kind: 'end', text, winner: ev.winner });
        break;
      }
    }
  }
  return frames;
}
