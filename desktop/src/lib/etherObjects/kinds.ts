/**
 * Tipos de objeto del Éter: qué componente los pinta, su tamaño en px (sin contar los controles que
 * asoman al pasar el ratón) y qué dice el Pockai al tocarlos. Un objeto nuevo = una entrada aquí +
 * su adaptador (store de lo que debe verse) dado de alta en `EtherObjectLayer`.
 */
import type { ComponentType } from 'svelte';
import PomodoroClock from '../../components/ether/PomodoroClock.svelte';
import type { ErrandKind, EtherWant } from './director';
import { pomodoroClockLine } from './pomodoroClock';

export interface EtherKind {
  component: ComponentType;
  w: number;
  h: number;
  /** Habilidad del Pockai que le deja hacer los recados (sin ella, el objeto actúa solo). */
  skill?: string;
  /** Frase corta del Pockai al terminar un recado que deja el objeto en `to` (o `null` para callar). */
  line(kind: ErrandKind, to: EtherWant): string | null;
}

export const ETHER_KINDS: Record<string, EtherKind> = {
  'pomodoro-clock': { component: PomodoroClock, w: 96, h: 108, skill: 'pomodoro_companion', line: pomodoroClockLine },
};
